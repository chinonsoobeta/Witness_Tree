#!/usr/bin/env python3
"""Hand spot checks of the place cause and recovery measurements.

For a few boundaries, this counts every figure again by a direct masked count
that shares no code with scripts/place_cause_recovery_zonal.py or the v3
worker. It reads the boundary from its own file, burns it into a grid window
at cell centres, reads the whole window of every raster at once, and follows
each cell's 39 land-cover years as one row of a table. The result is the same
flat row of integers data/place-cause-recovery-measurements.json stores, so
the checker can hold one to the other cell for cell.

Rules, restated from the v3 record rather than imported:
  treed      VLCE2 class 210, 220 or 230
  Unknown    any year whose class is not on the VLCE2 legend
  loss       treed in one year, not treed the next; dated to the later year
  treed again five or more treed years in a row after the latest loss
  unconfirmed not treed again, but treed in 2022 (a return under way)
  cause      fire or harvest year within one year of the latest loss year

Only small boundaries are suitable: the whole window of 39 years is held in
memory (about 40 bytes a cell).

Usage:
  python3 -I scripts/place_cause_recovery_spot_check.py --output spot-checks.json \
      --check SET:ID:BOUNDARY_FILE:ID_FIELD [--check ...] --lc-dir ... (see --help)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import time

import numpy as np
from osgeo import gdal, ogr, osr

gdal.UseExceptions()
ogr.UseExceptions()

FIRST, LAST = 1984, 2022
YEARS = list(range(FIRST, LAST + 1))
DIST_YEARS = list(range(FIRST + 1, LAST + 1))
LEGEND = np.array([20, 31, 32, 33, 40, 50, 80, 81, 100, 210, 220, 230])
TREED = np.array([210, 220, 230])
NODATA = 255
CONFIRM = 5
CUTOFF = 2018
CAUSES = 4        # not recorded, fire, harvest, both
STATES = 3        # treed again, no return, return under way


def window_for(geometry: ogr.Geometry, transform: tuple[float, ...], size: tuple[int, int]) -> tuple[int, int, int, int]:
    minx, maxx, miny, maxy = geometry.GetEnvelope()
    x0 = max(0, math.floor((minx - transform[0]) / transform[1]) - 1)
    x1 = min(size[0], math.ceil((maxx - transform[0]) / transform[1]) + 1)
    y0 = max(0, math.floor((maxy - transform[3]) / transform[5]) - 1)
    y1 = min(size[1], math.ceil((miny - transform[3]) / transform[5]) + 1)
    return x0, y0, x1 - x0, y1 - y0


def boundary(path: str, field: str, wanted: str, wkt: str) -> ogr.Geometry:
    source = ogr.Open(path)
    layer = source.GetLayer(0)
    target = osr.SpatialReference()
    target.ImportFromWkt(wkt)
    target.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    merged = None
    for feature in layer:
        if str(feature.GetField(field)).strip() != wanted:
            continue
        geometry = feature.GetGeometryRef().Clone()
        srs = geometry.GetSpatialReference() or layer.GetSpatialRef()
        srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
        geometry.Transform(osr.CoordinateTransformation(srs, target))
        if not geometry.IsValid():
            geometry = geometry.Buffer(0)
        merged = geometry if merged is None else merged.Union(geometry)
    if merged is None:
        raise SystemExit(f"{wanted} is not in {path}")
    return merged


def burn(geometry: ogr.Geometry, wkt: str, transform: tuple[float, ...], window: tuple[int, int, int, int]) -> np.ndarray:
    x0, y0, w, h = window
    grid = gdal.GetDriverByName("MEM").Create("", w, h, 1, gdal.GDT_Byte)
    grid.SetProjection(wkt)
    grid.SetGeoTransform((transform[0] + x0 * transform[1], transform[1], 0.0, transform[3] + y0 * transform[5], 0.0, transform[5]))
    memory = ogr.GetDriverByName("Memory").CreateDataSource("")
    srs = osr.SpatialReference()
    srs.ImportFromWkt(wkt)
    layer = memory.CreateLayer("b", srs, geometry.GetGeometryType())
    feature = ogr.Feature(layer.GetLayerDefn())
    feature.SetGeometry(geometry)
    layer.CreateFeature(feature)
    gdal.RasterizeLayer(grid, [1], layer, burn_values=[1])
    return grid.GetRasterBand(1).ReadAsArray() == 1


def read(path: str, window: tuple[int, int, int, int], sel: np.ndarray) -> np.ndarray:
    dataset = gdal.Open(path)
    data = dataset.GetRasterBand(1).ReadAsArray(*window)
    dataset = None
    return data[sel]


def check(args: argparse.Namespace, spec: str) -> dict:
    set_key, wanted, path, field = spec.split(":", 3)
    started = time.monotonic()
    reference = gdal.Open(os.path.join(args.lc_dir, f"CA_forest_VLCE2_{FIRST}.tif"))
    wkt, transform = reference.GetProjection(), reference.GetGeoTransform()
    geometry = boundary(path, field, wanted, wkt)
    window = window_for(geometry, transform, (reference.RasterXSize, reference.RasterYSize))
    sel = burn(geometry, wkt, transform, window)

    lc = np.stack([read(os.path.join(args.lc_dir, f"CA_forest_VLCE2_{y}.tif"), window, sel) for y in YEARS])  # (39, n)
    extent = read(args.mapped_extent, window, sel)
    harvest = read(args.harvest, window, sel).astype(np.int32)
    fire = read(args.fire, window, sel).astype(np.int32)
    mask84 = read(os.path.join(args.forest_mask_dir, f"forest-mask-{FIRST}.tif"), window, sel)
    losses = np.stack([read(os.path.join(args.annual_loss_dir, f"detected-forest-loss-{y}-{y + 1}.tif"), window, sel) for y in YEARS[:-1]])

    cells = int(sel.sum())
    unknown = ~np.isin(lc, LEGEND).all(axis=0)
    known = ~unknown
    treed = np.isin(lc, TREED)                                   # (39, n)
    lost_pair = treed[:-1] & ~treed[1:]                          # loss dated to the later year
    lost = known & lost_pair.any(axis=0)
    never = known & ~treed.any(axis=0)
    treed_not_lost = known & treed.any(axis=0) & ~lost
    n_years = len(YEARS)
    # index in YEARS of the latest loss year (the later year of the last pair)
    latest_index = np.where(lost, n_years - 1 - np.argmax(lost_pair[::-1], axis=0), -1)
    latest_year = np.where(lost, FIRST + latest_index, 0)

    def longest_run_after(column: int, start: int) -> int:
        best = run = 0
        for t in range(start + 1, n_years):
            run = run + 1 if treed[t, column] else 0
            best = max(best, run)
        return best

    first_index = np.where(lost, 1 + np.argmax(lost_pair, axis=0), -1)
    state = np.full(cells, -1)
    recovered_any = 0
    for column in np.flatnonzero(lost):
        if longest_run_after(column, latest_index[column]) >= CONFIRM:
            state[column] = 0
        elif treed[-1, column]:
            state[column] = 2
        else:
            state[column] = 1
        if longest_run_after(column, first_index[column]) >= CONFIRM:
            recovered_any += 1
    fire_near = (fire > 0) & (np.abs(fire - latest_year) <= 1)
    harvest_near = (harvest > 0) & (np.abs(harvest - latest_year) <= 1)
    cause = fire_near.astype(int) + 2 * harvest_near.astype(int)

    lost_table = np.zeros(2 * STATES * CAUSES, np.int64)
    for column in np.flatnonzero(lost):
        period = 1 if latest_year[column] >= CUTOFF else 0
        lost_table[(period * STATES + state[column]) * CAUSES + cause[column]] += 1

    mapped = extent != NODATA
    loss_any = ((losses == 1) & mapped).any(axis=0)
    loss_nodata = ((losses == NODATA) & mapped).any(axis=0)
    forest84 = (mask84 == 1) & mapped
    p3_union = forest84 & loss_any & ~loss_nodata
    p3_known = forest84 & ~loss_nodata
    p3_unknown = ~mapped | ((mask84 == NODATA) & mapped) | loss_nodata

    counts = [
        cells, int((~mapped).sum()), int(unknown.sum()), int(known.sum()),
        int(never.sum()), int(treed_not_lost.sum()), int(lost.sum()),
        int((lost & treed[0]).sum()), recovered_any,
        int(p3_union.sum()), int(p3_known.sum()), int(p3_unknown.sum()),
    ]
    by_year = lambda raster: [int((raster == y).sum()) for y in DIST_YEARS]
    row = counts + [int(n) for n in lost_table] + by_year(harvest) + by_year(fire)
    with open(path, "rb") as handle:     # a plain boundary file, not a /vsizip/ member
        digest = hashlib.sha256(handle.read()).hexdigest()
    return {
        "set": set_key, "id": wanted, "boundaryFile": path, "boundaryFileSha256": digest, "idField": field,
        "window": list(window), "method": "direct masked count: boundary burned at cell centres into its own window, whole-window reads, per-cell trajectories",
        "row": row, "elapsedSeconds": round(time.monotonic() - started, 3),
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--check", action="append", required=True, help="SET:ID:BOUNDARY_FILE:ID_FIELD")
    p.add_argument("--lc-dir", required=True)
    p.add_argument("--harvest", required=True)
    p.add_argument("--fire", required=True)
    p.add_argument("--forest-mask-dir", required=True)
    p.add_argument("--annual-loss-dir", required=True)
    p.add_argument("--mapped-extent", required=True)
    p.add_argument("--output", required=True)
    args = p.parse_args()
    checks = [check(args, spec) for spec in args.check]
    with open(args.output, "x", encoding="utf-8") as handle:
        json.dump({"schema": "witness-tree/place-cause-recovery-spot-checks/1", "worker": "scripts/place_cause_recovery_spot_check.py",
                   "workerSha256": hashlib.sha256(open(__file__, "rb").read()).hexdigest(),
                   "executedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "checks": checks}, handle, indent=1)
        handle.write("\n")
    for c in checks:
        print(f"{c['set']} {c['id']}: {c['row'][0]} cells, {c['row'][6]} lost ({c['elapsedSeconds']}s)")


if __name__ == "__main__":
    main()
