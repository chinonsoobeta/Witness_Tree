#!/usr/bin/env python3
"""Phase 4: official records to cell runs on the national 30 m grid.

Reads one normalized record layer (EPSG:3978, fields rec, kind, year) and
writes, per event year, the cells each record covers as 16-byte little-endian
runs (row, x0, x1 inclusive, rec), sorted by row then x0. That is the layout of
data/phase2-four-province-cell-runs and of the per-cell loss store, so the
matcher can merge-join records against loss patches row by row.

Rasterization is GDAL's default rule (a cell belongs to a polygon when its
centre falls inside), the rule the province figures and the loss product use.
Each source is rasterized on its own (--src), so records from different
sources never overwrite one another. Within one source, records of the same
year that overlap keep the later record on the shared cells; overlaps across
years are kept, because each year is its own file.

Memory is bounded by design: each task is one year on one 4096 x 4096 tile
(64 MB of int32), a fixed pool of worker processes runs the tasks, and each task
returns only its runs. No task holds a whole province.
"""
import argparse, json, os, sys, time
from concurrent.futures import ProcessPoolExecutor
import numpy as np
from osgeo import gdal, ogr

gdal.UseExceptions()
ORIGIN_X, ORIGIN_Y, CELL = -2660910.524, 2998848.1105, 30.0
WIDTH, HEIGHT, BLOCK = 193936, 128340, 4096
RUN = np.dtype([("row", "<u4"), ("x0", "<u4"), ("x1", "<u4"), ("rec", "<u4")])


def encode_runs(tile, row0, col0):
    """Runs of equal non-zero values in each row of a tile, in row-major order."""
    padded = np.zeros((tile.shape[0], tile.shape[1] + 2), dtype=tile.dtype)
    padded[:, 1:-1] = tile
    rows, cols = np.nonzero(padded[:, 1:] != padded[:, :-1])
    if rows.size == 0:
        return np.zeros(0, dtype=RUN)
    # Consecutive boundaries in the same row bound one segment [c_k, c_{k+1} - 1].
    same_row = rows[:-1] == rows[1:]
    r, a, b = rows[:-1][same_row], cols[:-1][same_row], cols[1:][same_row] - 1
    value = tile[r, a]
    keep = value != 0
    out = np.empty(int(keep.sum()), dtype=RUN)
    out["row"] = r[keep] + row0
    out["x0"] = a[keep] + col0
    out["x1"] = b[keep] + col0
    out["rec"] = value[keep]
    return out


def task(args):
    gpkg, src, year, row0, col0, h, w = args
    ds = ogr.Open(gpkg)
    layer = ds.GetLayer("records")
    x_min, y_max = ORIGIN_X + col0 * CELL, ORIGIN_Y - row0 * CELL
    layer.SetAttributeFilter(f"year = {year} AND src = '{src}'")
    layer.SetSpatialFilterRect(x_min, y_max - h * CELL, x_min + w * CELL, y_max)
    if layer.GetFeatureCount() == 0:
        return year, np.zeros(0, dtype=RUN)
    target = gdal.GetDriverByName("MEM").Create("", w, h, 1, gdal.GDT_Int32)
    target.SetGeoTransform((x_min, CELL, 0, y_max, 0, -CELL))
    target.SetProjection(layer.GetSpatialRef().ExportToWkt())
    gdal.RasterizeLayer(target, [1], layer, options=["ATTRIBUTE=rec"])
    tile = target.GetRasterBand(1).ReadAsArray()
    target = None
    return year, encode_runs(tile, row0, col0)


def tiles_for(gpkg, src, year):
    ds = ogr.Open(gpkg)
    layer = ds.GetLayer("records")
    layer.SetAttributeFilter(f"year = {year} AND src = '{src}'")
    if layer.GetFeatureCount() == 0:
        return []
    x0, x1, y0, y1 = layer.GetExtent()
    c0, c1 = int((x0 - ORIGIN_X) // CELL), int((x1 - ORIGIN_X) // CELL) + 1
    r0, r1 = int((ORIGIN_Y - y1) // CELL), int((ORIGIN_Y - y0) // CELL) + 1
    c0, r0 = max(0, c0 // BLOCK * BLOCK), max(0, r0 // BLOCK * BLOCK)
    out = []
    for row in range(r0, min(r1, HEIGHT), BLOCK):
        for col in range(c0, min(c1, WIDTH), BLOCK):
            out.append((gpkg, src, year, row, col, min(BLOCK, HEIGHT - row), min(BLOCK, WIDTH - col)))
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--gpkg", required=True)
    parser.add_argument("--src", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--first-year", type=int, default=1980)
    parser.add_argument("--last-year", type=int, default=2027)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    started = time.time()
    ds = ogr.Open(args.gpkg)
    layer = ds.GetLayer("records")
    max_rec = int(ds.ExecuteSQL("SELECT MAX(rec) FROM records").GetNextFeature().GetField(0))
    ds = None
    cells = np.zeros(max_rec + 1, dtype=np.uint64)
    summary = {}
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        for year in range(args.first_year, args.last_year + 1):
            tasks = tiles_for(args.gpkg, args.src, year)
            if not tasks:
                continue
            parts = [runs for _, runs in pool.map(task, tasks, chunksize=1) if runs.size]
            runs = np.concatenate(parts) if parts else np.zeros(0, dtype=RUN)
            runs = runs[np.lexsort((runs["x0"], runs["row"]))]
            runs.tofile(os.path.join(args.out, f"{year}.runs.bin"))
            np.add.at(cells, runs["rec"], (runs["x1"] - runs["x0"] + 1).astype(np.uint64))
            summary[year] = {"tiles": len(tasks), "runs": int(runs.size), "cells": int((runs["x1"] - runs["x0"] + 1).sum())}
            print(year, summary[year], f"{time.time() - started:.0f}s", flush=True)
    cells.tofile(os.path.join(args.out, "record-cells.u64"))
    json.dump({"gpkg": args.gpkg, "src": args.src, "maxRec": int(max_rec), "years": summary, "seconds": round(time.time() - started, 1),
               "runLayout": "16-byte little-endian records: row, x0, x1 (inclusive), rec; sorted by row then x0",
               "rule": "GDAL default rasterization (cell centre inside), one source at a time; same-year overlaps within a source keep the later record"},
              open(os.path.join(args.out, "manifest.json"), "w"), indent=1)


if __name__ == "__main__":
    sys.exit(main())
