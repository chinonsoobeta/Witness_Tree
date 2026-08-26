#!/usr/bin/env python3
"""Feature-bounded, windowed zonal aggregation for Phase 2 categorical rasters.

This is intentionally the opposite of vectorizing a national raster: it reads
one input boundary feature, transforms that one geometry to the raster CRS,
then rasterizes only the finite pixel windows intersecting its bounding box.
The worker never writes per-cell geometries, national polygon layers, or a
pixel-to-boundary join table.
"""
import argparse
import hashlib
import json
import math
import os
import resource
import sys
import tempfile
import time
from datetime import datetime, timezone

import numpy as np
from osgeo import gdal, ogr, osr

gdal.UseExceptions()
ogr.UseExceptions()
GDAL_CACHE_BYTES = 256 * 1024 * 1024
gdal.SetCacheMax(GDAL_CACHE_BYTES)
# Shapefile rings carry the format's clockwise/counter-clockwise semantics.
# Trusting that orientation avoids quadratic ring-containment inference on the
# detailed national cartographic boundary file without simplifying geometry.
gdal.SetConfigOption("OGR_ORGANIZE_POLYGONS", "ONLY_CCW")
NODATA = 255
ROW_WINDOW = 2048
# Wide finite stripes avoid traversing a complex provincial geometry once per
# small square tile. The mask is capped at 64 MiB (2048 * 32768 bytes).
COLUMN_WINDOW = 32768


def sha256(path):
    # OGR can open a ZIP datasource through /vsizip/. Bind the complete
    # archive so DBF/PRJ/SHX drift is covered alongside the geometry.
    if path.startswith("/vsizip/"):
        archive = path[len("/vsizip/"):]
        marker = archive.lower().find(".zip/")
        if marker >= 0:
            archive = archive[:marker + 4]
        path = archive
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require_text(value, label):
    if not value or not value.strip():
        raise RuntimeError(f"{label} is required")


def allocated_bytes(path):
    stat = os.stat(path)
    blocks = getattr(stat, "st_blocks", 0)
    return blocks * 512 if blocks else stat.st_size


def pixel_window(dataset, envelope):
    # Handles north-up rasters only; rotated grids need a documented resampling
    # path before aggregation rather than a misleading bounding-box shortcut.
    gt = dataset.GetGeoTransform()
    if gt[2] != 0 or gt[4] != 0:
        raise RuntimeError("Rotated raster grids are not supported by this bounded-window worker.")
    x0, px, _, y0, _, py = gt
    if px <= 0 or py >= 0:
        raise RuntimeError("Raster must use a north-up projected grid with positive X and negative Y pixels.")
    min_x, max_x, min_y, max_y = envelope
    left = math.floor((min_x - x0) / px)
    right = math.ceil((max_x - x0) / px)
    top = math.floor((max_y - y0) / py)
    bottom = math.ceil((min_y - y0) / py)
    left, right = max(0, left), min(dataset.RasterXSize, right)
    top, bottom = max(0, top), min(dataset.RasterYSize, bottom)
    return left, top, right - left, bottom - top


def create_feature_mask(geometry, crs_wkt, transform, xoff, yoff, width, height):
    descriptor, path = tempfile.mkstemp(prefix="witness-tree-zonal-mask-", suffix=".tif")
    os.close(descriptor)
    os.unlink(path)
    memory = layer_ds = layer = feature = None
    try:
        memory = gdal.GetDriverByName("GTiff").Create(
            path, width, height, 1, gdal.GDT_Byte,
            options=["TILED=YES", "BLOCKXSIZE=512", "BLOCKYSIZE=512", "COMPRESS=DEFLATE", "SPARSE_OK=YES", "BIGTIFF=YES"])
        gt = list(transform)
        gt[0] += xoff * gt[1] + yoff * gt[2]
        gt[3] += xoff * gt[4] + yoff * gt[5]
        memory.SetGeoTransform(gt)
        memory.SetProjection(crs_wkt)
        layer_ds = ogr.GetDriverByName("MEM").CreateDataSource("")
        working_ref = osr.SpatialReference()
        working_ref.ImportFromWkt(crs_wkt)
        layer = layer_ds.CreateLayer("feature", srs=working_ref, geom_type=ogr.wkbUnknown)
        feature = ogr.Feature(layer.GetLayerDefn())
        feature.SetGeometry(geometry)
        layer.CreateFeature(feature)
        gdal.RasterizeLayer(memory, [1], layer, burn_values=[1])
        memory.FlushCache()
        feature = layer = layer_ds = memory = None
        dataset = gdal.Open(path, gdal.GA_ReadOnly)
        if dataset is None:
            raise RuntimeError("Cannot reopen the bounded feature mask")
        return path, dataset, allocated_bytes(path)
    except Exception:
        feature = layer = layer_ds = memory = None
        if os.path.exists(path):
            os.unlink(path)
        raise


def aggregate_feature(forest_mask, change_raster, geometry):
    xoff, yoff, width, height = pixel_window(forest_mask, geometry.GetEnvelope())
    if width <= 0 or height <= 0:
        return 0, 0, 0, 0, 0
    forest_band, change_band = forest_mask.GetRasterBand(1), change_raster.GetRasterBand(1)
    known, loss, unknown, outside_denominator_loss = 0, 0, 0, 0
    mask_path, mask_dataset, scratch_bytes = create_feature_mask(
        geometry, forest_mask.GetProjection(), forest_mask.GetGeoTransform(), xoff, yoff, width, height)
    try:
        mask_band = mask_dataset.GetRasterBand(1)
        for row in range(0, height, ROW_WINDOW):
            for column in range(0, width, COLUMN_WINDOW):
                rows = min(ROW_WINDOW, height - row)
                cols = min(COLUMN_WINDOW, width - column)
                mask = mask_band.ReadAsArray(column, row, cols, rows).astype(bool)
                forest = forest_band.ReadAsArray(xoff + column, yoff + row, cols, rows)
                change = change_band.ReadAsArray(xoff + column, yoff + row, cols, rows)
                for values, label in [(forest, "Forest mask"), (change, "Change raster")]:
                    if np.any((values != 0) & (values != 1) & (values != NODATA)):
                        raise RuntimeError(f"{label} values must be exactly 0, 1, or 255.")
                selected_forest, selected_change = forest[mask], change[mask]
                # A multi-year interval can contain forest that appeared after the
                # first-year denominator snapshot and was subsequently lost. Keep
                # it visible, but never add it to this first-year forest share.
                outside_denominator_loss += int(np.count_nonzero((selected_forest == 0) & (selected_change == 1)))
                unknown += int(np.count_nonzero((selected_forest == NODATA) | (selected_change == NODATA)))
                eligible = (selected_forest == 1) & (selected_change != NODATA)
                known += int(np.count_nonzero(eligible))
                loss += int(np.count_nonzero(eligible & (selected_change == 1)))
    finally:
        mask_dataset = None
        if os.path.exists(mask_path):
            os.unlink(mask_path)
    return known, loss, unknown, outside_denominator_loss, scratch_bytes


parser = argparse.ArgumentParser()
parser.add_argument("--forest-mask", required=True)
parser.add_argument("--change-raster", required=True)
parser.add_argument("--boundaries", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--sidecar", required=True)
parser.add_argument("--boundary-id-field", default="id")
parser.add_argument("--boundary-edition", required=True)
parser.add_argument("--forest-mask-version", required=True)
parser.add_argument("--change-raster-version", required=True)
parser.add_argument("--time-version", required=True)
parser.add_argument("--source-version", required=True)
parser.add_argument("--code-version", required=True)
parser.add_argument("--boundary-classification", choices=["authoritative-boundary", "illustrative"], required=True)
parser.add_argument("--admission-status", choices=["admitted", "not-admitted"], required=True)
parser.add_argument("--admission-record")
parser.add_argument("--production-claim", action="store_true")
args = parser.parse_args()

if os.path.exists(args.output) or os.path.exists(args.sidecar):
    raise RuntimeError("Refusing to overwrite an existing zonal output or sidecar.")
for value, label in [(args.boundary_edition, "boundary edition"), (args.forest_mask_version, "forest-mask version"), (args.change_raster_version, "change-raster version"), (args.time_version, "time version"), (args.source_version, "source version"), (args.code_version, "code version")]:
    require_text(value, label)
if args.production_claim and (args.boundary_classification != "authoritative-boundary" or args.admission_status != "admitted" or not args.admission_record or not args.admission_record.strip()):
    raise RuntimeError("A production claim requires authoritative geometry and an admitted input record.")

forest_mask = gdal.Open(args.forest_mask, gdal.GA_ReadOnly)
change_raster = gdal.Open(args.change_raster, gdal.GA_ReadOnly)
if forest_mask is None or change_raster is None:
    raise RuntimeError("Cannot open the forest mask or change raster")
for dataset, label in [(forest_mask, "Forest mask"), (change_raster, "Change raster")]:
    band = dataset.GetRasterBand(1)
    if band.DataType != gdal.GDT_Byte or band.GetNoDataValue() != NODATA:
        raise RuntimeError(f"{label} must be a Byte categorical raster with nodata exactly 255.")
if (forest_mask.RasterXSize != change_raster.RasterXSize or forest_mask.RasterYSize != change_raster.RasterYSize or
        tuple(forest_mask.GetGeoTransform()) != tuple(change_raster.GetGeoTransform()) or forest_mask.GetProjection() != change_raster.GetProjection()):
    raise RuntimeError("Forest mask and change raster must share one exact grid, CRS, and geotransform.")
crs_wkt = forest_mask.GetProjection()
if not crs_wkt:
    raise RuntimeError("Raster CRS is required")
spatial_ref = osr.SpatialReference(); spatial_ref.ImportFromWkt(crs_wkt)
if spatial_ref.IsGeographic():
    raise RuntimeError("Raster must use a projected CRS so hectare denominators are meaningful.")
linear_units = spatial_ref.GetLinearUnits()
if not math.isclose(linear_units, 1.0, rel_tol=0, abs_tol=1e-12):
    raise RuntimeError("Raster CRS must have metre linear units for hectare denominators.")
cell_hectares = abs(forest_mask.GetGeoTransform()[1] * forest_mask.GetGeoTransform()[5]) / 10000.0
if cell_hectares <= 0:
    raise RuntimeError("Raster must have positive cell area")

boundaries = ogr.Open(args.boundaries, 0)
if boundaries is None:
    raise RuntimeError("Cannot open boundary vector")
layer = boundaries.GetLayer(0)
boundary_driver = boundaries.GetDriver().GetName()
boundary_read_policy = "shapefile-ring-orientation-only-ccw" if boundary_driver == "ESRI Shapefile" else "driver-default"
source_ref = layer.GetSpatialRef()
if source_ref is None:
    raise RuntimeError("Boundary source CRS is required")
same_crs = bool(source_ref.IsSame(spatial_ref))
transformer = None if same_crs else osr.CoordinateTransformation(source_ref, spatial_ref)
rows = []
maximum_scratch_bytes = 0
started_at = datetime.now(timezone.utc)
started_monotonic = time.monotonic()
for feature in layer:
    boundary_id = feature.GetField(args.boundary_id_field)
    if boundary_id is None or not str(boundary_id).strip():
        raise RuntimeError(f"Every boundary must have a non-empty {args.boundary_id_field} field")
    geometry = feature.GetGeometryRef()
    if geometry is None or geometry.IsEmpty():
        raise RuntimeError(f"Boundary {boundary_id} has no geometry")
    geometry = geometry.Clone()
    if transformer:
        geometry.Transform(transformer)
    known, loss, unknown, outside_denominator_loss, scratch_bytes = aggregate_feature(forest_mask, change_raster, geometry)
    maximum_scratch_bytes = max(maximum_scratch_bytes, scratch_bytes)
    known_ha, loss_ha, unknown_ha = known * cell_hectares, loss * cell_hectares, unknown * cell_hectares
    rows.append({
        "boundaryId": str(boundary_id),
        "knownForestedHectares": known_ha,
        "lossHectares": loss_ha,
        "unknownRequiredInputHectares": unknown_ha,
        "observedLossOutsideFirstYearForestHectares": outside_denominator_loss * cell_hectares,
        "coverageGrade": "complete" if unknown == 0 else "partial-with-unknown",
        "observedLossPercent": None if known == 0 else (loss / known) * 100,
    })
if not rows:
    raise RuntimeError("Boundary vector has no features")
with open(args.output, "w", encoding="utf-8") as target:
    json.dump(rows, target, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
output_bytes = os.path.getsize(args.output)
completed_at = datetime.now(timezone.utc)
peak_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
peak_rss_bytes = int(peak_rss if sys.platform == "darwin" else peak_rss * 1024)
sidecar = {
    "schemaVersion": "phase2-zonal-aggregation-v1",
    "algorithm": "windowed-bounded-feature-rasterization",
    "nationalPerCellGeometryMaterialized": False,
    "input": {
        "boundaryEdition": args.boundary_edition, "boundaryIdField": args.boundary_id_field, "forestMaskVersion": args.forest_mask_version, "changeRasterVersion": args.change_raster_version,
        "timeVersion": args.time_version, "sourceVersion": args.source_version,
        "forestMaskSha256": sha256(args.forest_mask), "changeRasterSha256": sha256(args.change_raster), "boundarySha256": sha256(args.boundaries),
        "gridCrs": crs_wkt, "gridCrsSha256": hashlib.sha256(crs_wkt.encode()).hexdigest(),
        "boundarySourceCrs": source_ref.ExportToWkt(), "boundaryWorkingCrs": crs_wkt,
        "boundaryGeometryReadPolicy": boundary_read_policy,
        "reprojection": "identical-crs" if same_crs else "reprojected",
        "reprojectionEvidence": None if same_crs else "OSR CoordinateTransformation boundary source CRS -> raster CRS",
        "boundaryClassification": args.boundary_classification,
        "admissionStatus": args.admission_status, "admissionRecord": args.admission_record,
    },
    "outputSha256": sha256(args.output), "outputByteLength": output_bytes,
    "execution": {
        "codeVersion": args.code_version, "workerSha256": sha256(os.path.realpath(__file__)),
        "startedAt": started_at.isoformat().replace("+00:00", "Z"),
        "completedAt": completed_at.isoformat().replace("+00:00", "Z"),
        "elapsedSeconds": time.monotonic() - started_monotonic,
        "peakRssBytes": peak_rss_bytes, "maximumScratchAllocatedBytes": maximum_scratch_bytes,
        "featureCount": len(rows),
        "parameters": {"rowWindow": ROW_WINDOW, "columnWindow": COLUMN_WINDOW, "gdalCacheBytes": GDAL_CACHE_BYTES, "nodata": NODATA, "cellHectares": cell_hectares},
        "environment": {"pythonVersion": sys.version.split()[0], "gdalVersion": gdal.VersionInfo("--version"), "numpyVersion": np.__version__},
    },
    "rows": rows, "productionClaim": args.production_claim,
}
with open(args.sidecar, "w", encoding="utf-8") as target:
    json.dump(sidecar, target, ensure_ascii=False, indent=2, sort_keys=True)
