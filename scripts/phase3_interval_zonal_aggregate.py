#!/usr/bin/env python3
"""Arbitrary-interval loss summaries for every electoral district.

The annual worker answers one question per year.  A reader who selects 1990 to
1998 needs a different question answered, and there are two of them, which is
the whole reason this file exists:

  union  A cell that lost forest in 1991 and again in 1995 is one cell that
         lost forest during the window.  The union counts each cell once, so it
         is bounded by the forest present in the first year of the window and a
         percentage of that forest is meaningful.

  sum    Adding the annual counts counts that cell twice.  The sum is a real
         quantity, the total area of loss events, but it is not an area of
         ground: a 0.09 ha cell lost twice contributes 0.18 ha.  It therefore
         has no denominator and no percentage, ever.

Both are emitted, under names that cannot be confused, because publishing only
one of them invites a reader to use it as the other.  Net change is not emitted
at all: it needs a validated gain product, and this pipeline does not have one.

Method.  One bounded pass per district.  For every cell inside the district and
inside the land-cover product's mapped extent, the worker packs the 38 annual
loss decisions into a 38-bit integer and the 39 annual forest decisions into a
39-bit integer, together with the two matching nodata vectors.  Cells that are
forest throughout and never lost and never nodata carry no information a window
query needs, so only cells that lost at least once, or that carry any nodata,
enter the histogram.  The histogram then answers all 741 windows exactly, for
both union and sum, without reading the rasters again.

Unknown is preserved, never turned into zero.  A cell outside the mapped extent
is unmapped, which is a statement that nobody looked, not a measurement of no
loss.  A cell whose loss raster is nodata anywhere inside the window makes that
cell unknown for that window, so a window's known denominator shrinks rather
than quietly absorbing a gap.

This is a separate file rather than an edit to phase2_annual_zonal_aggregate_v2
because that worker's sha256 is bound into admitted evidence, and editing it in
place would break a binding whose entire job is to prove which code produced an
admitted number.

NEVER edit this file while it is running.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import time
from datetime import datetime, timezone
from multiprocessing import get_context
from pathlib import Path
from typing import Any

import numpy as np
from osgeo import gdal, ogr, osr

HERE = Path(__file__).resolve().parent


def _load_v2():
    """Reuse the annual worker's grid, mask, and hashing helpers verbatim.

    Imported rather than copied so the interval product cannot drift away from
    the annual product's grid validation, geometry repair tolerance, or
    rasterization settings.  The import is read-only; the annual worker's bytes
    are unchanged and its checksum binding is untouched.
    """

    path = HERE / "phase2_annual_zonal_aggregate_v2.py"
    spec = importlib.util.spec_from_file_location("phase2_annual_zonal_aggregate_v2", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load the annual worker helpers from {path}")
    module = importlib.util.module_from_spec(spec)
    # Registered before execution because the annual worker defines a
    # dataclass, and dataclasses resolve their own module by name.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


V2 = _load_v2()

NODATA = 255
FIRST_YEAR = 1984
LAST_YEAR = 2022
FOREST_YEARS = tuple(range(FIRST_YEAR, LAST_YEAR + 1))          # 39
LOSS_PAIRS = tuple((y, y + 1) for y in range(FIRST_YEAR, LAST_YEAR))  # 38
INTERVAL_COUNT = len(LOSS_PAIRS) * (len(LOSS_PAIRS) + 1) // 2   # 741

# Smaller than the annual worker's tile.  This worker holds four uint64 bit
# vectors over the selected cells at once, so the tile is sized by those, not
# by the single uint8 band the annual worker holds.
ROW_TILE = 1024
COLUMN_TILE = 4096

fail = V2.fail
sha256 = V2.sha256
file_bytes = V2.file_bytes
canonical_id = V2.canonical_id
pixel_window = V2.pixel_window
create_feature_mask = V2.create_feature_mask
validate_raster_metadata = V2.validate_raster_metadata
validate_exact_grid = V2.validate_exact_grid
validate_projected_metre_grid = V2.validate_projected_metre_grid


def interval_index() -> list[tuple[int, int]]:
    """Canonical window order: every (from_year, to_year) with from <= to."""

    windows: list[tuple[int, int]] = []
    for a in range(len(LOSS_PAIRS)):
        for b in range(a, len(LOSS_PAIRS)):
            windows.append((LOSS_PAIRS[a][0], LOSS_PAIRS[b][1]))
    return windows


WINDOWS = interval_index()


def resolve_series(forest_dir: str, loss_dir: str) -> tuple[list[str], list[str]]:
    forests = [os.path.join(forest_dir, f"forest-mask-{year}.tif") for year in FOREST_YEARS]
    losses = [
        os.path.join(loss_dir, f"detected-forest-loss-{a}-{b}.tif") for a, b in LOSS_PAIRS
    ]
    for path in forests + losses:
        if not os.path.isfile(path):
            fail(f"Missing required raster: {path}")
    return forests, losses


_STATE: dict[str, Any] = {}


def _open_state(config: dict[str, Any]) -> dict[str, Any]:
    if _STATE.get("ready"):
        return _STATE
    gdal.UseExceptions()
    ogr.UseExceptions()
    gdal.SetCacheMax(config["gdalCacheBytes"])
    gdal.SetConfigOption("OGR_ORGANIZE_POLYGONS", "ONLY_CCW")
    forests = [gdal.Open(p, gdal.GA_ReadOnly) for p in config["forestPaths"]]
    losses = [gdal.Open(p, gdal.GA_ReadOnly) for p in config["lossPaths"]]
    extent = gdal.Open(config["extentPath"], gdal.GA_ReadOnly)
    if extent is None or any(d is None for d in forests + losses):
        fail("Cannot open the raster series in a worker process")
    reference = forests[0]
    validate_raster_metadata(reference, f"Forest mask {FIRST_YEAR}")
    for year, dataset in zip(FOREST_YEARS, forests):
        validate_exact_grid(reference, dataset, f"Forest mask {year}")
    for (a, b), dataset in zip(LOSS_PAIRS, losses):
        validate_exact_grid(reference, dataset, f"Loss raster {a}-{b}")
    validate_exact_grid(reference, extent, "Mapped extent")
    _STATE.update(
        ready=True,
        forests=forests,
        losses=losses,
        extent=extent,
        reference=reference,
        crsWkt=reference.GetProjection(),
        transform=reference.GetGeoTransform(),
        cellHectares=validate_projected_metre_grid(reference),
    )
    return _STATE


def _summarize_feature(payload: tuple[dict[str, Any], str, str | None, bytes]) -> dict[str, Any]:
    config, boundary_id, boundary_name, geometry_wkb = payload
    state = _open_state(config)
    reference = state["reference"]
    geometry = ogr.CreateGeometryFromWkb(geometry_wkb)
    if geometry is None or geometry.IsEmpty():
        fail(f"Boundary {boundary_id} lost its geometry crossing into the worker")

    started = time.monotonic()
    xoff, yoff, width, height = pixel_window(reference, geometry.GetEnvelope())

    cells = 0
    unmapped = 0
    forest_known = np.zeros(len(FOREST_YEARS), dtype=np.int64)
    forest_unknown = np.zeros(len(FOREST_YEARS), dtype=np.int64)
    annual_known = np.zeros(len(LOSS_PAIRS), dtype=np.int64)
    annual_loss = np.zeros(len(LOSS_PAIRS), dtype=np.int64)
    annual_unknown = np.zeros(len(LOSS_PAIRS), dtype=np.int64)
    annual_outside = np.zeros(len(LOSS_PAIRS), dtype=np.int64)
    histogram: dict[tuple[int, int, int, int], int] = {}
    tiles = 0

    if width > 0 and height > 0:
        mask_path, mask_dataset, _scratch = create_feature_mask(
            geometry,
            state["crsWkt"],
            state["transform"],
            xoff,
            yoff,
            width,
            height,
        )
        try:
            mask_band = mask_dataset.GetRasterBand(1)
            extent_band = state["extent"].GetRasterBand(1)
            forest_bands = [d.GetRasterBand(1) for d in state["forests"]]
            loss_bands = [d.GetRasterBand(1) for d in state["losses"]]
            for row in range(0, height, ROW_TILE):
                for column in range(0, width, COLUMN_TILE):
                    rows_in_tile = min(ROW_TILE, height - row)
                    columns_in_tile = min(COLUMN_TILE, width - column)
                    tile_mask = mask_band.ReadAsArray(column, row, columns_in_tile, rows_in_tile)
                    if tile_mask is None:
                        fail("Cannot read the bounded boundary mask")
                    tile_mask = tile_mask.astype(bool)
                    if not np.any(tile_mask):
                        continue
                    tiles += 1
                    extent_values = extent_band.ReadAsArray(
                        xoff + column, yoff + row, columns_in_tile, rows_in_tile
                    )
                    if extent_values is None:
                        fail("Cannot read the mapped extent")
                    V2.validate_extent_values(extent_values)
                    selected_extent = extent_values[tile_mask]
                    mapped = selected_extent != NODATA
                    n = selected_extent.size
                    cells += n
                    unmapped += int(n - np.count_nonzero(mapped))
                    if not np.any(mapped):
                        continue

                    forest_bits = np.zeros(n, dtype=np.uint64)
                    forest_nodata_bits = np.zeros(n, dtype=np.uint64)
                    loss_bits = np.zeros(n, dtype=np.uint64)
                    loss_nodata_bits = np.zeros(n, dtype=np.uint64)

                    forest_is_one: list[np.ndarray] = []
                    forest_is_nodata: list[np.ndarray] = []
                    for index, band in enumerate(forest_bands):
                        values = band.ReadAsArray(
                            xoff + column, yoff + row, columns_in_tile, rows_in_tile
                        )
                        if values is None:
                            fail(f"Cannot read forest mask {FOREST_YEARS[index]}")
                        V2.validate_values(values, f"Forest mask {FOREST_YEARS[index]}")
                        selected = values[tile_mask]
                        is_one = (selected == 1) & mapped
                        is_nodata = (selected == NODATA) & mapped
                        forest_known[index] += int(np.count_nonzero(is_one))
                        forest_unknown[index] += int(np.count_nonzero(is_nodata))
                        forest_bits |= is_one.astype(np.uint64) << np.uint64(index)
                        forest_nodata_bits |= is_nodata.astype(np.uint64) << np.uint64(index)
                        if index < len(LOSS_PAIRS):
                            forest_is_one.append(is_one)
                            forest_is_nodata.append(is_nodata)
                        # The 2022 mask is a denominator only; no pair starts there.

                    for index, band in enumerate(loss_bands):
                        pair = LOSS_PAIRS[index]
                        values = band.ReadAsArray(
                            xoff + column, yoff + row, columns_in_tile, rows_in_tile
                        )
                        if values is None:
                            fail(f"Cannot read loss raster {pair[0]}-{pair[1]}")
                        V2.validate_values(values, f"Loss raster {pair[0]}-{pair[1]}")
                        selected = values[tile_mask]
                        is_loss = (selected == 1) & mapped
                        is_nodata = (selected == NODATA) & mapped
                        was_forest = forest_is_one[index]
                        forest_missing = forest_is_nodata[index]
                        eligible = was_forest & ~is_nodata
                        annual_known[index] += int(np.count_nonzero(eligible))
                        annual_loss[index] += int(np.count_nonzero(eligible & is_loss))
                        annual_unknown[index] += int(np.count_nonzero(forest_missing | is_nodata))
                        annual_outside[index] += int(
                            np.count_nonzero(is_loss & ~was_forest & ~forest_missing & mapped)
                        )
                        loss_bits |= is_loss.astype(np.uint64) << np.uint64(index)
                        loss_nodata_bits |= is_nodata.astype(np.uint64) << np.uint64(index)

                    interesting = mapped & (
                        (loss_bits != 0) | (loss_nodata_bits != 0) | (forest_nodata_bits != 0)
                    )
                    if np.any(interesting):
                        stacked = np.stack(
                            [
                                forest_bits[interesting],
                                forest_nodata_bits[interesting],
                                loss_bits[interesting],
                                loss_nodata_bits[interesting],
                            ],
                            axis=1,
                        )
                        keys, counts = np.unique(stacked, axis=0, return_counts=True)
                        for key, count in zip(keys, counts):
                            entry = (int(key[0]), int(key[1]), int(key[2]), int(key[3]))
                            histogram[entry] = histogram.get(entry, 0) + int(count)
                    if len(histogram) > config["histogramCeiling"]:
                        fail(
                            f"Boundary {boundary_id} produced more than "
                            f"{config['histogramCeiling']} distinct loss trajectories; "
                            "refusing to continue rather than exhaust memory silently"
                        )
        finally:
            mask_dataset = None
            if os.path.exists(mask_path):
                os.unlink(mask_path)

    union_loss, interval_known, interval_unknown = _derive_intervals(
        histogram, forest_known, forest_unknown, unmapped
    )
    sum_loss = _derive_sums(annual_loss)

    return {
        "boundaryId": boundary_id,
        "boundaryName": boundary_name,
        "cells": cells,
        "unmappedCells": unmapped,
        "distinctTrajectories": len(histogram),
        "tilesRead": tiles,
        "forestKnownCells": [int(v) for v in forest_known],
        "forestUnknownCells": [int(v) for v in forest_unknown],
        "annualKnownCells": [int(v) for v in annual_known],
        "annualLossCells": [int(v) for v in annual_loss],
        "annualUnknownCells": [int(v) for v in annual_unknown],
        "annualOutsideForestCells": [int(v) for v in annual_outside],
        "intervalKnownCells": interval_known,
        "intervalUnionLossCells": union_loss,
        "intervalUnknownCells": interval_unknown,
        "intervalSummedLossCells": sum_loss,
        "elapsedSeconds": round(time.monotonic() - started, 3),
    }


def _lowest_set_index(vector, first_bit: int, none_index: int):
    """Index of the lowest set bit at or above first_bit, or none_index."""

    upper = np.uint64((~np.uint64(0)) << np.uint64(first_bit))
    masked = vector & upper
    isolated = masked & (np.uint64(0) - masked)
    # Every bit lives below 2**38, so the float conversion of an isolated
    # power of two is exact and log2 returns the index without rounding.
    index = np.zeros(vector.shape, dtype=np.int64)
    present = masked != 0
    if np.any(present):
        index[present] = np.log2(isolated[present].astype(np.float64)).astype(np.int64)
    index[~present] = none_index
    return index


def _derive_intervals(
    histogram: dict[tuple[int, int, int, int], int],
    forest_known: np.ndarray,
    forest_unknown: np.ndarray,
    unmapped: int,
) -> tuple[list[int], list[int], list[int]]:
    """Answer every window from the histogram, exactly.

    known[a,b]   cells that were forest in year a and carry no loss nodata
                 anywhere inside the window.
    union[a,b]   those cells that lost forest at least once inside the window.
    unknown[a,b] unmapped cells, plus cells whose year-a forest value is nodata,
                 plus cells with loss nodata anywhere inside the window.

    A window test reduces to a comparison once the first event at or after the
    window's start year is known: "lost at least once in [a,b]" is exactly
    "the first loss at or after a happened at or before b". That turns the
    inner scan over 38 end years into one small histogram per start year, so
    the cost is linear in the number of distinct trajectories rather than 741
    times it.
    """

    pairs = len(LOSS_PAIRS)
    none_index = pairs  # sentinel column meaning "no such event in range"
    if histogram:
        keys = np.array(list(histogram.keys()), dtype=np.uint64)
        counts = np.array(list(histogram.values()), dtype=np.int64)
        forest_vector = keys[:, 0]
        forest_nodata_vector = keys[:, 1]
        loss_vector = keys[:, 2]
        loss_nodata_vector = keys[:, 3]
    else:
        forest_vector = forest_nodata_vector = loss_vector = loss_nodata_vector = np.zeros(
            0, dtype=np.uint64
        )
        counts = np.zeros(0, dtype=np.int64)

    union_loss: list[int] = []
    interval_known: list[int] = []
    interval_unknown: list[int] = []
    width = none_index + 1
    for a in range(pairs):
        bit_a = np.uint64(1) << np.uint64(a)
        forest_at_a = (forest_vector & bit_a) != 0
        forest_nodata_at_a = (forest_nodata_vector & bit_a) != 0
        nodata_cells_at_a = int(counts[forest_nodata_at_a].sum())

        first_loss = _lowest_set_index(loss_vector, a, none_index)
        first_gap = _lowest_set_index(loss_nodata_vector, a, none_index)

        # Cells that were forest in year a, binned by when they first lose
        # forest and when their record first goes dark.
        forest_grid = np.bincount(
            (first_loss[forest_at_a] * width + first_gap[forest_at_a]),
            weights=counts[forest_at_a],
            minlength=width * width,
        ).reshape(width, width)
        # Cells whose year-a forest value is not nodata, binned by first gap.
        # Their gaps add to Unknown without double counting the nodata cells.
        outside_nodata = ~forest_nodata_at_a
        gap_totals = np.bincount(
            first_gap[outside_nodata],
            weights=counts[outside_nodata],
            minlength=width,
        )

        gap_at_or_before = np.cumsum(forest_grid.sum(axis=0))
        gap_totals_at_or_before = np.cumsum(gap_totals)
        # loss_then_gap[m][g] counts cells whose first loss is at or before m
        # and whose first gap is at or before g, so a window's union is the
        # row total minus the part of that row whose record went dark.
        loss_at_or_before = np.cumsum(forest_grid, axis=0)
        loss_then_gap = np.cumsum(loss_at_or_before, axis=1)

        for b in range(a, pairs):
            known = int(forest_known[a]) - int(round(float(gap_at_or_before[b])))
            # cells with first loss <= b, minus those whose gap is also <= b
            with_loss = int(round(float(loss_then_gap[b][width - 1])))
            with_loss_and_gap = int(round(float(loss_then_gap[b][b])))
            union = with_loss - with_loss_and_gap
            unknown = (
                unmapped
                + nodata_cells_at_a
                + int(round(float(gap_totals_at_or_before[b])))
            )
            if known < 0 or union < 0 or union > known:
                fail("Interval derivation produced an impossible count")
            interval_known.append(known)
            union_loss.append(union)
            interval_unknown.append(unknown)
    return union_loss, interval_known, interval_unknown


def _derive_sums(annual_loss: np.ndarray) -> list[int]:
    prefix = np.concatenate([[0], np.cumsum(annual_loss)])
    sums: list[int] = []
    for a in range(len(LOSS_PAIRS)):
        for b in range(a, len(LOSS_PAIRS)):
            sums.append(int(prefix[b + 1] - prefix[a]))
    return sums


def read_boundaries(args: argparse.Namespace, crs_wkt: str) -> list[tuple[str, str | None, bytes]]:
    spatial_ref = osr.SpatialReference()
    spatial_ref.ImportFromWkt(crs_wkt)
    source = ogr.Open(args.boundaries, 0)
    if source is None:
        fail("Cannot open boundary vector")
    layer = source.GetLayer(0)
    source_ref = layer.GetSpatialRef()
    if source_ref is None:
        fail("Boundary source CRS is required")
    transformer = None if source_ref.IsSame(spatial_ref) else osr.CoordinateTransformation(
        source_ref, spatial_ref
    )
    geometries: dict[str, ogr.Geometry] = {}
    names: dict[str, str | None] = {}
    for feature in layer:
        boundary_id = canonical_id(feature.GetField(args.boundary_id_field))
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
        name = None
        if args.boundary_name_field:
            raw = feature.GetField(args.boundary_name_field)
            if raw is None or not str(raw).strip():
                fail(f"Boundary {boundary_id} has no value in {args.boundary_name_field}")
            name = str(raw).strip()
        if boundary_id in geometries:
            merged = geometries[boundary_id].Union(geometry)
            if merged is None or merged.IsEmpty() or not merged.IsValid():
                fail(f"Boundary {boundary_id} appears more than once and could not be merged")
            if name != names.get(boundary_id):
                fail(f"Multipart boundary {boundary_id} has conflicting names")
            geometries[boundary_id] = merged
            continue
        geometries[boundary_id] = geometry
        names[boundary_id] = name
    if not geometries:
        fail("No boundary features were read")
    return [
        (boundary_id, names.get(boundary_id), geometries[boundary_id].ExportToWkb())
        for boundary_id in sorted(geometries)
    ]


def main(args: argparse.Namespace) -> None:
    if os.path.exists(args.output) or os.path.exists(args.sidecar):
        fail("Refusing to overwrite an existing interval output or sidecar")
    for value, label in [
        (args.jurisdiction, "jurisdiction"),
        (args.boundary_edition, "boundary edition"),
        (args.method_version, "method version"),
        (args.code_version, "code version"),
    ]:
        V2.require_text(value, label)
    if args.production_claim:
        fail("The interval worker is nonproduction; production claims are not supported")

    forest_paths, loss_paths = resolve_series(args.forest_mask_dir, args.annual_loss_dir)
    gdal.UseExceptions()
    ogr.UseExceptions()
    reference = gdal.Open(forest_paths[0], gdal.GA_ReadOnly)
    if reference is None:
        fail("Cannot open the reference forest mask")
    validate_raster_metadata(reference, f"Forest mask {FIRST_YEAR}")
    cell_hectares = validate_projected_metre_grid(reference)
    crs_wkt = reference.GetProjection()

    features = read_boundaries(args, crs_wkt)
    config = {
        "forestPaths": forest_paths,
        "lossPaths": loss_paths,
        "extentPath": args.mapped_extent,
        "gdalCacheBytes": args.gdal_cache_megabytes * 1024 * 1024,
        "histogramCeiling": args.histogram_ceiling,
    }

    started_at = datetime.now(timezone.utc)
    started = time.monotonic()
    payloads = [(config, boundary_id, name, wkb) for boundary_id, name, wkb in features]
    workers = max(1, args.workers)
    if workers == 1:
        results = []
        for index, payload in enumerate(payloads, start=1):
            results.append(_summarize_feature(payload))
            print(f"{index}/{len(payloads)} {payload[1]}", file=sys.stderr, flush=True)
    else:
        context = get_context("spawn")
        with context.Pool(processes=workers) as pool:
            results = []
            for index, result in enumerate(
                pool.imap_unordered(_summarize_feature, payloads, chunksize=1), start=1
            ):
                results.append(result)
                print(
                    f"{index}/{len(payloads)} {result['boundaryId']} "
                    f"({result['elapsedSeconds']}s, {result['distinctTrajectories']} trajectories)",
                    file=sys.stderr,
                    flush=True,
                )
    results.sort(key=lambda row: row["boundaryId"])

    inputs = []
    for kind, paths in (("forestMask", forest_paths), ("annualLoss", loss_paths)):
        for path in paths:
            inputs.append(
                {
                    "kind": kind,
                    "path": path,
                    "byteLength": file_bytes(path),
                    "sha256": sha256(path),
                }
            )
    for kind, path in (("mappedExtent", args.mapped_extent), ("boundaries", args.boundaries)):
        inputs.append(
            {"kind": kind, "path": path, "byteLength": file_bytes(path), "sha256": sha256(path)}
        )

    document = {
        "schema": "witness-tree/phase3-interval-zonal/1",
        "jurisdiction": args.jurisdiction,
        "boundaryEdition": args.boundary_edition,
        "methodVersion": args.method_version,
        "codeVersion": args.code_version,
        "productionClaim": False,
        "admissionStatus": "not-admitted",
        "cellHectares": cell_hectares,
        "firstYear": FIRST_YEAR,
        "lastYear": LAST_YEAR,
        "forestYears": list(FOREST_YEARS),
        "lossPairs": [{"fromYear": a, "toYear": b} for a, b in LOSS_PAIRS],
        "intervalOrder": [{"fromYear": a, "toYear": b} for a, b in WINDOWS],
        "intervalCount": INTERVAL_COUNT,
        "unionTerm": "Forest lost at least once",
        "summedTerm": "Yearly losses added together",
        "summedPercentAllowed": False,
        "netChangeIncluded": False,
        "unknownPolicy": "unmapped and nodata are preserved as Unknown and never counted as zero",
        "districts": results,
    }
    with open(args.output, "x", encoding="utf-8") as target:
        json.dump(document, target, indent=2, sort_keys=False)
        target.write("\n")

    sidecar = {
        "schema": "witness-tree/phase3-interval-zonal-provenance/1",
        "output": os.path.basename(args.output),
        "outputSha256": sha256(args.output),
        "outputByteLength": file_bytes(args.output),
        "startedAt": started_at.isoformat().replace("+00:00", "Z"),
        "completedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "elapsedSeconds": round(time.monotonic() - started, 3),
        "workers": workers,
        "districtCount": len(results),
        "worker": {
            "path": str(Path(__file__).resolve()),
            "sha256": sha256(str(Path(__file__).resolve())),
        },
        "annualWorkerHelpers": {
            "path": str(HERE / "phase2_annual_zonal_aggregate_v2.py"),
            "sha256": sha256(str(HERE / "phase2_annual_zonal_aggregate_v2.py")),
        },
        "inputs": inputs,
    }
    with open(args.sidecar, "x", encoding="utf-8") as target:
        json.dump(sidecar, target, indent=2, sort_keys=False)
        target.write("\n")
    print(
        f"wrote {args.output} ({len(results)} districts, "
        f"{round(time.monotonic() - started, 1)}s)",
        file=sys.stderr,
    )


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--forest-mask-dir", required=True)
    p.add_argument("--annual-loss-dir", required=True)
    p.add_argument("--mapped-extent", required=True)
    p.add_argument("--boundaries", required=True)
    p.add_argument("--boundary-id-field", required=True)
    p.add_argument("--boundary-name-field", default="")
    p.add_argument("--jurisdiction", required=True)
    p.add_argument("--boundary-edition", required=True)
    p.add_argument("--method-version", required=True)
    p.add_argument("--code-version", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--sidecar", required=True)
    p.add_argument("--workers", type=int, default=1)
    p.add_argument("--gdal-cache-megabytes", type=int, default=96)
    p.add_argument("--histogram-ceiling", type=int, default=4_000_000)
    p.add_argument("--production-claim", action="store_true")
    return p


if __name__ == "__main__":
    main(parser().parse_args())
