#!/usr/bin/env python3
"""Apply an isolated fractional-area correction to a binary annual zonal run.

The historical annual worker uses GDAL's default (cell-centre) rasterization.
This worker deliberately leaves that worker and its output untouched.  It
verifies the historical JSON output/sidecar and the exact raster and boundary
bindings, then visits only cells touched by a rasterized boundary line.  For
each such cell it subtracts the historical centre-membership contribution and
adds the contribution multiplied by the exact OGR polygon/cell intersection
fraction.  Interior cells are not re-aggregated.

The result and provenance are new, write-once, local, nonproduction artifacts.
No admission, release, or production claim is accepted or emitted.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import os
import resource
import stat
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from osgeo import gdal, ogr, osr


gdal.UseExceptions()
ogr.UseExceptions()
gdal.SetConfigOption("OGR_ORGANIZE_POLYGONS", "ONLY_CCW")
GDAL_CACHE_BYTES = 256 * 1024 * 1024
gdal.SetCacheMax(GDAL_CACHE_BYTES)

NODATA = 255
ROW_WINDOW = 2048
COLUMN_WINDOW = 32768
FRACTION_EPSILON = 1e-9
FIRST_YEAR = 1984
LAST_YEAR = 2022
PAIR_YEARS = tuple((year, year + 1) for year in range(FIRST_YEAR, LAST_YEAR))
TARGETS = (("BC", "59"), ("AB", "48"), ("ON", "35"), ("QC", "24"))
TARGET_IDS = frozenset(boundary_id for _province, boundary_id in TARGETS)

BINARY_SCHEMA = "phase2-annual-province-zonal-aggregation-v1"
BINARY_STATUS = "local-nonproduction-executed"
BINARY_ALGORITHM = "windowed-bounded-batch-feature-mask-rasterization"
CORRECTION_SCHEMA = "phase2-annual-province-zonal-fractional-correction-v1"
CORRECTION_STATUS = "local-nonproduction-fractional-correction"
CORRECTION_ALGORITHM = "center-membership-subtraction-exact-polygon-cell-intersection-addition"


def fail(message: str) -> None:
    raise RuntimeError(message)


def require_text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        fail(f"{label} is required")
    return value


def require_hash(value: Any, label: str) -> str:
    if not isinstance(value, str) or len(value) != 64 or any(char not in "0123456789abcdef" for char in value):
        fail(f"{label} must be a lowercase SHA-256 digest")
    return value


def local_source_path(path: str) -> str:
    """Return the local archive path for a normal or /vsizip/ datasource."""

    if path.startswith("/vsizip/"):
        archive = path[len("/vsizip/"):]
        marker = archive.lower().find(".zip/")
        if marker >= 0:
            return archive[: marker + 4]
    return path


def binding_path(path: str) -> str:
    source = local_source_path(path)
    if source.startswith("/vsi"):
        return source
    return str(Path(source).expanduser().resolve())


def sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(local_source_path(path), "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def file_bytes(path: str) -> int:
    return os.stat(local_source_path(path)).st_size


def geometry_sha256(geometry: ogr.Geometry) -> str:
    return hashlib.sha256(bytes(geometry.ExportToWkb())).hexdigest()


def canonical_id(value: Any) -> str:
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


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def load_json(path: str, label: str) -> tuple[Any, bytes]:
    try:
        with open(path, "rb") as stream:
            raw = stream.read()
    except OSError as error:
        fail(f"Cannot read {label}: {error}")
    try:
        return json.loads(raw.decode("utf-8")), raw
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        fail(f"{label} is not valid UTF-8 JSON: {error}")


def assert_regular(path: str, label: str) -> None:
    try:
        stat_result = os.lstat(path)
    except OSError as error:
        fail(f"Cannot stat {label}: {error}")
    if not stat.S_ISREG(stat_result.st_mode):
        fail(f"{label} must be a regular file: {path}")


def validate_output_binding(path: str, raw: bytes, sidecar: dict[str, Any], label: str) -> None:
    output = sidecar.get("output")
    if not isinstance(output, dict):
        fail(f"{label} sidecar output binding is required")
    recorded_path = output.get("path")
    if not isinstance(recorded_path, str) or binding_path(recorded_path) != binding_path(path):
        fail(f"{label} sidecar output path does not bind the supplied file")
    if output.get("byteLength") != len(raw):
        fail(f"{label} sidecar output byte length does not match the supplied file")
    if output.get("sha256") != hashlib.sha256(raw).hexdigest():
        fail(f"{label} sidecar output SHA-256 does not match the supplied file")


def descriptor(path: str, kind: str, **years: int) -> dict[str, Any]:
    return {"kind": kind, "path": path, "byteLength": file_bytes(path), "sha256": sha256(path), **years}


def validate_descriptor(actual_path: str, expected: dict[str, Any], label: str, kind: str, **years: int) -> None:
    if not isinstance(expected, dict):
        fail(f"{label} descriptor is not an object")
    if expected.get("kind") != kind:
        fail(f"{label} descriptor kind is not {kind}")
    if binding_path(expected.get("path", "")) != binding_path(actual_path):
        fail(f"{label} path does not match the binary sidecar binding")
    if expected.get("byteLength") != file_bytes(actual_path) or expected.get("sha256") != sha256(actual_path):
        fail(f"{label} bytes do not match the binary sidecar binding")
    for key, value in years.items():
        if expected.get(key) != value:
            fail(f"{label} {key} does not match the required schedule")


def grid_tuple(dataset: gdal.Dataset) -> tuple[Any, ...]:
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
    if band.GetNoDataValue() != NODATA:
        fail(f"{label} nodata must be exactly 255")
    transform = dataset.GetGeoTransform()
    if transform[2] != 0 or transform[4] != 0:
        fail("Rotated raster grids are not supported by the fractional correction")
    if transform[1] <= 0 or transform[5] >= 0:
        fail("Raster must be north-up with positive X and negative Y pixels")
    if not dataset.GetProjection():
        fail(f"{label} CRS is required")


def validate_exact_grid(reference: gdal.Dataset, candidate: gdal.Dataset, label: str) -> None:
    validate_raster_metadata(candidate, label)
    if grid_tuple(reference) != grid_tuple(candidate):
        fail(f"{label} does not match the exact binary baseline grid")


def projected_cell_hectares(dataset: gdal.Dataset) -> float:
    spatial_ref = osr.SpatialReference()
    spatial_ref.ImportFromWkt(dataset.GetProjection())
    if spatial_ref.IsGeographic():
        fail("Raster CRS must be projected; geographic cell areas are not supported")
    if not math.isclose(spatial_ref.GetLinearUnits(), 1.0, rel_tol=0, abs_tol=1e-12):
        fail("Raster CRS must use metre linear units")
    transform = dataset.GetGeoTransform()
    area = abs(transform[1] * transform[5])
    if area <= 0:
        fail("Raster cells must have positive area")
    return area / 10000.0


def pixel_window(dataset: gdal.Dataset, envelope: tuple[float, ...], padding: int = 0) -> tuple[int, int, int, int]:
    x0, px, _rx, y0, _ry, py = dataset.GetGeoTransform()
    min_x, max_x, min_y, max_y = envelope
    left = max(0, math.floor((min_x - x0) / px) - padding)
    right = min(dataset.RasterXSize, math.ceil((max_x - x0) / px) + padding)
    top = max(0, math.floor((max_y - y0) / py) - padding)
    bottom = min(dataset.RasterYSize, math.ceil((min_y - y0) / py) + padding)
    return left, top, max(0, right - left), max(0, bottom - top)


def create_mask(
    geometry: ogr.Geometry,
    crs_wkt: str,
    transform: tuple[float, ...],
    xoff: int,
    yoff: int,
    width: int,
    height: int,
    *,
    all_touched: bool,
) -> tuple[str, gdal.Dataset, int]:
    descriptor_fd, path = tempfile.mkstemp(prefix="witness-tree-fractional-boundary-", suffix=".tif")
    os.close(descriptor_fd)
    os.unlink(path)
    target = source = layer = feature = None
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
            fail("Cannot create a temporary boundary mask")
        local_transform = list(transform)
        local_transform[0] += xoff * local_transform[1] + yoff * local_transform[2]
        local_transform[3] += xoff * local_transform[4] + yoff * local_transform[5]
        target.SetGeoTransform(local_transform)
        target.SetProjection(crs_wkt)
        target.GetRasterBand(1).SetNoDataValue(0)

        memory_driver = ogr.GetDriverByName("MEM") or ogr.GetDriverByName("Memory")
        if memory_driver is None:
            fail("GDAL has no in-memory OGR driver")
        source = memory_driver.CreateDataSource("")
        spatial_ref = osr.SpatialReference()
        spatial_ref.ImportFromWkt(crs_wkt)
        layer = source.CreateLayer("boundary", srs=spatial_ref, geom_type=ogr.wkbUnknown)
        feature = ogr.Feature(layer.GetLayerDefn())
        feature.SetGeometry(geometry)
        layer.CreateFeature(feature)
        options = ["ALL_TOUCHED=TRUE"] if all_touched else []
        gdal.RasterizeLayer(target, [1], layer, burn_values=[1], options=options)
        target.FlushCache()
        target = source = layer = feature = None
        reopened = gdal.Open(path, gdal.GA_ReadOnly)
        if reopened is None:
            fail("Cannot reopen the temporary boundary mask")
        stat_result = os.stat(path)
        allocated = getattr(stat_result, "st_blocks", 0) * 512 or stat_result.st_size
        return path, reopened, allocated
    except Exception:
        target = source = layer = feature = None
        if os.path.exists(path):
            os.unlink(path)
        raise


def cell_polygon(dataset: gdal.Dataset, column: int, row: int) -> ogr.Geometry:
    x0, px, _rx, y0, _ry, py = dataset.GetGeoTransform()
    left = x0 + column * px
    right = left + px
    top = y0 + row * py
    bottom = top + py
    ring = ogr.Geometry(ogr.wkbLinearRing)
    ring.AddPoint(left, top)
    ring.AddPoint(right, top)
    ring.AddPoint(right, bottom)
    ring.AddPoint(left, bottom)
    ring.AddPoint(left, top)
    polygon = ogr.Geometry(ogr.wkbPolygon)
    polygon.AddGeometry(ring)
    return polygon


def raster_window_polygon(dataset: gdal.Dataset, column: int, row: int, width: int, height: int) -> ogr.Geometry:
    """Return the exact outer polygon for one north-up raster window."""
    x0, px, _rx, y0, _ry, py = dataset.GetGeoTransform()
    left = x0 + column * px
    right = left + width * px
    top = y0 + row * py
    bottom = top + height * py
    ring = ogr.Geometry(ogr.wkbLinearRing)
    ring.AddPoint(left, top)
    ring.AddPoint(right, top)
    ring.AddPoint(right, bottom)
    ring.AddPoint(left, bottom)
    ring.AddPoint(left, top)
    polygon = ogr.Geometry(ogr.wkbPolygon)
    polygon.AddGeometry(ring)
    return polygon


def exact_fraction(geometry: ogr.Geometry, dataset: gdal.Dataset, column: int, row: int, cell_area: float) -> float:
    intersection = geometry.Intersection(cell_polygon(dataset, column, row))
    if intersection is None or intersection.IsEmpty():
        return 0.0
    fraction = intersection.GetArea() / cell_area
    if fraction < -FRACTION_EPSILON or fraction > 1 + FRACTION_EPSILON:
        fail(f"Exact polygon-cell intersection fraction is outside [0, 1]: {fraction}")
    if fraction <= FRACTION_EPSILON:
        return 0.0
    if fraction >= 1 - FRACTION_EPSILON:
        return 1.0
    return fraction


def validate_values(values: np.ndarray, label: str) -> None:
    if np.any((values != 0) & (values != 1) & (values != NODATA)):
        fail(f"{label} values must be exactly 0, 1, or 255")


def category_weights(forest: int, loss: int | None = None) -> dict[str, float]:
    if loss is None:
        return {"known": float(forest == 1), "unknown": float(forest == NODATA)}
    return {
        "known": float(forest == 1 and loss != NODATA),
        "loss": float(forest == 1 and loss == 1),
        "unknown": float(forest == NODATA or loss == NODATA),
        "outside": float(forest == 0 and loss == 1),
    }


def add_delta(target: dict[str, float], exact: dict[str, float], center: dict[str, float], fraction: float) -> None:
    for key in exact:
        target[key] += fraction * exact[key] - center[key]


def safe_round_area(value: float, label: str) -> float:
    if abs(value) <= 0.0000000005:
        value = 0.0
    if value < -0.0000005:
        fail(f"{label} became negative after exact boundary correction: {value}")
    return round(max(0.0, value), 6)


def validate_binary_rows(rows: Any) -> None:
    if not isinstance(rows, list) or len(rows) != len(TARGETS) * (len(PAIR_YEARS) + 1):
        fail("binary annual output must contain exactly 156 rows")
    expected_keys = {
        "baselineYear", "boundaryId", "coverageGrade", "fromYear", "knownForestedHectares",
        "knownObservedLossHectares", "lossHectares", "observedLossOutsideFirstYearForestHectares",
        "observedLossPercent", "province", "rowType", "temporalSemantics", "toYear",
        "unknownRequiredInputHectares",
    }
    seen: set[tuple[str, str, int | None, int | None]] = set()
    for row in rows:
        if not isinstance(row, dict) or set(row) != expected_keys:
            fail("binary annual output row schema drifted")
        if row.get("province") not in {province for province, _id in TARGETS} or row.get("boundaryId") not in TARGET_IDS:
            fail("binary annual output contains an unsupported target")
        target = next((target for target in TARGETS if target == (row["province"], row["boundaryId"])), None)
        if target is None:
            fail("binary annual output province and boundary ID do not agree")
        for key in ("knownForestedHectares", "unknownRequiredInputHectares"):
            if not isinstance(row[key], (int, float)) or not math.isfinite(row[key]) or row[key] < 0:
                fail(f"binary annual output {key} must be a non-negative number")
        if row["rowType"] == "baseline":
            key = (row["boundaryId"], "baseline", None, None)
            if row["baselineYear"] != FIRST_YEAR or row["fromYear"] is not None or row["toYear"] is not None:
                fail("binary annual baseline row has invalid temporal fields")
            if any(row[field] is not None for field in ("lossHectares", "knownObservedLossHectares", "observedLossOutsideFirstYearForestHectares", "observedLossPercent")):
                fail("binary annual baseline row must retain null loss fields")
        elif row["rowType"] == "annual":
            from_year = row.get("fromYear")
            to_year = row.get("toYear")
            key = (row["boundaryId"], "annual", from_year, to_year)
            if not isinstance(from_year, int) or not isinstance(to_year, int) or (from_year, to_year) not in PAIR_YEARS:
                fail("binary annual row has an invalid adjacent interval")
            for field in ("knownObservedLossHectares", "observedLossOutsideFirstYearForestHectares"):
                if not isinstance(row[field], (int, float)) or not math.isfinite(row[field]) or row[field] < 0:
                    fail(f"binary annual row {field} must be a non-negative number")
        else:
            fail("binary annual output row type is unsupported")
        if key in seen:
            fail("binary annual output contains duplicate rows")
        seen.add(key)
    expected = {(boundary_id, "baseline", None, None) for _province, boundary_id in TARGETS}
    expected |= {(boundary_id, "annual", from_year, to_year) for _province, boundary_id in TARGETS for from_year, to_year in PAIR_YEARS}
    if seen != expected:
        fail("binary annual output does not contain every target baseline and adjacent pair")


def validate_binary_documents(binary_output: str, binary_sidecar: str, binary_worker: str) -> tuple[list[dict[str, Any]], dict[str, Any], bytes, bytes]:
    assert_regular(binary_output, "binary output")
    assert_regular(binary_sidecar, "binary sidecar")
    output_value, output_raw = load_json(binary_output, "binary output")
    sidecar_value, sidecar_raw = load_json(binary_sidecar, "binary sidecar")
    if not isinstance(sidecar_value, dict):
        fail("binary sidecar must be a JSON object")
    if sidecar_value.get("schemaVersion") != BINARY_SCHEMA or sidecar_value.get("status") != BINARY_STATUS or sidecar_value.get("algorithm") != BINARY_ALGORITHM:
        fail("binary sidecar is not the historical annual nonproduction output schema")
    for key in ("productionClaim", "admitted", "released", "productionEligible"):
        if sidecar_value.get(key) is not False:
            fail(f"binary sidecar {key} must remain false")
    claims = sidecar_value.get("claims")
    if not isinstance(claims, dict) or any(claims.get(key) is not False for key in ("admitted", "released", "productionEligible", "externalAction")):
        fail("binary sidecar claims must all remain false")
    if not isinstance(output_value, list):
        fail("binary annual output must be a JSON array")
    validate_output_binding(binary_output, output_raw, sidecar_value, "binary")
    validate_binary_rows(output_value)
    if sidecar_value.get("rows") != output_value:
        fail("binary sidecar rows do not exactly match binary output rows")
    input_binding = sidecar_value.get("input")
    if not isinstance(input_binding, dict):
        fail("binary sidecar input binding is required")
    if input_binding.get("admissionStatus") != "not-admitted" or input_binding.get("admissionRecord") is not None:
        fail("binary input must remain not-admitted with no admission record")
    execution = sidecar_value.get("execution")
    if not isinstance(execution, dict):
        fail("binary execution provenance is required")
    worker_hash = require_hash(execution.get("workerSha256"), "binary worker SHA-256")
    assert_regular(binary_worker, "historical binary worker")
    if sha256(binary_worker) != worker_hash:
        fail("binary sidecar worker hash does not match the historical worker bytes")
    return output_value, sidecar_value, output_raw, sidecar_raw


def parse_manifest(path: str) -> tuple[list[tuple[int, str]], list[tuple[int, int, str, str]], dict[str, str]]:
    manifest_path = str(Path(path).expanduser().resolve())
    value, _raw = load_json(manifest_path, "input manifest")
    if not isinstance(value, dict):
        fail("input manifest must be a JSON object")
    base = Path(manifest_path).parent
    masks_raw = value.get("forestMasks")
    losses_raw = value.get("annualLossRasters", value.get("lossRasters"))
    pairs_raw = value.get("pairs")
    masks: list[tuple[int, str]] = []
    pairs: list[tuple[int, int, str, str]] = []
    if isinstance(pairs_raw, list):
        by_year: dict[int, str] = {}
        for entry in pairs_raw:
            if not isinstance(entry, dict):
                fail("each manifest pair must be an object")
            from_year = entry.get("fromYear")
            to_year = entry.get("toYear")
            forest = entry.get("forestMask", entry.get("forestPath"))
            loss = entry.get("annualLossRaster", entry.get("lossRaster", entry.get("changeRaster")))
            if not isinstance(from_year, int) or not isinstance(to_year, int) or not isinstance(forest, str) or not isinstance(loss, str):
                fail("each manifest pair requires integer years and forest/loss paths")
            forest_path = forest if forest.startswith("/vsi") or os.path.isabs(forest) else str((base / forest).resolve())
            loss_path = loss if loss.startswith("/vsi") or os.path.isabs(loss) else str((base / loss).resolve())
            prior = by_year.setdefault(from_year, forest_path)
            if prior != forest_path:
                fail(f"conflicting forest masks for {from_year}")
            pairs.append((from_year, to_year, forest_path, loss_path))
        masks = sorted(by_year.items())
    else:
        if not isinstance(masks_raw, list) or not isinstance(losses_raw, list):
            fail("manifest requires forestMasks and annualLossRasters, or pairs")
        for entry in masks_raw:
            if not isinstance(entry, dict) or not isinstance(entry.get("year"), int) or not isinstance(entry.get("path"), str):
                fail("each forestMasks entry requires year and path")
            raw_path = entry["path"]
            masks.append((entry["year"], raw_path if raw_path.startswith("/vsi") or os.path.isabs(raw_path) else str((base / raw_path).resolve())))
        mask_by_year = dict(masks)
        for entry in losses_raw:
            if not isinstance(entry, dict) or not isinstance(entry.get("fromYear"), int) or not isinstance(entry.get("toYear"), int) or not isinstance(entry.get("path"), str):
                fail("each annualLossRasters entry requires years and path")
            raw_path = entry["path"]
            loss_path = raw_path if raw_path.startswith("/vsi") or os.path.isabs(raw_path) else str((base / raw_path).resolve())
            from_year = entry["fromYear"]
            if from_year not in mask_by_year:
                fail(f"no forest mask is bound to annual pair {from_year}-{entry['toYear']}")
            pairs.append((from_year, entry["toYear"], mask_by_year[from_year], loss_path))
    if sorted(masks) != [(year, masks[index][1]) for index, year in enumerate(range(FIRST_YEAR, LAST_YEAR))] or len(masks) != len(PAIR_YEARS):
        fail("input manifest must contain exactly one forest mask for every year 1984 through 2021")
    if sorted((from_year, to_year) for from_year, to_year, _forest, _loss in pairs) != list(PAIR_YEARS) or len(pairs) != len(PAIR_YEARS):
        fail("input manifest must contain exactly the 38 adjacent annual pairs")
    if len({binding_path(forest) for _from_year, _to_year, forest, _loss in pairs}) != len(PAIR_YEARS):
        fail("forest-mask input paths must be unique")
    if len({binding_path(loss) for _from_year, _to_year, _forest, loss in pairs}) != len(PAIR_YEARS):
        fail("annual-loss input paths must be unique")
    return sorted(masks), sorted(pairs), {"manifestPath": manifest_path, "manifestSha256": sha256(manifest_path)}


def parse_patterns(args: argparse.Namespace) -> tuple[list[tuple[int, str]], list[tuple[int, int, str, str]], dict[str, str]]:
    if not args.forest_mask_dir or not args.annual_loss_dir:
        fail("use --manifest or both --forest-mask-dir and --annual-loss-dir")
    forest_root = Path(args.forest_mask_dir).expanduser().resolve()
    loss_root = Path(args.annual_loss_dir).expanduser().resolve()
    masks = [(year, str((forest_root / args.forest_mask_pattern.format(year=year, from_year=year, to_year=year)).resolve())) for year in range(FIRST_YEAR, LAST_YEAR)]
    pairs = [
        (from_year, to_year, masks[from_year - FIRST_YEAR][1], str((loss_root / args.annual_loss_pattern.format(year=from_year, from_year=from_year, to_year=to_year)).resolve()))
        for from_year, to_year in PAIR_YEARS
    ]
    return masks, pairs, {}


def validate_sidecar_inputs(
    baseline_sidecar: dict[str, Any],
    masks: list[tuple[int, str]],
    pairs: list[tuple[int, int, str, str]],
    manifest_binding: dict[str, str],
    boundaries_path: str,
) -> tuple[dict[str, Any], set[str]]:
    input_binding = baseline_sidecar["input"]
    expected_targets = [{"province": province, "boundaryId": boundary_id} for province, boundary_id in TARGETS]
    if input_binding.get("targetProvinces") != expected_targets:
        fail("target province bindings do not match the binary sidecar contract")
    if input_binding.get("boundaryClassification") not in {"authoritative-boundary", "illustrative"}:
        fail("binary sidecar boundary classification is unsupported")
    for key in ("boundaryEdition", "boundaryIdField", "boundarySourceCrs", "boundaryWorkingCrs", "changeRasterVersion", "forestMaskVersion", "sourceVersion", "timeVersion"):
        require_text(input_binding.get(key), f"binary sidecar input {key}")
    boundaries = input_binding.get("boundaries")
    if not isinstance(boundaries, dict):
        fail("binary sidecar boundary descriptor is required")
    if binding_path(boundaries.get("path", "")) != binding_path(boundaries_path):
        fail("boundary path does not match the binary sidecar binding")
    if boundaries.get("byteLength") != file_bytes(boundaries_path) or boundaries.get("sha256") != sha256(boundaries_path):
        fail("boundary bytes do not match the binary sidecar binding")
    if boundaries.get("targetFeatureCount") != len(TARGETS):
        fail("binary sidecar boundary target count must be four")
    if set(manifest_binding) != {"manifestPath", "manifestSha256"} and manifest_binding:
        fail("manifest binding is incomplete")
    if "manifestPath" in input_binding and not manifest_binding:
        fail("the binary sidecar binds an input manifest; --manifest is required for exact input verification")
    for key, value in manifest_binding.items():
        if input_binding.get(key) != value:
            fail(f"input manifest {key} does not match the binary sidecar binding")
    forest_descriptors = input_binding.get("forestMasks")
    loss_descriptors = input_binding.get("annualLossRasters")
    if not isinstance(forest_descriptors, list) or not isinstance(loss_descriptors, list) or len(forest_descriptors) != len(PAIR_YEARS) or len(loss_descriptors) != len(PAIR_YEARS):
        fail("binary sidecar must bind all 38 forest masks and annual loss rasters")
    paths: set[str] = set()
    for index, (year, forest_path) in enumerate(masks):
        validate_descriptor(forest_path, forest_descriptors[index], f"forest mask {year}", "forest-mask", year=year)
        paths.add(binding_path(forest_path))
        from_year, to_year, _bound_forest, loss_path = pairs[index]
        if from_year != year or to_year != year + 1:
            fail("manifest schedule order drifted")
        validate_descriptor(loss_path, loss_descriptors[index], f"annual loss {from_year}-{to_year}", "annual-loss", fromYear=from_year, toYear=to_year)
        paths.add(binding_path(loss_path))
    return input_binding, paths


def read_boundaries(path: str, input_binding: dict[str, Any], raster_ref: gdal.Dataset) -> tuple[dict[str, ogr.Geometry], dict[str, dict[str, str]], int]:
    boundaries = ogr.Open(path, 0)
    if boundaries is None:
        fail("cannot open boundary vector")
    layer = boundaries.GetLayer(0)
    source_ref = layer.GetSpatialRef()
    if source_ref is None:
        fail("boundary source CRS is required")
    expected_source_crs = input_binding.get("boundarySourceCrs")
    if expected_source_crs != source_ref.ExportToWkt():
        fail("boundary source CRS does not match the binary sidecar binding")
    raster_crs = raster_ref.GetProjection()
    if input_binding.get("boundaryWorkingCrs") != raster_crs:
        fail("boundary working CRS does not match the binary baseline grid")
    spatial_ref = osr.SpatialReference()
    spatial_ref.ImportFromWkt(raster_crs)
    same_crs = bool(source_ref.IsSame(spatial_ref))
    expected_reprojection = "identical-crs" if same_crs else "reprojected"
    if input_binding.get("reprojection") != expected_reprojection:
        fail("boundary reprojection mode does not match the binary sidecar binding")
    if expected_reprojection == "identical-crs" and input_binding.get("reprojectionEvidence") is not None:
        fail("identical-CRS boundary binding must have null reprojection evidence")
    if expected_reprojection == "reprojected" and not isinstance(input_binding.get("reprojectionEvidence"), str):
        fail("reprojected boundary binding requires reprojection evidence")
    transformer = None if same_crs else osr.CoordinateTransformation(source_ref, spatial_ref)
    id_field = require_text(input_binding.get("boundaryIdField"), "boundary ID field")
    expected_policy = "shapefile-ring-orientation-only-ccw" if boundaries.GetDriver().GetName() == "ESRI Shapefile" else "driver-default"
    if input_binding.get("boundaryGeometryReadPolicy") != expected_policy:
        fail("boundary geometry read policy does not match the binary sidecar binding")
    geometries: dict[str, ogr.Geometry] = {}
    geometry_bindings: dict[str, dict[str, str]] = {}
    source_count = 0
    for feature in layer:
        source_count += 1
        boundary_id = canonical_id(feature.GetField(id_field))
        if boundary_id not in TARGET_IDS:
            continue
        if boundary_id in geometries:
            fail(f"duplicate target boundary identifier: {boundary_id}")
        source_geometry = feature.GetGeometryRef()
        if source_geometry is None or source_geometry.IsEmpty() or source_geometry.GetDimension() != 2:
            fail(f"boundary {boundary_id} has no polygonal geometry")
        if not source_geometry.IsValid():
            fail(f"boundary {boundary_id} has invalid geometry")
        source_clone = source_geometry.Clone()
        working_geometry = source_clone.Clone()
        if transformer is not None:
            working_geometry.Transform(transformer)
        if not working_geometry.IsValid() or working_geometry.IsEmpty() or working_geometry.GetArea() <= 0:
            fail(f"boundary {boundary_id} has no positive area after reprojection")
        geometries[boundary_id] = working_geometry
        geometry_bindings[boundary_id] = {
            "sourceWkbSha256": geometry_sha256(source_clone),
            "workingWkbSha256": geometry_sha256(working_geometry),
        }
    expected_source_count = input_binding["boundaries"].get("sourceFeatureCount")
    if source_count != expected_source_count:
        fail("boundary source feature count does not match the binary sidecar binding")
    if set(geometries) != TARGET_IDS:
        fail("target boundary geometry set does not match the binary sidecar binding")
    return geometries, geometry_bindings, source_count


def update_rows(rows: list[dict[str, Any]], corrections: dict[str, dict[str, Any]], cell_hectares: float) -> list[dict[str, Any]]:
    corrected = copy.deepcopy(rows)
    for row in corrected:
        target = corrections[row["boundaryId"]]
        if row["rowType"] == "baseline":
            delta = target["baseline"]
            row["knownForestedHectares"] = safe_round_area(row["knownForestedHectares"] + delta["known"] * cell_hectares, f"{row['boundaryId']} baseline known")
            row["unknownRequiredInputHectares"] = safe_round_area(row["unknownRequiredInputHectares"] + delta["unknown"] * cell_hectares, f"{row['boundaryId']} baseline unknown")
            row["coverageGrade"] = "complete" if row["unknownRequiredInputHectares"] == 0 else "partial-with-unknown"
            continue
        delta = target["annual"][(row["fromYear"], row["toYear"])]
        row["knownForestedHectares"] = safe_round_area(row["knownForestedHectares"] + delta["known"] * cell_hectares, f"{row['boundaryId']} {row['fromYear']} known")
        row["knownObservedLossHectares"] = safe_round_area(row["knownObservedLossHectares"] + delta["loss"] * cell_hectares, f"{row['boundaryId']} {row['fromYear']} loss")
        row["observedLossOutsideFirstYearForestHectares"] = safe_round_area(row["observedLossOutsideFirstYearForestHectares"] + delta["outside"] * cell_hectares, f"{row['boundaryId']} {row['fromYear']} outside")
        row["unknownRequiredInputHectares"] = safe_round_area(row["unknownRequiredInputHectares"] + delta["unknown"] * cell_hectares, f"{row['boundaryId']} {row['fromYear']} unknown")
        if row["unknownRequiredInputHectares"] > 0:
            row["coverageGrade"] = "partial-with-unknown"
            row["lossHectares"] = None
            row["observedLossPercent"] = None
        else:
            row["coverageGrade"] = "complete"
            row["lossHectares"] = row["knownObservedLossHectares"]
            row["observedLossPercent"] = None if row["knownForestedHectares"] == 0 else round(row["lossHectares"] / row["knownForestedHectares"] * 100, 6)
    return corrected


def main(args: argparse.Namespace) -> None:
    for output_path, label in ((args.output, "corrected output"), (args.sidecar, "corrected sidecar")):
        if os.path.exists(output_path):
            fail(f"refusing to overwrite an existing {label}: {output_path}")
    if args.production_claim:
        fail("fractional correction is permanently nonproduction; production claims are not supported")

    binary_output = str(Path(args.binary_output).expanduser().resolve())
    binary_sidecar = str(Path(args.binary_sidecar).expanduser().resolve())
    binary_worker = str(Path(args.binary_worker).expanduser().resolve())
    boundaries_path = args.boundaries if args.boundaries.startswith("/vsi") or os.path.isabs(args.boundaries) else str(Path(args.boundaries).expanduser().resolve())
    output_path = str(Path(args.output).expanduser().resolve())
    sidecar_path = str(Path(args.sidecar).expanduser().resolve())
    rows, baseline_sidecar, binary_output_raw, binary_sidecar_raw = validate_binary_documents(binary_output, binary_sidecar, binary_worker)
    masks, pairs, manifest_binding = parse_manifest(args.manifest) if args.manifest else parse_patterns(args)

    forest_datasets: list[gdal.Dataset] = []
    loss_datasets: list[gdal.Dataset] = []
    for from_year, to_year, forest_path, loss_path in pairs:
        forest = gdal.Open(forest_path, gdal.GA_ReadOnly)
        loss = gdal.Open(loss_path, gdal.GA_ReadOnly)
        if forest is None or loss is None:
            fail(f"cannot open exact annual pair {from_year}-{to_year}")
        forest_datasets.append(forest)
        loss_datasets.append(loss)
    reference = forest_datasets[0]
    validate_raster_metadata(reference, "forest mask 1984")
    cell_hectares = projected_cell_hectares(reference)
    for (from_year, to_year, _forest_path, _loss_path), forest, loss in zip(pairs, forest_datasets, loss_datasets):
        validate_exact_grid(reference, forest, f"forest mask {from_year}")
        validate_exact_grid(reference, loss, f"annual loss {from_year}-{to_year}")
    input_binding, _input_paths = validate_sidecar_inputs(baseline_sidecar, masks, pairs, manifest_binding, boundaries_path)
    grid_binding = input_binding.get("grid")
    if not isinstance(grid_binding, dict):
        fail("binary sidecar grid binding is required")
    expected_grid = {
        "width": reference.RasterXSize,
        "height": reference.RasterYSize,
        "geotransform": list(reference.GetGeoTransform()),
        "crs": reference.GetProjection(),
        "crsSha256": hashlib.sha256(reference.GetProjection().encode()).hexdigest(),
        "dataType": "Byte",
        "nodata": NODATA,
        "cellHectares": cell_hectares,
    }
    if grid_binding != expected_grid:
        fail("exact raster grid does not match the binary sidecar grid binding")

    geometries, geometry_bindings, source_feature_count = read_boundaries(boundaries_path, input_binding, reference)
    started_at = datetime.now(timezone.utc)
    started_monotonic = time.monotonic()
    all_corrections: dict[str, dict[str, Any]] = {}
    maximum_scratch_bytes = 0
    processed_window_count = 0
    total_candidates = total_fractional = total_zero = total_full = total_changed = 0
    for province, boundary_id in TARGETS:
        geometry = geometries[boundary_id]
        # Pad by one grid cell so an edge exactly on a grid line also checks
        # the adjacent zero/full-area cell.  The boundary-line mask still
        # limits exact intersections to edge candidates only.
        left, top, width, height = pixel_window(reference, geometry.GetEnvelope(), padding=1)
        correction = {
            "baseline": {"known": 0.0, "unknown": 0.0},
            "annual": {(from_year, to_year): {"known": 0.0, "loss": 0.0, "unknown": 0.0, "outside": 0.0} for from_year, to_year in PAIR_YEARS},
        }
        stats = {"candidateCellCount": 0, "fractionalCellCount": 0, "zeroIntersectionCellCount": 0, "fullIntersectionCellCount": 0, "changedCellCount": 0}
        if width > 0 and height > 0:
            center_path, center_dataset, center_scratch = create_mask(geometry, reference.GetProjection(), reference.GetGeoTransform(), left, top, width, height, all_touched=False)
            boundary_geometry = geometry.Boundary()
            edge_path, edge_dataset, edge_scratch = create_mask(boundary_geometry, reference.GetProjection(), reference.GetGeoTransform(), left, top, width, height, all_touched=True)
            maximum_scratch_bytes = max(maximum_scratch_bytes, center_scratch, edge_scratch)
            try:
                center_band = center_dataset.GetRasterBand(1)
                edge_band = edge_dataset.GetRasterBand(1)
                forest_bands = [dataset.GetRasterBand(1) for dataset in forest_datasets]
                loss_bands = [dataset.GetRasterBand(1) for dataset in loss_datasets]
                cell_area = abs(reference.GetGeoTransform()[1] * reference.GetGeoTransform()[5])
                for window_row in range(0, height, ROW_WINDOW):
                    for window_column in range(0, width, COLUMN_WINDOW):
                        rows_in_window = min(ROW_WINDOW, height - window_row)
                        columns_in_window = min(COLUMN_WINDOW, width - window_column)
                        center = center_band.ReadAsArray(window_column, window_row, columns_in_window, rows_in_window)
                        edge = edge_band.ReadAsArray(window_column, window_row, columns_in_window, rows_in_window)
                        if center is None or edge is None:
                            fail("cannot read temporary center or boundary mask")
                        candidate_positions = np.argwhere(edge.astype(bool))
                        if len(candidate_positions) == 0:
                            continue
                        processed_window_count += 1
                        # Clip the province once per bounded raster window. Passing
                        # the full province into every cell intersection forces
                        # OGR to convert the complete geometry to GEOS repeatedly.
                        # The window contains every candidate cell below, so this
                        # changes only the cost, not the exact intersection area.
                        window_geometry = geometry.Intersection(raster_window_polygon(
                            reference,
                            left + window_column,
                            top + window_row,
                            columns_in_window,
                            rows_in_window,
                        ))
                        if window_geometry is None:
                            fail("cannot clip target geometry to the exact raster window")
                        forest_arrays = [band.ReadAsArray(left + window_column, top + window_row, columns_in_window, rows_in_window) for band in forest_bands]
                        loss_arrays = [band.ReadAsArray(left + window_column, top + window_row, columns_in_window, rows_in_window) for band in loss_bands]
                        if any(array is None for array in forest_arrays + loss_arrays):
                            fail("cannot read exact annual input window")
                        for index, array in enumerate(forest_arrays):
                            validate_values(array, f"forest mask {PAIR_YEARS[index][0]}")
                        for index, array in enumerate(loss_arrays):
                            validate_values(array, f"annual loss {PAIR_YEARS[index][0]}-{PAIR_YEARS[index][1]}")
                        for relative_row, relative_column in candidate_positions:
                            local_row = int(relative_row)
                            local_column = int(relative_column)
                            global_row = top + window_row + local_row
                            global_column = left + window_column + local_column
                            stats["candidateCellCount"] += 1
                            fraction = exact_fraction(window_geometry, reference, global_column, global_row, cell_area)
                            if fraction <= FRACTION_EPSILON:
                                stats["zeroIntersectionCellCount"] += 1
                            elif fraction >= 1 - FRACTION_EPSILON:
                                stats["fullIntersectionCellCount"] += 1
                            else:
                                stats["fractionalCellCount"] += 1
                            center_member = bool(center[local_row, local_column])
                            baseline_forest = int(forest_arrays[0][local_row, local_column])
                            baseline_exact = category_weights(baseline_forest)
                            baseline_center = {key: value * float(center_member) for key, value in baseline_exact.items()}
                            prior_baseline = dict(correction["baseline"])
                            add_delta(correction["baseline"], baseline_exact, baseline_center, fraction)
                            changed = any(abs(correction["baseline"][key] - prior_baseline[key]) > FRACTION_EPSILON for key in correction["baseline"])
                            for index, (from_year, to_year) in enumerate(PAIR_YEARS):
                                forest_value = int(forest_arrays[index][local_row, local_column])
                                loss_value = int(loss_arrays[index][local_row, local_column])
                                exact_weights = category_weights(forest_value, loss_value)
                                center_weights = {key: value * float(center_member) for key, value in exact_weights.items()}
                                prior = dict(correction["annual"][(from_year, to_year)])
                                add_delta(correction["annual"][(from_year, to_year)], exact_weights, center_weights, fraction)
                                if any(abs(correction["annual"][(from_year, to_year)][key] - prior[key]) > FRACTION_EPSILON for key in prior):
                                    changed = True
                            if changed:
                                stats["changedCellCount"] += 1
            finally:
                center_dataset = None
                edge_dataset = None
                if os.path.exists(center_path):
                    os.unlink(center_path)
                if os.path.exists(edge_path):
                    os.unlink(edge_path)
        total_candidates += stats["candidateCellCount"]
        total_fractional += stats["fractionalCellCount"]
        total_zero += stats["zeroIntersectionCellCount"]
        total_full += stats["fullIntersectionCellCount"]
        total_changed += stats["changedCellCount"]
        all_corrections[boundary_id] = {**correction, "stats": stats, "province": province}

    corrected_rows = update_rows(rows, all_corrections, cell_hectares)
    output_parent = os.path.dirname(output_path)
    sidecar_parent = os.path.dirname(sidecar_path)
    if output_parent and not os.path.isdir(output_parent):
        fail(f"corrected output directory does not exist: {output_parent}")
    if sidecar_parent and not os.path.isdir(sidecar_parent):
        fail(f"corrected sidecar directory does not exist: {sidecar_parent}")
    output_bytes = stable_json(corrected_rows).encode("utf-8")
    with open(output_path, "xb") as stream:
        stream.write(output_bytes)
    completed_at = datetime.now(timezone.utc)
    per_target = []
    for province, boundary_id in TARGETS:
        stats = all_corrections[boundary_id]["stats"]
        per_target.append({"province": province, "boundaryId": boundary_id, **stats, **geometry_bindings[boundary_id]})
    new_sidecar = {
        "schemaVersion": CORRECTION_SCHEMA,
        "status": CORRECTION_STATUS,
        "algorithm": CORRECTION_ALGORITHM,
        "admitted": False,
        "released": False,
        "productionEligible": False,
        "productionClaim": False,
        "claims": {"admitted": False, "released": False, "productionEligible": False, "externalAction": False},
        "nationalPerCellGeometryMaterialized": False,
        "binaryBaseline": {
            "output": {"path": binary_output, "byteLength": len(binary_output_raw), "sha256": hashlib.sha256(binary_output_raw).hexdigest()},
            "sidecar": {"path": binary_sidecar, "byteLength": len(binary_sidecar_raw), "sha256": hashlib.sha256(binary_sidecar_raw).hexdigest()},
            "worker": {"path": binary_worker, "sha256": baseline_sidecar["execution"]["workerSha256"]},
            "schemaVersion": BINARY_SCHEMA,
            "algorithm": BINARY_ALGORITHM,
            "membership": "historical GDAL rasterized polygon center membership",
        },
        "input": copy.deepcopy(input_binding),
        "geometryBindings": {"sourceFeatureCount": source_feature_count, "targetFeatureCount": len(TARGETS), "targets": per_target},
        "correction": {
            "algorithm": CORRECTION_ALGORITHM,
            "subtraction": "binary-mask center membership contribution for each candidate cell",
            "addition": "exact OGR polygon-cell intersection fraction for that same candidate cell",
            "candidateSelection": "ALL_TOUCHED rasterization of each target geometry boundary; interior cells are not intersected",
            "fractionEpsilon": FRACTION_EPSILON,
            "candidateCellCount": total_candidates,
            "fractionalCellCount": total_fractional,
            "zeroIntersectionCellCount": total_zero,
            "fullIntersectionCellCount": total_full,
            "changedCellCount": total_changed,
            "perTarget": per_target,
        },
        "output": {"path": output_path, "byteLength": len(output_bytes), "sha256": hashlib.sha256(output_bytes).hexdigest()},
        "rows": corrected_rows,
        "execution": {
            "codeVersion": "phase2-annual-zonal-fractional-correction-v1",
            "workerSha256": sha256(os.path.realpath(__file__)),
            "startedAt": started_at.isoformat().replace("+00:00", "Z"),
            "completedAt": completed_at.isoformat().replace("+00:00", "Z"),
            "elapsedSeconds": time.monotonic() - started_monotonic,
            "peakRssBytes": int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss if sys.platform == "darwin" else resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024),
            "maximumScratchAllocatedBytes": maximum_scratch_bytes,
            "featureCount": len(TARGETS),
            "candidateCellCount": total_candidates,
            "processedWindowCount": processed_window_count,
            "parameters": {
                "rowWindow": ROW_WINDOW,
                "columnWindow": COLUMN_WINDOW,
                "gdalCacheBytes": GDAL_CACHE_BYTES,
                "nodata": NODATA,
                "cellHectares": cell_hectares,
                "fractionEpsilon": FRACTION_EPSILON,
            },
            "environment": {"pythonVersion": sys.version.split()[0], "gdalVersion": gdal.VersionInfo("--version"), "numpyVersion": np.__version__},
        },
        "limitations": [
            "Local nonproduction correction only; no admission, release, or production eligibility is asserted.",
            "The binary center-membership output must have been produced by the exact historical worker and exact input bindings supplied here.",
            "Only cells touched by a rasterized target boundary line are exact-intersected; interior cells inherit the binary baseline.",
            "North-up projected metre grids are required; rotated/geographic grids and raster resampling are unsupported.",
            "Exact OGR polygon-cell intersections are computed in the raster CRS; no national per-cell geometry or correction table is materialized.",
        ],
    }
    try:
        with open(sidecar_path, "x", encoding="utf-8") as stream:
            json.dump(new_sidecar, stream, ensure_ascii=False, indent=2, sort_keys=True)
    except Exception:
        if os.path.exists(output_path):
            os.unlink(output_path)
        raise


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description=__doc__)
    command.add_argument("--binary-output", "--annual-output", dest="binary_output", required=True, help="Historical binary annual JSON output")
    command.add_argument("--binary-sidecar", "--annual-sidecar", dest="binary_sidecar", required=True, help="Historical binary annual provenance sidecar")
    command.add_argument("--binary-worker", default=str(Path(__file__).with_name("phase2_annual_zonal_aggregate.py")), help="Exact historical worker whose hash is in the binary sidecar")
    command.add_argument("--manifest", "--input-manifest")
    command.add_argument("--forest-mask-dir")
    command.add_argument("--annual-loss-dir", "--change-raster-dir", "--loss-dir", dest="annual_loss_dir")
    command.add_argument("--forest-mask-pattern", default="forest-mask-{year}.tif")
    command.add_argument("--annual-loss-pattern", "--change-raster-pattern", "--loss-pattern", dest="annual_loss_pattern", default="detected-forest-loss-{from_year}-{to_year}.tif")
    command.add_argument("--boundaries", required=True)
    command.add_argument("--output", required=True)
    command.add_argument("--sidecar", required=True)
    command.add_argument("--production-claim", action="store_true")
    return command


if __name__ == "__main__":
    main(parser().parse_args())
