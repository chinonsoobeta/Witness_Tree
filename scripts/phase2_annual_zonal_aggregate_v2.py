#!/usr/bin/env python3
"""Bounded batch zonal summaries for the annual Phase 2 loss series.

The worker is intentionally raster-first.  It selects the four requested
province features, reprojects each geometry to the already-aligned raster
grid, and rasterizes each bounded feature mask exactly once.  The mask is then
reused while a bounded window is read from all 38 annual forest/loss pairs.
No national per-cell geometry, pixel-to-boundary table, or raster
reprojection is created.

The annual rows use the first-year forest mask as their denominator.  A
separate 1984 row is a forest-mask *snapshot* only; it has no loss period and
therefore no loss numerator or rate.  This is the only defensible baseline
semantics supported by the repository's first-year-of-range denominator
contract.

Every run also reads the land-cover product's mapped extent.  The forest masks
are 1 for forest and 0 for everything else, which cannot distinguish a cell the
product mapped and found no forest in from a cell the product never mapped at
all: the source writes 0 in both cases.  Without the extent, the settled south
and the prairies come back as zero forest and zero loss with complete coverage,
which is a fabricated zero rather than a measurement.  Unmapped area is counted
as Unknown, so those districts report what is actually true about them, which is
that nobody looked.

This is a separate file rather than an edit to phase2_annual_zonal_aggregate.py
because that worker's sha256 is bound into the comparison receipt for the
already-admitted province aggregate, and the fractional-correction worker
re-hashes it before trusting that aggregate.  Editing it in place would break a
binding whose entire job is to prove which code produced an admitted number.
The v1 worker is frozen at the revision that produced it; new runs use this one.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import resource
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from osgeo import gdal, ogr, osr


gdal.UseExceptions()
ogr.UseExceptions()

NODATA = 255
ROW_WINDOW = 2048
COLUMN_WINDOW = 32768
GDAL_CACHE_BYTES = 256 * 1024 * 1024
gdal.SetCacheMax(GDAL_CACHE_BYTES)
gdal.SetConfigOption("OGR_ORGANIZE_POLYGONS", "ONLY_CCW")

PAIR_YEARS = tuple((year, year + 1) for year in range(1984, 2022))
TARGETS = (("BC", "59"), ("AB", "48"), ("ON", "35"), ("QC", "24"))
TARGET_IDS = frozenset(boundary_id for _province, boundary_id in TARGETS)


def fail(message: str) -> None:
    raise RuntimeError(message)


def require_text(value: str | None, label: str) -> None:
    if value is None or not value.strip():
        fail(f"{label} is required")


def sha256(path: str) -> str:
    """Hash a local file, or the complete archive behind a /vsizip path."""

    source = path
    if source.startswith("/vsizip/"):
        archive = source[len("/vsizip/"):]
        marker = archive.lower().find(".zip/")
        if marker >= 0:
            source = archive[: marker + 4]
    digest = hashlib.sha256()
    with open(source, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def local_source_path(path: str) -> str:
    if path.startswith("/vsizip/"):
        archive = path[len("/vsizip/"):]
        marker = archive.lower().find(".zip/")
        if marker >= 0:
            return archive[: marker + 4]
    return path


def file_bytes(path: str) -> int:
    return os.stat(local_source_path(path)).st_size


def allocated_bytes(path: str) -> int:
    stat_result = os.stat(path)
    blocks = getattr(stat_result, "st_blocks", 0)
    return blocks * 512 if blocks else stat_result.st_size


def canonical_id(value: Any) -> str:
    """Normalize OGR numeric/string PRUID values without changing IDs."""

    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    text = str(value).strip()
    if text.endswith(".0") and text[:-2].isdigit():
        return text[:-2]
    if text.isdigit():
        return str(int(text))
    return text


def grid(dataset: gdal.Dataset) -> tuple[Any, ...]:
    band = dataset.GetRasterBand(1)
    return (
        dataset.RasterXSize,
        dataset.RasterYSize,
        tuple(dataset.GetGeoTransform()),
        dataset.GetProjection(),
        band.DataType,
        band.GetNoDataValue(),
    )


def validate_raster_metadata(dataset: gdal.Dataset, label: str) -> None:
    if dataset.RasterCount != 1:
        fail(f"{label} must have exactly one raster band")
    band = dataset.GetRasterBand(1)
    if band.DataType != gdal.GDT_Byte:
        fail(f"{label} must be a Byte categorical raster")
    nodata = band.GetNoDataValue()
    if nodata != NODATA:
        fail(f"{label} nodata must be exactly 255")
    transform = dataset.GetGeoTransform()
    if transform[2] != 0 or transform[4] != 0:
        fail("Rotated raster grids are not supported by this bounded worker")
    if transform[1] <= 0 or transform[5] >= 0:
        fail("Raster must be north-up with positive X and negative Y pixels")


def validate_exact_grid(reference: gdal.Dataset, candidate: gdal.Dataset, label: str) -> None:
    validate_raster_metadata(candidate, label)
    if grid(reference) != grid(candidate):
        fail(f"{label} does not have the exact reference grid, CRS, geotransform, and nodata")


def validate_projected_metre_grid(dataset: gdal.Dataset) -> float:
    projection = dataset.GetProjection()
    if not projection:
        fail("Raster CRS is required")
    spatial_ref = osr.SpatialReference()
    spatial_ref.ImportFromWkt(projection)
    if spatial_ref.IsGeographic():
        fail("Raster must use a projected CRS so hectare denominators are meaningful")
    linear_units = spatial_ref.GetLinearUnits()
    if not math.isclose(linear_units, 1.0, rel_tol=0, abs_tol=1e-12):
        fail("Raster CRS must have metre linear units for hectare denominators")
    transform = dataset.GetGeoTransform()
    cell_hectares = abs(transform[1] * transform[5]) / 10000.0
    if cell_hectares <= 0:
        fail("Raster must have positive cell area")
    return cell_hectares


def pixel_window(dataset: gdal.Dataset, envelope: tuple[float, ...]) -> tuple[int, int, int, int]:
    transform = dataset.GetGeoTransform()
    x0, px, _rotation_x, y0, _rotation_y, py = transform
    min_x, max_x, min_y, max_y = envelope
    left = math.floor((min_x - x0) / px)
    right = math.ceil((max_x - x0) / px)
    # py is negative, so the top edge is the larger Y value.
    top = math.floor((max_y - y0) / py)
    bottom = math.ceil((min_y - y0) / py)
    left = max(0, left)
    right = min(dataset.RasterXSize, right)
    top = max(0, top)
    bottom = min(dataset.RasterYSize, bottom)
    return left, top, max(0, right - left), max(0, bottom - top)


def create_feature_mask(
    geometry: ogr.Geometry,
    crs_wkt: str,
    transform: tuple[float, ...],
    xoff: int,
    yoff: int,
    width: int,
    height: int,
) -> tuple[str, gdal.Dataset, int]:
    descriptor, path = tempfile.mkstemp(prefix="witness-tree-annual-zonal-mask-", suffix=".tif")
    os.close(descriptor)
    os.unlink(path)
    target = layer_ds = layer = feature = None
    try:
        target = gdal.GetDriverByName("GTiff").Create(
            path,
            width,
            height,
            1,
            gdal.GDT_Byte,
            options=[
                "TILED=YES",
                "BLOCKXSIZE=512",
                "BLOCKYSIZE=512",
                "COMPRESS=DEFLATE",
                "SPARSE_OK=YES",
                "BIGTIFF=YES",
            ],
        )
        if target is None:
            fail("Cannot create the bounded feature mask")
        local_transform = list(transform)
        local_transform[0] += xoff * local_transform[1] + yoff * local_transform[2]
        local_transform[3] += xoff * local_transform[4] + yoff * local_transform[5]
        target.SetGeoTransform(local_transform)
        target.SetProjection(crs_wkt)
        memory_driver = ogr.GetDriverByName("MEM") or ogr.GetDriverByName("Memory")
        if memory_driver is None:
            fail("GDAL has no in-memory OGR driver")
        layer_ds = memory_driver.CreateDataSource("")
        working_ref = osr.SpatialReference()
        working_ref.ImportFromWkt(crs_wkt)
        layer = layer_ds.CreateLayer("feature", srs=working_ref, geom_type=ogr.wkbUnknown)
        feature = ogr.Feature(layer.GetLayerDefn())
        feature.SetGeometry(geometry)
        layer.CreateFeature(feature)
        gdal.RasterizeLayer(target, [1], layer, burn_values=[1])
        target.FlushCache()
        target = layer = layer_ds = feature = None
        reopened = gdal.Open(path, gdal.GA_ReadOnly)
        if reopened is None:
            fail("Cannot reopen the bounded feature mask")
        return path, reopened, allocated_bytes(path)
    except Exception:
        target = layer = layer_ds = feature = None
        if os.path.exists(path):
            os.unlink(path)
        raise


@dataclass(frozen=True)
class PairInput:
    from_year: int
    to_year: int
    forest_path: str
    loss_path: str


def resolve_path(value: str, base: Path) -> str:
    if value.startswith("/vsi") or os.path.isabs(value):
        return value
    return str((base / value).resolve())


def read_manifest(path: str) -> tuple[list[tuple[int, str]], list[PairInput], dict[str, Any]]:
    manifest_path = Path(path).resolve()
    with manifest_path.open("r", encoding="utf-8") as stream:
        manifest = json.load(stream)
    if not isinstance(manifest, dict):
        fail("Input manifest must be a JSON object")
    base = manifest_path.parent
    masks_raw = manifest.get("forestMasks")
    pairs_raw = manifest.get("pairs")
    losses_raw = manifest.get("annualLossRasters", manifest.get("lossRasters"))
    masks: list[tuple[int, str]] = []
    pairs: list[PairInput] = []
    if isinstance(pairs_raw, list):
        for entry in pairs_raw:
            if not isinstance(entry, dict):
                fail("Each manifest pair must be an object")
            from_year = int(entry.get("fromYear"))
            to_year = int(entry.get("toYear"))
            forest = entry.get("forestMask", entry.get("forestPath"))
            loss = entry.get("annualLossRaster", entry.get("lossRaster", entry.get("changeRaster")))
            if not isinstance(forest, str) or not isinstance(loss, str):
                fail("Each manifest pair requires forestMask and annualLossRaster paths")
            pairs.append(PairInput(from_year, to_year, resolve_path(forest, base), resolve_path(loss, base)))
        # A pair manifest already carries the 38 first-year masks.  Keep the
        # first occurrence for the baseline and reject contradictory repeats.
        by_year: dict[int, str] = {}
        for pair in pairs:
            prior = by_year.setdefault(pair.from_year, pair.forest_path)
            if prior != pair.forest_path:
                fail(f"Conflicting forest masks for {pair.from_year}")
        masks = sorted(by_year.items())
    else:
        if not isinstance(masks_raw, list) or not isinstance(losses_raw, list):
            fail("Manifest requires forestMasks and annualLossRasters, or pairs")
        for entry in masks_raw:
            if not isinstance(entry, dict) or not isinstance(entry.get("year"), int) or not isinstance(entry.get("path"), str):
                fail("Each forestMasks entry requires integer year and path")
            masks.append((entry["year"], resolve_path(entry["path"], base)))
        for entry in losses_raw:
            if not isinstance(entry, dict):
                fail("Each annualLossRasters entry must be an object")
            if not isinstance(entry.get("fromYear"), int) or not isinstance(entry.get("toYear"), int) or not isinstance(entry.get("path"), str):
                fail("Each annualLossRasters entry requires fromYear, toYear, and path")
            pairs.append(PairInput(entry["fromYear"], entry["toYear"], "", resolve_path(entry["path"], base)))
        mask_by_year = dict(masks)
        for index, pair in enumerate(pairs):
            if pair.from_year not in mask_by_year:
                fail(f"No forest mask is bound to annual pair {pair.from_year}-{pair.to_year}")
            pairs[index] = PairInput(pair.from_year, pair.to_year, mask_by_year[pair.from_year], pair.loss_path)
    return masks, pairs, {"manifestPath": str(manifest_path), "manifestSha256": sha256(str(manifest_path))}


def pattern_inputs(
    forest_dir: str,
    loss_dir: str,
    forest_pattern: str,
    loss_pattern: str,
) -> tuple[list[tuple[int, str]], list[PairInput], dict[str, Any]]:
    forest_root = Path(forest_dir).resolve()
    loss_root = Path(loss_dir).resolve()
    masks = [
        (year, str((forest_root / forest_pattern.format(year=year, from_year=year, to_year=year)).resolve()))
        for year in range(1984, 2022)
    ]
    pairs = [
        PairInput(
            from_year,
            to_year,
            masks[from_year - 1984][1],
            str((loss_root / loss_pattern.format(year=from_year, from_year=from_year, to_year=to_year)).resolve()),
        )
        for from_year, to_year in PAIR_YEARS
    ]
    return masks, pairs, {}


def validate_schedule(masks: list[tuple[int, str]], pairs: list[PairInput]) -> None:
    expected_years = list(range(1984, 2022))
    sorted_masks = sorted(masks)
    mask_years = [year for year, _path in sorted_masks]
    # The historical raster batch also contains a 2022 snapshot. It is not a
    # first-year denominator for any requested pair, so accept that one extra
    # snapshot and keep only the 1984..2021 masks used below.
    if mask_years == expected_years + [2022]:
        masks[:] = sorted_masks[:-1]
        mask_years = expected_years
    if len(masks) != 38 or mask_years != expected_years:
        fail("Exactly one first-year forest mask is required for every year 1984 through 2021 (an optional 2022 snapshot is ignored)")
    expected_pairs = list(PAIR_YEARS)
    observed_pairs = [(pair.from_year, pair.to_year) for pair in sorted(pairs, key=lambda row: row.from_year)]
    if len(pairs) != 38 or observed_pairs != expected_pairs:
        fail("Exactly the 38 adjacent annual pairs 1984-1985 through 2021-2022 are required")
    if len({path for _year, path in masks}) != len(masks):
        fail("Forest-mask paths must be unique")
    if len({pair.loss_path for pair in pairs}) != len(pairs):
        fail("Annual loss-raster paths must be unique")
    mask_by_year = dict(masks)
    for pair in pairs:
        if pair.forest_path != mask_by_year[pair.from_year]:
            fail(f"Annual pair {pair.from_year}-{pair.to_year} is not aligned to its first-year forest mask")


def open_inputs(pairs: list[PairInput]) -> tuple[list[gdal.Dataset], list[gdal.Dataset]]:
    forests: list[gdal.Dataset] = []
    losses: list[gdal.Dataset] = []
    for pair in pairs:
        forest = gdal.Open(pair.forest_path, gdal.GA_ReadOnly)
        loss = gdal.Open(pair.loss_path, gdal.GA_ReadOnly)
        if forest is None or loss is None:
            fail(f"Cannot open annual pair {pair.from_year}-{pair.to_year}")
        forests.append(forest)
        losses.append(loss)
    return forests, losses


def validate_values(array: np.ndarray, label: str) -> None:
    if np.any((array != 0) & (array != 1) & (array != NODATA)):
        fail(f"{label} values must be exactly 0, 1, or 255")


def validate_extent_values(array: np.ndarray) -> None:
    # The extent raster is a two-state answer to "did the product map this
    # cell", so a 0 in it would be a third state nothing here knows how to read.
    if np.any((array != 1) & (array != NODATA)):
        fail("Mapped-extent values must be exactly 1 or 255")


def empty_stats() -> dict[str, int]:
    return {"known": 0, "loss": 0, "unknown": 0, "outside": 0, "unmapped": 0, "cells": 0}


def round_area(value: int, cell_hectares: float) -> float:
    return round(value * cell_hectares, 6)


def make_row(
    province: str,
    boundary_id: str,
    row_type: str,
    cell_hectares: float,
    stats: dict[str, int],
    *,
    from_year: int | None = None,
    to_year: int | None = None,
    baseline_year: int | None = None,
    boundary_name: str | None = None,
) -> dict[str, Any]:
    known = round_area(stats["known"], cell_hectares)
    known_loss = round_area(stats["loss"], cell_hectares) if row_type == "annual" else None
    # A known-part subtotal is useful, but it is not a complete provincial
    # total when any required input cell is Unknown. Keep the complete value
    # null rather than silently treating the unobserved area as zero loss.
    loss = known_loss if row_type == "annual" and stats["unknown"] == 0 else None
    unknown = round_area(stats["unknown"], cell_hectares)
    unmapped = round_area(stats["unmapped"], cell_hectares)
    outside = round_area(stats["outside"], cell_hectares) if row_type == "annual" else None
    # A district the product never mapped is a different answer from one it
    # mapped in part, and both are different from a complete measurement. The
    # reader is owed which of the three this row is.
    if stats["unknown"] == 0:
        grade = "complete"
    elif stats["cells"] > 0 and stats["unmapped"] == stats["cells"]:
        grade = "none-mapped"
    else:
        grade = "partial-with-unknown"
    return {
        "boundaryId": boundary_id,
        # Present only for district runs. Statutory district names are carried
        # verbatim, em dashes and all: 204 of the 343 federal names contain one,
        # and altering statutory text to fit a repository convention would make
        # the row describe a district that does not exist.
        **({} if boundary_name is None else {"boundaryName": boundary_name}),
        "province": province,
        "rowType": row_type,
        "baselineYear": baseline_year,
        "fromYear": from_year,
        "toYear": to_year,
        "temporalSemantics": (
            "1984 forest-mask snapshot only; no annual loss period or loss value is assigned"
            if row_type == "baseline"
            else f"{from_year}-{to_year} adjacent annual pair; denominator is the {from_year} first-year forest-mask snapshot"
        ),
        "knownForestedHectares": known,
        "lossHectares": loss,
        "knownObservedLossHectares": known_loss,
        "unknownRequiredInputHectares": unknown,
        "unmappedByProductExtentHectares": unmapped,
        "districtHectares": round_area(stats["cells"], cell_hectares),
        "observedLossOutsideFirstYearForestHectares": outside,
        "coverageGrade": grade,
        "observedLossPercent": None if row_type == "baseline" or stats["known"] == 0 or stats["unknown"] > 0 else round(stats["loss"] / stats["known"] * 100, 6),
    }


def main(args: argparse.Namespace) -> None:
    if os.path.exists(args.output) or os.path.exists(args.sidecar):
        fail("Refusing to overwrite an existing annual zonal output or sidecar")
    for value, label in [
        (args.boundary_edition, "boundary edition"),
        (args.forest_mask_version, "forest-mask version"),
        (args.change_raster_version, "change-raster version"),
        (args.time_version, "time version"),
        (args.source_version, "source version"),
        (args.code_version, "code version"),
    ]:
        require_text(value, label)
    if args.production_claim:
        fail("Annual batch worker is permanently nonproduction; production claims are not supported")
    if args.admission_status != "not-admitted":
        fail("Annual batch worker is permanently non-admitted")
    if args.admission_record and args.admission_record.strip():
        fail("Annual batch worker does not accept an admission record")
    if args.all_features and not args.jurisdiction.strip():
        fail("--all-features requires --jurisdiction, so every row says which authority drew the boundary")
    if not args.all_features and args.jurisdiction.strip():
        fail("--jurisdiction applies only to --all-features runs")

    if args.manifest:
        masks, pairs, manifest_binding = read_manifest(args.manifest)
    else:
        if not args.forest_mask_dir or not args.annual_loss_dir:
            fail("Use --manifest or both --forest-mask-dir and --annual-loss-dir")
        masks, pairs, manifest_binding = pattern_inputs(
            args.forest_mask_dir,
            args.annual_loss_dir,
            args.forest_mask_pattern,
            args.annual_loss_pattern,
        )
    validate_schedule(masks, pairs)
    pairs = sorted(pairs, key=lambda row: row.from_year)

    forests, losses = open_inputs(pairs)
    reference = forests[0]
    validate_raster_metadata(reference, "Forest mask 1984")
    cell_hectares = validate_projected_metre_grid(reference)
    for pair, forest, loss in zip(pairs, forests, losses):
        validate_exact_grid(reference, forest, f"Forest mask {pair.from_year}")
        validate_exact_grid(reference, loss, f"Annual loss raster {pair.from_year}-{pair.to_year}")
    extent_dataset = gdal.Open(args.mapped_extent, gdal.GA_ReadOnly)
    if extent_dataset is None:
        fail("Cannot open the mapped-extent raster")
    validate_exact_grid(reference, extent_dataset, "Mapped extent")

    crs_wkt = reference.GetProjection()
    spatial_ref = osr.SpatialReference()
    spatial_ref.ImportFromWkt(crs_wkt)
    boundaries = ogr.Open(args.boundaries, 0)
    if boundaries is None:
        fail("Cannot open boundary vector")
    layer = boundaries.GetLayer(0)
    source_ref = layer.GetSpatialRef()
    if source_ref is None:
        fail("Boundary source CRS is required")
    boundary_driver = boundaries.GetDriver().GetName()
    boundary_read_policy = "shapefile-ring-orientation-only-ccw" if boundary_driver == "ESRI Shapefile" else "driver-default"
    transformer = None if source_ref.IsSame(spatial_ref) else osr.CoordinateTransformation(source_ref, spatial_ref)
    geometries: dict[str, ogr.Geometry] = {}
    names: dict[str, str] = {}
    source_feature_count = 0
    for feature in layer:
        source_feature_count += 1
        boundary_id = canonical_id(feature.GetField(args.boundary_id_field))
        if not args.all_features and boundary_id not in TARGET_IDS:
            continue
        geometry_ref = feature.GetGeometryRef()
        if geometry_ref is None or geometry_ref.IsEmpty():
            fail(f"Boundary {boundary_id} has no geometry")
        geometry = geometry_ref.Clone()
        if not geometry.IsValid():
            # A multipart district can arrive with self-touching rings from the
            # publisher. Repairing is not the same as accepting: a buffer(0)
            # that changes the area materially would silently move the
            # denominator, so the repaired geometry has to agree with the
            # original to within a tolerance far below one 30 m cell.
            repaired = geometry.Buffer(0)
            if repaired is None or repaired.IsEmpty() or not repaired.IsValid():
                fail(f"Boundary {boundary_id} has invalid geometry that could not be repaired")
            before, after = geometry.GetArea(), repaired.GetArea()
            if before <= 0 or abs(after - before) / before > 1e-9:
                fail(f"Boundary {boundary_id} repair changed its area from {before} to {after}")
            geometry = repaired
        if transformer is not None:
            geometry.Transform(transformer)
        feature_name = None
        if args.boundary_name_field:
            raw = feature.GetField(args.boundary_name_field)
            if raw is None or not str(raw).strip():
                fail(f"Boundary {boundary_id} has no value in {args.boundary_name_field}")
            feature_name = str(raw).strip()
        if boundary_id in geometries:
            # Multipart districts are published as one feature per part in some
            # sources. Union rather than refuse, so a district split across
            # islands is summarized once, as one district.
            merged = geometries[boundary_id].Union(geometry)
            if merged is None or merged.IsEmpty() or not merged.IsValid():
                fail(f"Boundary {boundary_id} appears more than once and could not be merged")
            if feature_name != names.get(boundary_id):
                fail(f"Multipart boundary {boundary_id} has conflicting values in {args.boundary_name_field}")
            geometries[boundary_id] = merged
            continue
        geometries[boundary_id] = geometry
        if feature_name is not None:
            names[boundary_id] = feature_name
    if args.all_features:
        if not geometries:
            fail("No boundary features were read")
        # Sorted so the checksum-bound output is stable no matter how the source
        # layer happens to be ordered.
        targets = tuple((args.jurisdiction, boundary_id) for boundary_id in sorted(geometries))
    else:
        targets = TARGETS
        missing = TARGET_IDS - geometries.keys()
        if missing:
            fail(f"Target authoritative boundaries are missing: {', '.join(sorted(missing))}")

    started_at = datetime.now(timezone.utc)
    started_monotonic = time.monotonic()
    rows: list[dict[str, Any]] = []
    maximum_scratch_bytes = 0
    mask_rasterization_count = 0
    processed_window_count = 0
    input_hash_cache: dict[str, str] = {}
    input_stat_cache: dict[str, int] = {}

    def describe(path: str, kind: str, **years: int) -> dict[str, Any]:
        if path not in input_hash_cache:
            input_hash_cache[path] = sha256(path)
            input_stat_cache[path] = file_bytes(path)
        return {"kind": kind, "path": path, "byteLength": input_stat_cache[path], "sha256": input_hash_cache[path], **years}

    # Geometry order is fixed to make the checksum-bound JSON stable even if
    # the source boundary layer is ordered differently.
    for province, boundary_id in targets:
        geometry = geometries[boundary_id]
        xoff, yoff, width, height = pixel_window(reference, geometry.GetEnvelope())
        stats_by_pair = [empty_stats() for _ in pairs]
        baseline_stats = empty_stats()
        if width > 0 and height > 0:
            mask_path, mask_dataset, scratch_bytes = create_feature_mask(
                geometry,
                crs_wkt,
                reference.GetGeoTransform(),
                xoff,
                yoff,
                width,
                height,
            )
            maximum_scratch_bytes = max(maximum_scratch_bytes, scratch_bytes)
            mask_rasterization_count += 1
            try:
                mask_band = mask_dataset.GetRasterBand(1)
                extent_band = extent_dataset.GetRasterBand(1)
                forest_bands = [dataset.GetRasterBand(1) for dataset in forests]
                loss_bands = [dataset.GetRasterBand(1) for dataset in losses]
                for row in range(0, height, ROW_WINDOW):
                    for column in range(0, width, COLUMN_WINDOW):
                        rows_in_window = min(ROW_WINDOW, height - row)
                        columns_in_window = min(COLUMN_WINDOW, width - column)
                        mask = mask_band.ReadAsArray(column, row, columns_in_window, rows_in_window)
                        if mask is None:
                            fail("Cannot read bounded boundary mask")
                        mask = mask.astype(bool)
                        if not np.any(mask):
                            continue
                        processed_window_count += 1
                        # The extent does not vary by year, so it is read once
                        # per window rather than once per pair.
                        extent = extent_band.ReadAsArray(xoff + column, yoff + row, columns_in_window, rows_in_window)
                        if extent is None:
                            fail("Cannot read the mapped extent")
                        validate_extent_values(extent)
                        unmapped = extent[mask] == NODATA
                        unmapped_in_window = int(np.count_nonzero(unmapped))
                        cells_in_window = int(np.count_nonzero(mask))
                        baseline_stats["unmapped"] += unmapped_in_window
                        baseline_stats["cells"] += cells_in_window
                        baseline_stats["unknown"] += unmapped_in_window
                        for stats in stats_by_pair:
                            stats["unmapped"] += unmapped_in_window
                            stats["cells"] += cells_in_window
                            stats["unknown"] += unmapped_in_window
                        for index, (forest_band, loss_band, pair) in enumerate(zip(forest_bands, loss_bands, pairs)):
                            forest = forest_band.ReadAsArray(xoff + column, yoff + row, columns_in_window, rows_in_window)
                            loss = loss_band.ReadAsArray(xoff + column, yoff + row, columns_in_window, rows_in_window)
                            if forest is None or loss is None:
                                fail(f"Cannot read annual pair {pair.from_year}-{pair.to_year}")
                            validate_values(forest, f"Forest mask {pair.from_year}")
                            validate_values(loss, f"Annual loss raster {pair.from_year}-{pair.to_year}")
                            selected_forest = forest[mask]
                            selected_loss = loss[mask]
                            baseline_stats["known"] += int(np.count_nonzero(selected_forest == 1)) if index == 0 else 0
                            baseline_stats["unknown"] += int(np.count_nonzero((selected_forest == NODATA) & ~unmapped)) if index == 0 else 0
                            stats = stats_by_pair[index]
                            stats["outside"] += int(np.count_nonzero((selected_forest == 0) & (selected_loss == 1) & ~unmapped))
                            stats["unknown"] += int(np.count_nonzero(((selected_forest == NODATA) | (selected_loss == NODATA)) & ~unmapped))
                            eligible = (selected_forest == 1) & (selected_loss != NODATA) & ~unmapped
                            stats["known"] += int(np.count_nonzero(eligible))
                            stats["loss"] += int(np.count_nonzero(eligible & (selected_loss == 1)))
            finally:
                mask_dataset = None
                if os.path.exists(mask_path):
                    os.unlink(mask_path)
        rows.append(
            make_row(
                province,
                boundary_id,
                "baseline",
                cell_hectares,
                baseline_stats,
                baseline_year=1984,
                boundary_name=names.get(boundary_id),
            )
        )
        for pair, stats in zip(pairs, stats_by_pair):
            rows.append(
                make_row(
                    province,
                    boundary_id,
                    "annual",
                    cell_hectares,
                    stats,
                    from_year=pair.from_year,
                    to_year=pair.to_year,
                    boundary_name=names.get(boundary_id),
                )
            )

    output_parent = os.path.dirname(os.path.abspath(args.output))
    if output_parent and not os.path.isdir(output_parent):
        fail(f"Output directory does not exist: {output_parent}")
    with open(args.output, "x", encoding="utf-8") as target:
        json.dump(rows, target, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    output_bytes = os.path.getsize(args.output)
    completed_at = datetime.now(timezone.utc)
    peak_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    peak_rss_bytes = int(peak_rss if sys.platform == "darwin" else peak_rss * 1024)

    forest_descriptors = [describe(path, "forest-mask", year=year) for year, path in sorted(masks)]
    loss_descriptors = [describe(pair.loss_path, "annual-loss", fromYear=pair.from_year, toYear=pair.to_year) for pair in pairs]
    sidecar = {
        # v2 adds the mapped extent, so a reader can tell an unmapped district
        # from one that was measured and holds no forest.
        "schemaVersion": "phase2-annual-province-zonal-aggregation-v2",
        "status": "local-nonproduction-executed",
        "algorithm": "windowed-bounded-batch-feature-mask-rasterization",
        "nationalPerCellGeometryMaterialized": False,
        "claims": {"admitted": False, "released": False, "productionEligible": False, "externalAction": False},
        "input": {
            "boundaryEdition": args.boundary_edition,
            "boundaryIdField": args.boundary_id_field,
            "targetProvinces": [{"province": province, "boundaryId": boundary_id} for province, boundary_id in targets],
            "boundaryClassification": args.boundary_classification,
            "admissionStatus": "not-admitted",
            "admissionRecord": None,
            "boundarySourceCrs": source_ref.ExportToWkt(),
            "boundaryWorkingCrs": crs_wkt,
            "boundaryGeometryReadPolicy": boundary_read_policy,
            "reprojection": "identical-crs" if transformer is None else "reprojected",
            "reprojectionEvidence": None if transformer is None else "OSR CoordinateTransformation boundary source CRS -> raster CRS",
            "boundaries": {"path": args.boundaries, "byteLength": file_bytes(args.boundaries), "sha256": sha256(args.boundaries), "sourceFeatureCount": source_feature_count, "targetFeatureCount": len(targets)},
            "forestMaskVersion": args.forest_mask_version,
            "changeRasterVersion": args.change_raster_version,
            "timeVersion": args.time_version,
            "sourceVersion": args.source_version,
            "forestMasks": forest_descriptors,
            "annualLossRasters": loss_descriptors,
            "mappedExtent": {
                **describe(args.mapped_extent, "mapped-extent"),
                "meaning": "1 where the land-cover product mapped the cell; 255 where it did not, which makes forest and loss Unknown rather than zero.",
            },
            "grid": {
                "width": reference.RasterXSize,
                "height": reference.RasterYSize,
                "geotransform": list(reference.GetGeoTransform()),
                "crs": crs_wkt,
                "crsSha256": hashlib.sha256(crs_wkt.encode()).hexdigest(),
                "dataType": "Byte",
                "nodata": NODATA,
                "cellHectares": cell_hectares,
            },
            **manifest_binding,
        },
        "output": {"path": args.output, "byteLength": output_bytes, "sha256": sha256(args.output)},
        "temporalSemantics": {
            "annualPairCount": 38,
            "firstYear": 1984,
            "lastYear": 2022,
            "annualRows": "Each loss row is one adjacent pair from Y to Y+1; denominator is the Y forest mask.",
            "baselineRow": "The 1984 row is a forest-mask snapshot denominator only. It has no loss period, loss numerator, outside-denominator loss, or rate.",
            "baselineContractBasis": "phase2-method-parameters aggregation.denominatorReference=first-year-of-range",
            "baselineComputed": True,
            "baselineUncomputedReason": None,
        },
        "execution": {
            "codeVersion": args.code_version,
            "workerSha256": sha256(os.path.realpath(__file__)),
            "startedAt": started_at.isoformat().replace("+00:00", "Z"),
            "completedAt": completed_at.isoformat().replace("+00:00", "Z"),
            "elapsedSeconds": time.monotonic() - started_monotonic,
            "peakRssBytes": peak_rss_bytes,
            "maximumScratchAllocatedBytes": maximum_scratch_bytes,
            "featureCount": len(targets),
            "annualPairCount": len(pairs),
            "maskRasterizationCount": mask_rasterization_count,
            "processedWindowCount": processed_window_count,
            "parameters": {"rowWindow": ROW_WINDOW, "columnWindow": COLUMN_WINDOW, "gdalCacheBytes": GDAL_CACHE_BYTES, "nodata": NODATA, "cellHectares": cell_hectares},
            "environment": {"pythonVersion": sys.version.split()[0], "gdalVersion": gdal.VersionInfo("--version"), "numpyVersion": np.__version__},
        },
        "rows": rows,
        "productionClaim": False,
        "admitted": False,
        "released": False,
        "productionEligible": False,
    }
    with open(args.sidecar, "x", encoding="utf-8") as target:
        json.dump(sidecar, target, ensure_ascii=False, indent=2, sort_keys=True)


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description=__doc__)
    command.add_argument("--forest-mask-dir")
    command.add_argument("--annual-loss-dir", "--change-raster-dir", "--loss-dir", dest="annual_loss_dir")
    command.add_argument("--forest-mask-pattern", default="forest-mask-{year}.tif")
    command.add_argument("--annual-loss-pattern", "--change-raster-pattern", "--loss-pattern", dest="annual_loss_pattern", default="detected-forest-loss-{from_year}-{to_year}.tif")
    command.add_argument("--manifest", "--input-manifest", help="JSON schedule containing forestMasks/annualLossRasters or pairs")
    command.add_argument("--boundaries", required=True)
    command.add_argument("--mapped-extent", required=True, help="Raster that is 1 where the land-cover product mapped the cell and 255 where it did not")
    command.add_argument("--output", required=True)
    command.add_argument("--sidecar", required=True)
    command.add_argument("--boundary-id-field", default="PRUID")
    command.add_argument("--boundary-name-field", help="Field carrying the district name, recorded verbatim on every row")
    command.add_argument("--all-features", action="store_true", help="Summarize every feature in the layer rather than the four province targets")
    command.add_argument("--jurisdiction", default="", help="Label recorded in each row's province field when --all-features is used")
    command.add_argument("--boundary-edition", required=True)
    command.add_argument("--forest-mask-version", required=True)
    command.add_argument("--change-raster-version", required=True)
    command.add_argument("--time-version", required=True)
    command.add_argument("--source-version", required=True)
    command.add_argument("--code-version", required=True)
    command.add_argument("--boundary-classification", choices=["authoritative-boundary", "illustrative"], default="authoritative-boundary")
    command.add_argument("--admission-status", choices=["admitted", "not-admitted"], default="not-admitted")
    command.add_argument("--admission-record")
    command.add_argument("--production-claim", action="store_true")
    return command


if __name__ == "__main__":
    main(parser().parse_args())
