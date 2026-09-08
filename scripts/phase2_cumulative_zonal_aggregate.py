#!/usr/bin/env python3
"""Cumulative 1984-2022 zonal summary for the four Phase 2 provinces.

Why this file exists
--------------------
The annual worker answers "how much forest was detected as lost in each
adjacent year pair".  Summing its 38 answers does **not** produce a cumulative
total: a cell can be detected as lost, regrow, and be detected as lost again,
so addition counts the same ground more than once.  This worker answers the
different question the cumulative headline needs, which is "how much of the
forest standing in 1984 was detected as lost at least once by 2022".

The method is a per-cell union, not a sum.  For every cell inside a province
the worker ORs the 38 annual loss rasters together, so a cell lost in five
separate intervals contributes its 0.09 hectares exactly once.  The number of
distinct intervals in which each cell was flagged is also counted, which is
what lets the sidecar state the size of the double-count that a naive sum
would have introduced rather than merely asserting that one exists.

Denominator and eligibility
---------------------------
The denominator is the 1984 forest mask: the cumulative rate is the share of
*1984 forest* detected as lost, which is the only reading under which a single
rate spanning 38 years is meaningful.  A cell counts toward the denominator
only when it was forest in 1984, the land-cover product actually mapped it,
and every one of the 38 intervals returned an observed value for it.  A cell
that is unobserved in even one interval cannot be said to have survived the
period, so it is Unknown rather than intact.  This is deliberately strict and
fail-closed, and it is the same doctrine the annual worker applies per pair.

Loss detected on ground that was *not* forest in 1984 is reported separately
rather than folded into the rate.  It is real detected loss, but it has no
place in a denominator built from the 1984 forest extent.

Mapped extent
-------------
As in the annual worker, the forest masks write 0 both for "mapped, no forest"
and for "never mapped", so the product's mapped extent is read alongside them
and unmapped area is reported as Unknown.  Without it the settled south and the
prairies would return zero forest, zero loss and complete coverage, which is a
fabricated zero rather than a measurement.

Relationship to the annual worker
---------------------------------
The validated primitives are imported from phase2_annual_zonal_aggregate_v2
rather than restated here, so the grid checks, boundary repair rules, feature
rasterization and Unknown semantics cannot drift between the two passes.  That
module's own bytes are untouched; its sha256 stays bound to the artifacts that
already cite it.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from osgeo import gdal, ogr, osr

sys.path.insert(0, str(Path(__file__).resolve().parent))

from phase2_annual_zonal_aggregate_v2 import (  # noqa: E402
    NODATA,
    canonical_id,
    create_feature_mask,
    fail,
    file_bytes,
    pixel_window,
    round_area,
    sha256,
    validate_exact_grid,
    validate_extent_values,
    validate_projected_metre_grid,
    validate_raster_metadata,
    validate_values,
)

gdal.UseExceptions()
ogr.UseExceptions()

# Smaller than the annual worker's windows on purpose.  This pass keeps
# per-cell accumulators alive for the whole window, and it is designed to run
# as several province processes at once, so the working set per process is
# held down rather than maximized.
ROW_WINDOW = 1024
COLUMN_WINDOW = 16384
GDAL_CACHE_BYTES = 128 * 1024 * 1024

FIRST_YEAR = 1984
LAST_YEAR = 2022

TARGETS = (("BC", "59"), ("AB", "48"), ("ON", "35"), ("QC", "24"))
TARGET_IDS = {boundary_id for _province, boundary_id in TARGETS}


def empty_stats() -> dict[str, int]:
    return {
        "cells": 0,
        "unmapped": 0,
        "known1984Forest": 0,
        "everLostInside": 0,
        "everLostOutside": 0,
        "unknown": 0,
        "relossCells": 0,
        "lossEventTotal": 0,
        "maxLossEvents": 0,
    }


def build_pairs(loss_dir: str, loss_pattern: str) -> list[tuple[int, int, str]]:
    pairs: list[tuple[int, int, str]] = []
    for from_year in range(FIRST_YEAR, LAST_YEAR):
        to_year = from_year + 1
        path = os.path.join(loss_dir, loss_pattern.format(from_year=from_year, to_year=to_year))
        if not os.path.exists(path):
            fail(f"Missing annual loss raster for {from_year}-{to_year}: {path}")
        pairs.append((from_year, to_year, path))
    if len(pairs) != LAST_YEAR - FIRST_YEAR:
        fail(f"Expected {LAST_YEAR - FIRST_YEAR} annual loss rasters, found {len(pairs)}")
    return pairs


def main(args: argparse.Namespace) -> None:
    gdal.SetCacheMax(GDAL_CACHE_BYTES)

    selected = TARGETS
    if args.provinces:
        wanted = {value.strip().upper() for value in args.provinces.split(",") if value.strip()}
        selected = tuple(entry for entry in TARGETS if entry[0] in wanted)
        if len(selected) != len(wanted):
            fail(f"Unknown province code in --provinces: {args.provinces}")

    pairs = build_pairs(args.annual_loss_dir, args.annual_loss_pattern)
    if args.max_pairs:
        pairs = pairs[: args.max_pairs]

    baseline_mask_path = os.path.join(args.forest_mask_dir, args.forest_mask_pattern.format(year=FIRST_YEAR))
    if not os.path.exists(baseline_mask_path):
        fail(f"Missing the {FIRST_YEAR} forest mask: {baseline_mask_path}")

    reference = gdal.Open(baseline_mask_path, gdal.GA_ReadOnly)
    if reference is None:
        fail("Cannot open the baseline forest mask")
    validate_raster_metadata(reference, "Baseline forest mask")
    cell_hectares = validate_projected_metre_grid(reference)
    crs_wkt = reference.GetProjection()

    extent_dataset = gdal.Open(args.mapped_extent, gdal.GA_ReadOnly)
    if extent_dataset is None:
        fail("Cannot open the mapped extent")
    validate_exact_grid(reference, extent_dataset, "Mapped extent")

    loss_datasets = []
    for from_year, to_year, path in pairs:
        dataset = gdal.Open(path, gdal.GA_ReadOnly)
        if dataset is None:
            fail(f"Cannot open annual loss raster {from_year}-{to_year}")
        validate_exact_grid(reference, dataset, f"Annual loss raster {from_year}-{to_year}")
        loss_datasets.append(dataset)

    boundaries = ogr.Open(args.boundaries)
    if boundaries is None:
        fail("Cannot open the boundary source")
    layer = boundaries.GetLayer(0)
    source_ref = layer.GetSpatialRef()
    if source_ref is None:
        fail("Boundary source CRS is required")
    spatial_ref = osr.SpatialReference()
    spatial_ref.ImportFromWkt(crs_wkt)
    transformer = None if source_ref.IsSame(spatial_ref) else osr.CoordinateTransformation(source_ref, spatial_ref)

    geometries: dict[str, ogr.Geometry] = {}
    names: dict[str, str] = {}
    source_feature_count = 0
    for feature in layer:
        source_feature_count += 1
        boundary_id = canonical_id(feature.GetField(args.boundary_id_field))
        if boundary_id not in TARGET_IDS:
            continue
        geometry_ref = feature.GetGeometryRef()
        if geometry_ref is None or geometry_ref.IsEmpty():
            fail(f"Boundary {boundary_id} has no geometry")
        geometry = geometry_ref.Clone()
        if not geometry.IsValid():
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
            merged = geometries[boundary_id].Union(geometry)
            if merged is None or merged.IsEmpty() or not merged.IsValid():
                fail(f"Boundary {boundary_id} appears more than once and could not be merged")
            if feature_name != names.get(boundary_id):
                fail(f"Multipart boundary {boundary_id} has conflicting name values")
            geometries[boundary_id] = merged
            continue
        geometries[boundary_id] = geometry
        if feature_name is not None:
            names[boundary_id] = feature_name

    missing = {boundary_id for _p, boundary_id in selected} - geometries.keys()
    if missing:
        fail(f"Target authoritative boundaries are missing: {', '.join(sorted(missing))}")

    started_at = datetime.now(timezone.utc)
    started_monotonic = time.monotonic()
    rows: list[dict[str, Any]] = []
    processed_window_count = 0
    mask_rasterization_count = 0

    extent_band = extent_dataset.GetRasterBand(1)
    baseline_band = reference.GetRasterBand(1)
    loss_bands = [dataset.GetRasterBand(1) for dataset in loss_datasets]

    for province, boundary_id in selected:
        geometry = geometries[boundary_id]
        xoff, yoff, width, height = pixel_window(reference, geometry.GetEnvelope())
        stats = empty_stats()
        if width > 0 and height > 0:
            mask_path, mask_dataset, _scratch = create_feature_mask(
                geometry, crs_wkt, reference.GetGeoTransform(), xoff, yoff, width, height
            )
            mask_rasterization_count += 1
            try:
                mask_band = mask_dataset.GetRasterBand(1)
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

                        extent = extent_band.ReadAsArray(
                            xoff + column, yoff + row, columns_in_window, rows_in_window
                        )
                        if extent is None:
                            fail("Cannot read the mapped extent")
                        validate_extent_values(extent)
                        unmapped = extent[mask] == NODATA
                        mapped = ~unmapped
                        unmapped_in_window = int(np.count_nonzero(unmapped))
                        stats["cells"] += int(np.count_nonzero(mask))
                        stats["unmapped"] += unmapped_in_window
                        stats["unknown"] += unmapped_in_window

                        baseline = baseline_band.ReadAsArray(
                            xoff + column, yoff + row, columns_in_window, rows_in_window
                        )
                        if baseline is None:
                            fail(f"Cannot read the {FIRST_YEAR} forest mask")
                        validate_values(baseline, f"Forest mask {FIRST_YEAR}")
                        selected_baseline = baseline[mask]

                        # Per-cell accumulators for this window only.  Cells do
                        # not span windows, so a window can be finalized before
                        # the next one is read.
                        ever_lost = np.zeros(selected_baseline.shape, dtype=bool)
                        loss_events = np.zeros(selected_baseline.shape, dtype=np.uint8)
                        any_unobserved = np.zeros(selected_baseline.shape, dtype=bool)

                        for index, band in enumerate(loss_bands):
                            loss = band.ReadAsArray(
                                xoff + column, yoff + row, columns_in_window, rows_in_window
                            )
                            if loss is None:
                                from_year, to_year, _path = pairs[index]
                                fail(f"Cannot read annual loss raster {from_year}-{to_year}")
                            from_year, to_year, _path = pairs[index]
                            validate_values(loss, f"Annual loss raster {from_year}-{to_year}")
                            selected_loss = loss[mask]
                            hit = selected_loss == 1
                            ever_lost |= hit
                            # Saturating, so a cell flagged in more than 255
                            # intervals cannot wrap; 38 intervals cannot reach
                            # that, and the clip documents the intent.
                            loss_events += hit
                            any_unobserved |= selected_loss == NODATA

                        baseline_unknown = selected_baseline == NODATA
                        # Eligible means: forest in 1984, mapped, and observed
                        # in every interval.  Anything else cannot be said to
                        # have survived, so it is Unknown rather than intact.
                        eligible = (selected_baseline == 1) & mapped & ~any_unobserved
                        stats["known1984Forest"] += int(np.count_nonzero(eligible))
                        stats["everLostInside"] += int(np.count_nonzero(eligible & ever_lost))
                        stats["everLostOutside"] += int(
                            np.count_nonzero((selected_baseline == 0) & mapped & ever_lost)
                        )
                        stats["unknown"] += int(np.count_nonzero((baseline_unknown | any_unobserved) & mapped))
                        stats["relossCells"] += int(np.count_nonzero(eligible & (loss_events >= 2)))
                        stats["lossEventTotal"] += int(loss_events[eligible].sum())
                        window_max = int(loss_events[eligible].max()) if np.any(eligible) else 0
                        stats["maxLossEvents"] = max(stats["maxLossEvents"], window_max)
            finally:
                mask_dataset = None
                if os.path.exists(mask_path):
                    os.unlink(mask_path)

        known = stats["known1984Forest"]
        lost = stats["everLostInside"]
        # A sum over the 38 annual rows would have counted every repeat
        # detection again; the difference is stated rather than asserted.
        naive_sum_cells = stats["lossEventTotal"]
        rows.append(
            {
                "province": province,
                "boundaryId": boundary_id,
                "boundaryName": names.get(boundary_id),
                "rowType": "cumulative",
                "fromYear": FIRST_YEAR,
                "toYear": LAST_YEAR,
                "temporalSemantics": (
                    f"{FIRST_YEAR}-{LAST_YEAR} cumulative union of {len(pairs)} adjacent annual "
                    f"intervals; denominator is the {FIRST_YEAR} forest-mask snapshot; a cell "
                    "detected as lost in several intervals is counted once"
                ),
                "coverageGrade": "partial-with-unknown",
                "districtHectares": round_area(stats["cells"], cell_hectares),
                "known1984ForestHectares": round_area(known, cell_hectares),
                "cumulativeObservedLossHectares": round_area(lost, cell_hectares),
                "cumulativeObservedLossPercent": (round(lost / known * 100, 6) if known else None),
                "observedLossOutsideFirstYearForestHectares": round_area(
                    stats["everLostOutside"], cell_hectares
                ),
                "unknownRequiredInputHectares": round_area(stats["unknown"], cell_hectares),
                "unmappedByProductExtentHectares": round_area(stats["unmapped"], cell_hectares),
                "repeatLossCellHectares": round_area(stats["relossCells"], cell_hectares),
                "maximumLossEventsInOneCell": stats["maxLossEvents"],
                "naiveAnnualSumHectares": round_area(naive_sum_cells, cell_hectares),
                "doubleCountAvoidedHectares": round_area(naive_sum_cells - lost, cell_hectares),
            }
        )

    completed_at = datetime.now(timezone.utc)
    elapsed = time.monotonic() - started_monotonic

    def describe(path: str, kind: str, **extra: Any) -> dict[str, Any]:
        return {
            "kind": kind,
            "path": path,
            "byteLength": file_bytes(path),
            "sha256": sha256(path),
            **extra,
        }

    sidecar = {
        "schemaVersion": "phase2-cumulative-province-zonal-aggregation-v1",
        "status": "executed-local-nonproduction",
        "algorithm": "windowed-bounded-per-cell-union-across-annual-loss-series",
        "temporalSemantics": (
            f"Cumulative union over {len(pairs)} adjacent annual intervals from {FIRST_YEAR} to "
            f"{LAST_YEAR}. Not a sum of the annual rows."
        ),
        "admitted": False,
        "released": False,
        "productionEligible": False,
        "productionClaim": False,
        "nationalPerCellGeometryMaterialized": False,
        "claims": {
            "admitted": False,
            "released": False,
            "productionEligible": False,
            "externalAction": False,
        },
        "input": {
            "admissionStatus": args.admission_status,
            "admissionRecord": args.admission_record,
            "boundaryEdition": args.boundary_edition,
            "boundaryClassification": args.boundary_classification,
            "boundaryIdField": args.boundary_id_field,
            "forestMaskVersion": args.forest_mask_version,
            "changeRasterVersion": args.change_raster_version,
            "timeVersion": args.time_version,
            "sourceVersion": args.source_version,
            "targetProvinces": [province for province, _b in selected],
            "baselineForestMask": describe(baseline_mask_path, "forest-mask", year=FIRST_YEAR),
            "mappedExtent": describe(args.mapped_extent, "mapped-extent"),
            "boundaries": {
                **describe(args.boundaries, "boundaries"),
                "sourceFeatureCount": source_feature_count,
                "targetFeatureCount": len(selected),
            },
            "annualLossRasters": [
                describe(path, "annual-loss", fromYear=from_year, toYear=to_year)
                for from_year, to_year, path in pairs
            ],
            "grid": {
                "width": reference.RasterXSize,
                "height": reference.RasterYSize,
                "geotransform": list(reference.GetGeoTransform()),
                "cellHectares": cell_hectares,
                "nodata": NODATA,
                "crs": crs_wkt,
            },
        },
        "execution": {
            "codeVersion": args.code_version,
            "worker": describe(str(Path(__file__).resolve()), "worker"),
            "annualPairCount": len(pairs),
            "featureCount": len(selected),
            "maskRasterizationCount": mask_rasterization_count,
            "processedWindowCount": processed_window_count,
            "startedAt": started_at.isoformat().replace("+00:00", "Z"),
            "completedAt": completed_at.isoformat().replace("+00:00", "Z"),
            "elapsedSeconds": elapsed,
            "parameters": {
                "rowWindow": ROW_WINDOW,
                "columnWindow": COLUMN_WINDOW,
                "gdalCacheBytes": GDAL_CACHE_BYTES,
                "nodata": NODATA,
                "cellHectares": cell_hectares,
            },
            "environment": {
                "pythonVersion": sys.version.split()[0],
                "gdalVersion": gdal.VersionInfo("--version"),
                "numpyVersion": np.__version__,
            },
        },
        "rows": rows,
    }

    for target, payload in ((args.output, rows), (args.sidecar, sidecar)):
        directory = os.path.dirname(os.path.abspath(target))
        os.makedirs(directory, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(prefix=".cumulative-zonal-", dir=directory)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=1, sort_keys=True)
            handle.write("\n")
        os.replace(temporary, target)

    print(
        f"cumulative zonal: {len(rows)} row(s), {len(pairs)} pair(s), "
        f"{processed_window_count} window(s), {elapsed:.1f}s -> {args.output}"
    )


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description=__doc__)
    command.add_argument("--forest-mask-dir", required=True)
    command.add_argument("--annual-loss-dir", required=True)
    command.add_argument("--forest-mask-pattern", default="forest-mask-{year}.tif")
    command.add_argument("--annual-loss-pattern", default="detected-forest-loss-{from_year}-{to_year}.tif")
    command.add_argument("--mapped-extent", required=True)
    command.add_argument("--boundaries", required=True)
    command.add_argument("--boundary-id-field", default="PRUID")
    command.add_argument("--boundary-name-field")
    command.add_argument("--output", required=True)
    command.add_argument("--sidecar", required=True)
    command.add_argument("--provinces", help="Comma-separated subset, e.g. BC,AB. Default: all four.")
    command.add_argument("--max-pairs", type=int, help="Calibration only: read the first N annual pairs")
    command.add_argument("--boundary-edition", required=True)
    command.add_argument("--boundary-classification", choices=["authoritative-boundary", "illustrative"], default="illustrative")
    command.add_argument("--forest-mask-version", required=True)
    command.add_argument("--change-raster-version", required=True)
    command.add_argument("--time-version", required=True)
    command.add_argument("--source-version", required=True)
    command.add_argument("--code-version", required=True)
    command.add_argument("--admission-status", choices=["admitted", "not-admitted"], default="not-admitted")
    command.add_argument("--admission-record")
    return command


if __name__ == "__main__":
    main(parser().parse_args())
