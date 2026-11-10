#!/usr/bin/env python3
"""Recorded harvest, recorded fire, cause of the latest loss and regrowth for
every place the place pages cover, in 30 m cells.

What is measured, in plain words, per boundary:

  Harvest and fire by year (1985 to 2022)
      The cells inside the boundary whose NTEMS harvest, or NTEMS fire, change
      year is that year. This is how scripts/province_annual_series.py counts
      them for the published province series: every cell of the area counts,
      whatever its land cover, and a raster value outside 1985 to 2022 means
      no recorded change. 1984 has no datable change and is not emitted; a
      reader must show it as Unknown, never as zero.

  Lost cells
      A cell is lost when it is treed in one year and not treed the next, at
      least once between 1984 and 2022. Treed means VLCE2 class 210, 220 or 230
      in that year (the owner's 2026-09-23 rule, kept by the 2026-10-03
      decision). A cell whose class is 0, 255 or off the VLCE2 legend in ANY
      year is Unknown for the whole record and is never counted as lost, as
      not lost, or as zero. This is exactly the province figures' definition:
      the trajectory walk, the state codes and the cause rule are imported
      from scripts/phase4_condition_recovery_v3.py, not copied.

  Cause of the latest loss
      Of the lost cells, those whose NTEMS fire year, or harvest year, lies
      within one year of the latest loss year (the first year not treed). Four
      disjoint groups: fire only, harvest only, both, and neither. There is no
      precedence between fire and harvest: a cell matched by both is counted
      once, as both. "Neither" means cause not recorded, never undisturbed.

  Treed again
      Of the lost cells, those treed for at least five consecutive years after
      their latest loss (recovered), those whose return after the latest loss
      has started but has not yet lasted five years by 2022 (unconfirmed), and
      the rest (no return). The latest loss year is kept for every lost cell so
      a reader can tell a loss too recent to judge (from 2018 on, five treed
      years cannot fit before 2022) from one that did not grow back.

  Unknown and unmapped
      unknownCells is the province figures' Unknown (any year off the legend).
      unmappedCells is the VLCE2 mapped-extent raster's nodata, which is what
      the phase 3 place records call unmapped.

  The phase 3 loss, for the cell-for-cell check
      The place pages' "lost at least once" (unionLossCells) is a different
      quantity: it reads the phase 2 forest masks and loss rasters and counts
      cells that were forest in 1984 and lost at least once with no loss
      nodata. This worker recomputes it from those very rasters for every
      boundary and also counts, cell by cell, where it differs from "lost and
      treed in 1984" under the definition above. The difference between the
      two loss figures is therefore measured, not assumed.

Boundaries are read, repaired, merged and rasterized by the phase 3 interval
worker's own functions (read_boundaries, pixel_window, create_feature_mask),
so every cell is assigned to a boundary exactly as the existing place records
assigned it. Provinces use the province mask rasters the province figures used.

Memory is bounded: one boundary at a time per worker, read in tiles of at most
ROW_TILE x COLUMN_TILE cells. Nothing here edits an input or overwrites an
output.

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
from osgeo import gdal, ogr

HERE = Path(__file__).resolve().parent


def _load(name: str, filename: str):
    path = HERE / filename
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# The phase 3 worker loads the phase 2 helpers itself; both are read-only here.
P3 = _load("phase3_interval_zonal_aggregate", "phase3_interval_zonal_aggregate.py")
V2 = P3.V2
V3 = _load("phase4_condition_recovery_v3", "phase4_condition_recovery_v3.py")
# The v3 walk computes every class set named in its module-level SET_KEYS. Only
# set A (210, 220, 230) is the published headline, so only it is walked. The
# rules inside walk(), cell_state() and cause_of() are untouched.
V3.SET_KEYS = ("A",)

FIRST_YEAR, LAST_YEAR = V3.FIRST, V3.LAST          # 1984, 2022
DIST_YEARS = tuple(range(1985, LAST_YEAR + 1))      # 38 datable years
NODATA = 255
ROW_TILE = 1024
COLUMN_TILE = 2048
LOSS_PAIRS = P3.LOSS_PAIRS
CANNOT_RECOVER_FROM = LAST_YEAR - V3.CONFIRM + 1    # 2018: five treed years cannot fit
# Cross-tab of lost cells: latest loss year x latest-loss state x cause.
LOST_STATES = (V3.RECOVERED, V3.NOT_RECOVERED, V3.UNCONFIRMED)
LOST_STATE_NAMES = ("recovered", "noReturn", "unconfirmedReturn")
CAUSE_NAMES = tuple(V3.CAUSE_NAMES)                 # notRecorded, fire, harvest, fireAndHarvest
LOST_CODES = len(DIST_YEARS) * len(LOST_STATES) * len(CAUSE_NAMES)   # 456


def fail(message: str) -> None:
    raise RuntimeError(message)


_STATE: dict[str, Any] = {}


def _same_grid(reference: gdal.Dataset, candidate: gdal.Dataset, label: str) -> None:
    if (candidate.RasterXSize, candidate.RasterYSize) != (reference.RasterXSize, reference.RasterYSize):
        fail(f"{label} is not the reference raster size")
    if tuple(candidate.GetGeoTransform()) != tuple(reference.GetGeoTransform()):
        fail(f"{label} is not on the reference geotransform")
    if candidate.RasterCount != 1:
        fail(f"{label} must have one band")


def _open_state(config: dict[str, Any]) -> dict[str, Any]:
    if _STATE.get("ready"):
        return _STATE
    gdal.UseExceptions()
    ogr.UseExceptions()
    gdal.SetCacheMax(config["gdalCacheBytes"])
    gdal.SetConfigOption("OGR_ORGANIZE_POLYGONS", "ONLY_CCW")
    opened = {key: gdal.Open(path, gdal.GA_ReadOnly) for key, path in config["rasters"].items()}
    # The phase 3 forest mask is the reference grid the boundary masks are
    # rasterized on, as in the phase 3 worker.
    reference = opened["p3Mask1984"]
    V2.validate_raster_metadata(reference, "Forest mask 1984")
    V2.validate_exact_grid(reference, opened["extent"], "Mapped extent")
    for a, b in LOSS_PAIRS:
        V2.validate_exact_grid(reference, opened[f"p3Loss{a}"], f"Loss raster {a}-{b}")
    for year in V3.YEARS:
        dataset = opened[f"lc{year}"]
        _same_grid(reference, dataset, f"VLCE2 {year}")
        if dataset.GetRasterBand(1).DataType != gdal.GDT_Byte:
            fail(f"VLCE2 {year} is not a Byte raster")
    for key in ("harvest", "fire"):
        _same_grid(reference, opened[key], key)
        if opened[key].GetRasterBand(1).DataType != gdal.GDT_UInt16:
            fail(f"{key} is not a UInt16 year raster")
    _STATE.update(
        ready=True,
        bands={key: dataset.GetRasterBand(1) for key, dataset in opened.items()},
        datasets=opened,
        reference=reference,
        crsWkt=reference.GetProjection(),
        transform=reference.GetGeoTransform(),
    )
    return _STATE


def _empty() -> dict[str, Any]:
    return {
        "cells": 0,
        "unmappedCells": 0,
        "unknownCells": 0,
        "unknownClass0Cells": 0,
        "unknownNodataCells": 0,
        "states": np.zeros(7, np.int64),
        "lostByLatestYearStateCause": np.zeros(LOST_CODES, np.int64),
        "lostTreedIn1984Cells": 0,
        "recoveredAnyLossCells": 0,
        "treedCellsByYear": np.zeros(len(V3.YEARS), np.int64),
        "harvestCellsByYear": np.zeros(len(DIST_YEARS) + 1, np.int64),
        "fireCellsByYear": np.zeros(len(DIST_YEARS) + 1, np.int64),
        "harvestOtherValueCells": 0,
        "fireOtherValueCells": 0,
        "harvestInUnknownCells": 0,
        "fireInUnknownCells": 0,
        "harvestInUnmappedCells": 0,
        "fireInUnmappedCells": 0,
        "p3UnionLossCells": 0,
        "p3KnownForestCells": 0,
        "p3UnknownCells": 0,
        "p3UnionVersusLostTreedIn1984MismatchCells": 0,
        "p3UnknownVersusUnknownMismatchCells": 0,
        "tilesRead": 0,
    }


def _year_bins(values: np.ndarray) -> tuple[np.ndarray, int]:
    v = values.astype(np.int32)
    dated = (v >= DIST_YEARS[0]) & (v <= DIST_YEARS[-1])
    index = np.where(dated, v - (DIST_YEARS[0] - 1), 0)
    other = int(np.count_nonzero((v != 0) & ~dated))
    return np.bincount(index, minlength=len(DIST_YEARS) + 1).astype(np.int64), other


def _tile(acc: dict[str, Any], bands: dict[str, Any], sel: np.ndarray, x: int, y: int, w: int, h: int) -> None:
    """Measure one tile. sel is the boundary's cells in the tile window."""

    acc["tilesRead"] += 1
    acc["cells"] += int(np.count_nonzero(sel))

    extent = bands["extent"].ReadAsArray(x, y, w, h)
    V2.validate_extent_values(extent)
    mapped = extent != NODATA
    acc["unmappedCells"] += int(np.count_nonzero(sel & ~mapped))

    # The v3 trajectory walk, set A only, over the tile; cells outside the
    # boundary are walked and then ignored, as v3 walks a strip.
    captured: dict[str, np.ndarray] = {}

    def read_year(year: int) -> np.ndarray:
        a = bands[f"lc{year}"].ReadAsArray(x, y, w, h)
        if year == FIRST_YEAR:
            captured["first"] = a
        return a

    st, unk, u0, u255, _last = V3.walk(read_year, sel)
    s = st["A"]
    state = V3.cell_state(s, unk, sel)
    known_lost = sel & ~unk & s["lost"]
    treed_first = V3.LUTS["A"][captured["first"]] == 1
    acc["unknownCells"] += int(np.count_nonzero(sel & unk))
    acc["unknownClass0Cells"] += int(np.count_nonzero(sel & u0))
    acc["unknownNodataCells"] += int(np.count_nonzero(sel & u255))
    acc["states"] += np.bincount(state[sel], minlength=7).astype(np.int64)
    acc["treedCellsByYear"] += s["treed"]
    acc["recoveredAnyLossCells"] += int(np.count_nonzero(known_lost & s["rec"]))
    acc["lostTreedIn1984Cells"] += int(np.count_nonzero(known_lost & treed_first))

    harvest = bands["harvest"].ReadAsArray(x, y, w, h)
    fire = bands["fire"].ReadAsArray(x, y, w, h)
    for key, raster in (("harvest", harvest), ("fire", fire)):
        bins, other = _year_bins(raster[sel])
        acc[f"{key}CellsByYear"] += bins
        acc[f"{key}OtherValueCells"] += other
        recorded = (raster >= DIST_YEARS[0]) & (raster <= DIST_YEARS[-1])
        acc[f"{key}InUnknownCells"] += int(np.count_nonzero(sel & unk & recorded))
        acc[f"{key}InUnmappedCells"] += int(np.count_nonzero(sel & ~mapped & recorded))

    if np.any(known_lost):
        cause = V3.cause_of(s["latest"], fire, harvest)[known_lost].astype(np.int64)
        latest = s["latest"][known_lost].astype(np.int64)
        if latest.min() < DIST_YEARS[0] or latest.max() > DIST_YEARS[-1]:
            fail("A lost cell carries a latest loss year outside 1985 to 2022")
        lost_state = state[known_lost]
        state_index = np.full(lost_state.shape, -1, np.int64)
        for i, code in enumerate(LOST_STATES):
            state_index[lost_state == code] = i
        if np.any(state_index < 0):
            fail("A lost cell is in a state other than recovered, no return or unconfirmed")
        code = ((latest - DIST_YEARS[0]) * len(LOST_STATES) + state_index) * len(CAUSE_NAMES) + cause
        acc["lostByLatestYearStateCause"] += np.bincount(code, minlength=LOST_CODES).astype(np.int64)

    # The phase 3 whole-record union, from the phase 3 rasters themselves.
    m84 = bands["p3Mask1984"].ReadAsArray(x, y, w, h)
    V2.validate_values(m84, "Forest mask 1984")
    forest84 = (m84 == 1) & mapped
    forest84_nodata = (m84 == NODATA) & mapped
    loss_any = np.zeros(sel.shape, bool)
    loss_nodata = np.zeros(sel.shape, bool)
    for a, b in LOSS_PAIRS:
        values = bands[f"p3Loss{a}"].ReadAsArray(x, y, w, h)
        V2.validate_values(values, f"Loss raster {a}-{b}")
        loss_any |= (values == 1) & mapped
        loss_nodata |= (values == NODATA) & mapped
    p3_union = sel & forest84 & loss_any & ~loss_nodata
    p3_unknown = sel & (~mapped | forest84_nodata | (mapped & loss_nodata))
    acc["p3UnionLossCells"] += int(np.count_nonzero(p3_union))
    acc["p3KnownForestCells"] += int(np.count_nonzero(sel & forest84 & ~loss_nodata))
    acc["p3UnknownCells"] += int(np.count_nonzero(p3_unknown))
    acc["p3UnionVersusLostTreedIn1984MismatchCells"] += int(
        np.count_nonzero(p3_union ^ (known_lost & treed_first))
    )
    acc["p3UnknownVersusUnknownMismatchCells"] += int(np.count_nonzero(p3_unknown ^ (sel & unk)))


def _finish(acc: dict[str, Any]) -> dict[str, Any]:
    states = acc["states"]
    lost_tab = acc["lostByLatestYearStateCause"].reshape(len(DIST_YEARS), len(LOST_STATES), len(CAUSE_NAMES))
    lost = int(lost_tab.sum())
    if lost != int(states[V3.RECOVERED] + states[V3.NOT_RECOVERED] + states[V3.UNCONFIRMED]):
        fail("Lost cross-tab and state counts disagree")
    if int(states.sum()) != acc["cells"] or int(states[V3.OUTSIDE]) != 0:
        fail("Every boundary cell must carry exactly one in-boundary state")
    if int(states[V3.UNKNOWN]) != acc["unknownCells"]:
        fail("Unknown state count differs from the Unknown count")
    if int(acc["harvestCellsByYear"].sum()) != acc["cells"] or int(acc["fireCellsByYear"].sum()) != acc["cells"]:
        fail("Harvest bins do not account for every cell")
    by_year_state = lost_tab.sum(axis=2)
    out = {
        "cells": acc["cells"],
        "unmappedCells": acc["unmappedCells"],
        "unknownCells": acc["unknownCells"],
        "unknownClass0Cells": acc["unknownClass0Cells"],
        "unknownNodataCells": acc["unknownNodataCells"],
        "knownCells": acc["cells"] - acc["unknownCells"],
        "neverTreedCells": int(states[V3.NEVER_TREED]),
        "treedNotLostCells": int(states[V3.TREED_NOT_LOST]),
        "lostCells": lost,
        "lostTreedIn1984Cells": acc["lostTreedIn1984Cells"],
        "cause": {name: int(lost_tab[:, :, i].sum()) for i, name in enumerate(CAUSE_NAMES)},
        "latestLoss": {name: int(lost_tab[:, i, :].sum()) for i, name in enumerate(LOST_STATE_NAMES)},
        "latestLossFrom2018": {
            name: int(by_year_state[CANNOT_RECOVER_FROM - DIST_YEARS[0]:, i].sum())
            for i, name in enumerate(LOST_STATE_NAMES)
        },
        "recoveredAnyLossCells": acc["recoveredAnyLossCells"],
        "harvestCellsByYear": [int(v) for v in acc["harvestCellsByYear"][1:]],
        "fireCellsByYear": [int(v) for v in acc["fireCellsByYear"][1:]],
        "harvestOtherValueCells": acc["harvestOtherValueCells"],
        "fireOtherValueCells": acc["fireOtherValueCells"],
        "harvestInUnknownCells": acc["harvestInUnknownCells"],
        "fireInUnknownCells": acc["fireInUnknownCells"],
        "harvestInUnmappedCells": acc["harvestInUnmappedCells"],
        "fireInUnmappedCells": acc["fireInUnmappedCells"],
        "treedCellsByYear": [int(v) for v in acc["treedCellsByYear"]],
        "lostByLatestYearStateCause": [int(v) for v in acc["lostByLatestYearStateCause"]],
        "phase3": {
            "unionLossCells": acc["p3UnionLossCells"],
            "knownForestCells": acc["p3KnownForestCells"],
            "unknownCells": acc["p3UnknownCells"],
            "unionVersusLostTreedIn1984MismatchCells": acc["p3UnionVersusLostTreedIn1984MismatchCells"],
            "unknownVersusUnknownMismatchCells": acc["p3UnknownVersusUnknownMismatchCells"],
        },
        "tilesRead": acc["tilesRead"],
    }
    if sum(out["cause"].values()) != lost or sum(out["latestLoss"].values()) != lost:
        fail("Cause or latest-loss parts do not add to the lost cells")
    if out["latestLossFrom2018"]["recovered"] != 0:
        fail("A loss from 2018 on cannot show five treed years by 2022")
    return out


def _raw(acc: dict[str, Any]) -> dict[str, Any]:
    return {k: (v.tolist() if isinstance(v, np.ndarray) else v) for k, v in acc.items()}


def _merge_raw(parts: list[dict[str, Any]]) -> dict[str, Any]:
    total = _empty()
    for part in parts:
        for key, value in part.items():
            if isinstance(total[key], np.ndarray):
                total[key] += np.asarray(value, dtype=np.int64)
            else:
                total[key] += value
    return total


def _summarize(payload: tuple[dict[str, Any], dict[str, Any]]) -> dict[str, Any]:
    config, feature = payload
    state = _open_state(config)
    bands = state["bands"]
    started = time.monotonic()
    acc = _empty()
    if feature["kind"] == "polygon":
        geometry = ogr.CreateGeometryFromWkb(feature["wkb"])
        if geometry is None or geometry.IsEmpty():
            fail(f"Boundary {feature['id']} lost its geometry crossing into the worker")
        xoff, yoff, width, height = V2.pixel_window(state["reference"], geometry.GetEnvelope())
        if width > 0 and height > 0:
            mask_path, mask_dataset, _scratch = V2.create_feature_mask(
                geometry, state["crsWkt"], state["transform"], xoff, yoff, width, height
            )
            try:
                mask_band = mask_dataset.GetRasterBand(1)
                for row in range(0, height, ROW_TILE):
                    for column in range(0, width, COLUMN_TILE):
                        rows = min(ROW_TILE, height - row)
                        columns = min(COLUMN_TILE, width - column)
                        sel = mask_band.ReadAsArray(column, row, columns, rows).astype(bool)
                        if not np.any(sel):
                            continue
                        _tile(acc, bands, sel, xoff + column, yoff + row, columns, rows)
            finally:
                mask_dataset = None
                if os.path.exists(mask_path):
                    os.unlink(mask_path)
        result = {"boundaryId": feature["id"], "boundaryName": feature["name"], **_finish(acc)}
    elif feature["kind"] == "province-band":
        # A band of rows of a province mask raster (value 1 = in the province),
        # the same mask the province figures were measured over.
        win = feature["window"]
        mask = gdal.Open(feature["mask"], gdal.GA_ReadOnly)
        try:
            band = mask.GetRasterBand(1)
            for row in range(feature["row0"], feature["row1"], ROW_TILE):
                rows = min(ROW_TILE, feature["row1"] - row)
                for column in range(0, win["xsize"], COLUMN_TILE):
                    columns = min(COLUMN_TILE, win["xsize"] - column)
                    sel = band.ReadAsArray(column, row, columns, rows) == 1
                    if not np.any(sel):
                        continue
                    _tile(acc, bands, sel, win["xoff"] + column, win["yoff"] + row, columns, rows)
        finally:
            mask = None
        result = {"boundaryId": feature["id"], "band": [feature["row0"], feature["row1"]], "raw": _raw(acc)}
    else:
        fail(f"Unknown feature kind {feature['kind']}")
    result["elapsedSeconds"] = round(time.monotonic() - started, 3)
    return result


def rasters(args: argparse.Namespace) -> dict[str, str]:
    paths = {
        "p3Mask1984": os.path.join(args.forest_mask_dir, f"forest-mask-{FIRST_YEAR}.tif"),
        "extent": args.mapped_extent,
        "harvest": args.harvest,
        "fire": args.fire,
    }
    for a, b in LOSS_PAIRS:
        paths[f"p3Loss{a}"] = os.path.join(args.annual_loss_dir, f"detected-forest-loss-{a}-{b}.tif")
    for year in V3.YEARS:
        paths[f"lc{year}"] = os.path.join(args.lc_dir, f"CA_forest_VLCE2_{year}.tif")
    for path in paths.values():
        if not os.path.isfile(path):
            fail(f"Missing required raster: {path}")
    return paths


def _envelope_cells(wkb: bytes) -> float:
    minx, maxx, miny, maxy = ogr.CreateGeometryFromWkb(wkb).GetEnvelope()
    return (maxx - minx) * (maxy - miny) / 900.0


def polygon_features(args: argparse.Namespace, crs_wkt: str) -> list[dict[str, Any]]:
    features = P3.read_boundaries(args, crs_wkt)
    wanted = set(args.only_ids.split(",")) if args.only_ids else None
    prefixes = tuple(args.id_prefixes.split(",")) if args.id_prefixes else None
    out = []
    for boundary_id, name, wkb in features:
        if wanted is not None and boundary_id not in wanted:
            continue
        if prefixes is not None and not boundary_id.startswith(prefixes):
            continue
        out.append({"kind": "polygon", "id": boundary_id, "name": name, "wkb": wkb,
                    "envelopeCells": _envelope_cells(wkb)})
    if wanted is not None and len(out) != len(wanted):
        fail(f"Asked for {len(wanted)} boundaries, found {len(out)}")
    return out


def province_features(args: argparse.Namespace) -> list[dict[str, Any]]:
    windows = json.load(open(args.province_windows))["provinces"]
    out = []
    for slug in args.provinces.split(","):
        entry = windows[slug]
        mask = os.path.join(args.province_mask_dir, os.path.basename(entry["mask"]))
        win = entry["window"]
        row_start, row_end = 0, win["ysize"]
        if args.province_rows:
            row_start, row_end = (int(v) for v in args.province_rows.split(":"))
        for r0 in range(row_start, row_end, args.province_band_rows):
            r1 = min(row_end, r0 + args.province_band_rows)
            out.append({"kind": "province-band", "id": slug, "name": entry["name"], "mask": mask,
                        "window": win, "row0": r0, "row1": r1, "envelopeCells": float((r1 - r0) * win["xsize"])})
    return out


def describe(kind: str, path: str, digests: dict[str, dict[str, Any]] | None) -> dict[str, Any]:
    local = V2.local_source_path(path)
    stat = os.stat(local)
    entry = {"kind": kind, "path": path, "byteLength": stat.st_size}
    if digests is None:          # a trial run: inputs are not hashed
        entry["sha256"] = None
        return entry
    known = digests.get(local)
    # A digest taken before the run is reused only if the file is unchanged.
    if known and known["byteLength"] == stat.st_size and known["mtimeNs"] == stat.st_mtime_ns:
        entry["sha256"] = known["sha256"]
    else:
        entry["sha256"] = V2.sha256(path)
    return entry


def main(args: argparse.Namespace) -> None:
    if os.path.exists(args.output) or os.path.exists(args.sidecar):
        fail("Refusing to overwrite an existing output or sidecar")
    gdal.UseExceptions()
    ogr.UseExceptions()
    paths = rasters(args)
    reference = gdal.Open(paths["p3Mask1984"], gdal.GA_ReadOnly)
    V2.validate_raster_metadata(reference, "Forest mask 1984")
    cell_hectares = V2.validate_projected_metre_grid(reference)
    crs_wkt = reference.GetProjection()
    reference = None

    if args.boundary_set == "provinces":
        features = province_features(args)
    else:
        features = polygon_features(args, crs_wkt)
    if not features:
        fail("No boundaries selected")
    # Largest first, so the longest boundary does not start last.
    features.sort(key=lambda f: -f["envelopeCells"])
    config = {"rasters": paths, "gdalCacheBytes": args.gdal_cache_megabytes * 1024 * 1024}

    started_at = datetime.now(timezone.utc)
    started = time.monotonic()
    payloads = [(config, f) for f in features]
    results = []
    context = get_context("spawn")
    with context.Pool(processes=max(1, args.workers), maxtasksperchild=args.max_tasks_per_child) as pool:
        for index, result in enumerate(pool.imap_unordered(_summarize, payloads, chunksize=1), start=1):
            results.append(result)
            print(f"{index}/{len(payloads)} {result['boundaryId']} ({result['elapsedSeconds']}s)",
                  file=sys.stderr, flush=True)

    if args.boundary_set == "provinces":
        merged = []
        for slug in args.provinces.split(","):
            parts = sorted((r for r in results if r["boundaryId"] == slug), key=lambda r: r["band"][0])
            name = next(f["name"] for f in features if f["id"] == slug)
            total = _merge_raw([p["raw"] for p in parts])
            merged.append({"boundaryId": slug, "boundaryName": name, **_finish(total), "bands": len(parts),
                           "elapsedSeconds": round(sum(p["elapsedSeconds"] for p in parts), 3)})
        results = merged
    results.sort(key=lambda row: row["boundaryId"])

    digests = None if args.trial_no_input_hashes else (json.load(open(args.input_digests)) if args.input_digests else {})
    inputs = [describe(kind, path, digests) for kind, path in sorted(paths.items())]
    if args.boundary_set == "provinces":
        inputs.append(describe("provinceWindows", args.province_windows, digests))
        windows = json.load(open(args.province_windows))["provinces"]
        for slug in args.provinces.split(","):
            inputs.append(describe(f"provinceMask:{slug}",
                                   os.path.join(args.province_mask_dir, os.path.basename(windows[slug]["mask"])),
                                   digests))
    else:
        inputs.append(describe("boundaries", args.boundaries, digests))

    document = {
        "schema": "witness-tree/place-cause-recovery-zonal/1",
        "boundarySet": args.boundary_set,
        "jurisdiction": args.jurisdiction,
        "boundaryEdition": args.boundary_edition,
        "methodVersion": args.method_version,
        "codeVersion": args.code_version,
        "productionClaim": False,
        "admissionStatus": "not-admitted",
        "cellHectares": cell_hectares,
        "firstYear": FIRST_YEAR,
        "lastYear": LAST_YEAR,
        "disturbanceYears": list(DIST_YEARS),
        "disturbanceBaselineYear": FIRST_YEAR,
        "disturbanceBaselineMeaning": "1984 has no datable change and is Unknown, never zero; it is not emitted",
        "treedClasses": list(V3.SETS["A"]),
        "vlce2Legend": list(V3.LEGEND),
        "confirmYears": V3.CONFIRM,
        "causeWindowYears": V3.CAUSE_WINDOW,
        "cannotRecoverFromYear": CANNOT_RECOVER_FROM,
        "lossYearMeaning": "first year not treed after a treed year",
        "causeNames": list(CAUSE_NAMES),
        "latestLossStateNames": list(LOST_STATE_NAMES),
        "lostByLatestYearStateCauseOrder": "latest loss year 1985..2022, then latest-loss state, then cause; cause varies fastest",
        "unknownPolicy": "a cell off the VLCE2 legend in any year is Unknown for the whole record and is never counted as lost, not lost, or zero",
        "districts": results,
    }
    with open(args.output, "x", encoding="utf-8") as target:
        json.dump(document, target, indent=1)
        target.write("\n")

    worker = str(Path(__file__).resolve())
    sidecar = {
        "schema": "witness-tree/place-cause-recovery-zonal-provenance/1",
        "output": os.path.basename(args.output),
        "outputSha256": V2.sha256(args.output),
        "outputByteLength": V2.file_bytes(args.output),
        "startedAt": started_at.isoformat().replace("+00:00", "Z"),
        "completedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "elapsedSeconds": round(time.monotonic() - started, 3),
        "workers": args.workers,
        "cpuCount": os.cpu_count(),
        "districtCount": len(results),
        "worker": {"path": worker, "sha256": V2.sha256(worker)},
        "helpers": [
            {"path": str(HERE / name), "sha256": V2.sha256(str(HERE / name))}
            for name in ("phase3_interval_zonal_aggregate.py", "phase2_annual_zonal_aggregate_v2.py",
                         "phase4_condition_recovery_v3.py")
        ],
        "inputsReadFrom": args.inputs_note,
        "inputs": inputs,
    }
    with open(args.sidecar, "x", encoding="utf-8") as target:
        json.dump(sidecar, target, indent=2)
        target.write("\n")
    print(f"wrote {args.output} ({len(results)} boundaries, {round(time.monotonic() - started, 1)}s)",
          file=sys.stderr)


def hash_inputs(output: str, paths: list[str]) -> None:
    """Hash input files once, before a run, so every sidecar can cite them."""
    if os.path.exists(output):
        fail(f"Refusing to overwrite {output}")
    out = {}
    for path in paths:
        local = V2.local_source_path(path)
        stat = os.stat(local)
        out[local] = {"sha256": V2.sha256(local), "byteLength": stat.st_size, "mtimeNs": stat.st_mtime_ns}
        print(f"hashed {local}", file=sys.stderr, flush=True)
    with open(output, "x", encoding="utf-8") as target:
        json.dump(out, target, indent=1)
        target.write("\n")


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--boundary-set", required=True, help="csd, federal, bc, ab, on, qc or provinces")
    p.add_argument("--lc-dir", required=True)
    p.add_argument("--harvest", required=True)
    p.add_argument("--fire", required=True)
    p.add_argument("--forest-mask-dir", required=True)
    p.add_argument("--annual-loss-dir", required=True)
    p.add_argument("--mapped-extent", required=True)
    p.add_argument("--boundaries", default="")
    p.add_argument("--boundary-id-field", default="")
    p.add_argument("--boundary-name-field", default="")
    p.add_argument("--id-prefixes", default="", help="keep boundary ids starting with these, comma-separated")
    p.add_argument("--only-ids", default="", help="trial: keep only these boundary ids")
    p.add_argument("--province-windows", default="")
    p.add_argument("--province-mask-dir", default="")
    p.add_argument("--provinces", default="british-columbia,alberta,ontario,quebec")
    p.add_argument("--province-band-rows", type=int, default=2048)
    p.add_argument("--province-rows", default="", help="trial: a row range r0:r1 of each province window")
    p.add_argument("--jurisdiction", required=True)
    p.add_argument("--boundary-edition", required=True)
    p.add_argument("--method-version", required=True)
    p.add_argument("--code-version", required=True)
    p.add_argument("--input-digests", default="")
    p.add_argument("--inputs-note", default="")
    p.add_argument("--trial-no-input-hashes", action="store_true", help="trial only: skip hashing the inputs")
    p.add_argument("--output", required=True)
    p.add_argument("--sidecar", required=True)
    p.add_argument("--workers", type=int, default=1)
    p.add_argument("--max-tasks-per-child", type=int, default=50)
    p.add_argument("--gdal-cache-megabytes", type=int, default=64)
    return p


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "hash-inputs":
        hash_inputs(sys.argv[2], sys.argv[3:])
    else:
        main(parser().parse_args())
