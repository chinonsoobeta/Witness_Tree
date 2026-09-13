#!/usr/bin/env python3
"""Canopy cover by VLCE2 class, British Columbia 2022.

This job exists to measure how much of each VLCE2 class carries at least the
NFI's 10 percent crown closure. It must be read as calibration, not validation,
and the reason is recorded in the product itself: the canopy cover raster
defines its own zero as "areas with no tree cover as defined by the annual
forest land cover map in 2022". The cover product was therefore zeroed using
the very classification under test, and it shares the Landsat lineage the
validation boundary excludes as independent truth.

The consequence is concrete and shows up in the output. Every non-treed class
reads exactly zero with a mean of exactly zero, which is not a plausible
empirical result for nine million hectares of Shrubs. It is the mask showing
through. So this job cannot test whether a non-treed class should be admitted
to a forest denominator. What it can do honestly is describe the within-class
cover distribution for the classes VLCE2 already calls treed.
"""
import json
import multiprocessing as mp
import os
import time

import numpy as np
from bc_forest_window import (
    DATA_ROOT, HA_PER_CELL, TILE, VLCE2_CODES, WORKERS, XSIZE, YSIZE,
    assert_aligned, read_window,
)
from osgeo import gdal

WORKSPACE = os.environ.get(
    "WITNESS_TREE_BC_TREED_WORKSPACE", f"{DATA_ROOT}/derived/bc-treed-extent-20260909")
MASK = f"{WORKSPACE}/bc_mask.tif"
LC = f"{WORKSPACE}/rasters/CA_forest_VLCE2_2022.tif"
CC = f"{WORKSPACE}/rasters/CA_canopy_cover_2022.tif"

NODATA = -3.402823e38
BINS = [0, 1e-9, 5, 10, 25, 50, 75, 100.0001]
BIN_LABELS = ["0", "(0,5)", "[5,10)", "[10,25)", "[25,50)", "[50,75)", "[75,100]"]


def run_tile(args):
    x0, y0, w, h = args
    mask_ds = gdal.Open(MASK)
    bc = mask_ds.GetRasterBand(1).ReadAsArray(x0, y0, w, h).astype(bool)
    if not bc.any():
        return None

    lc = read_window(LC, x0, y0, w, h)[bc]
    cc = read_window(CC, x0, y0, w, h)[bc]
    nodata = cc <= NODATA / 2

    out = {}
    for code in VLCE2_CODES:
        m = lc == code
        cells = int(m.sum())
        if cells == 0:
            continue
        valid = m & ~nodata
        values = cc[valid]
        hist = [
            int(((values >= BINS[i]) & (values < BINS[i + 1])).sum())
            for i in range(len(BINS) - 1)
        ]
        out[str(code)] = {
            "cells": cells,
            "nodata": int((m & nodata).sum()),
            "ge10": int((values >= 10).sum()),
            "sum": float(values.sum()),
            "hist": hist,
        }
    return out


def main():
    for path in (MASK, LC, CC):
        assert_aligned(path)
    work = [
        (x, y, min(TILE, XSIZE - x), min(TILE, YSIZE - y))
        for y in range(0, YSIZE, TILE)
        for x in range(0, XSIZE, TILE)
    ]
    started = time.time()
    classes, done = {}, 0
    with mp.Pool(WORKERS) as pool:
        for res in pool.imap_unordered(run_tile, work, chunksize=1):
            done += 1
            if res:
                for code, stats in res.items():
                    cur = classes.setdefault(
                        code, {"cells": 0, "nodata": 0, "ge10": 0, "sum": 0.0,
                               "hist": [0] * len(BIN_LABELS)})
                    cur["cells"] += stats["cells"]
                    cur["nodata"] += stats["nodata"]
                    cur["ge10"] += stats["ge10"]
                    cur["sum"] += stats["sum"]
                    for i, v in enumerate(stats["hist"]):
                        cur["hist"][i] += v
            if done % 40 == 0:
                elapsed = time.time() - started
                print(f"  {done}/{len(work)}  {elapsed:.1f}s  eta {elapsed / done * (len(work) - done):.0f}s", flush=True)

    for stats in classes.values():
        valid = stats["cells"] - stats["nodata"]
        stats["hectares"] = round(stats["cells"] * HA_PER_CELL, 2)
        stats["shareGe10Percent"] = round(stats["ge10"] / valid * 100, 4) if valid else None
        stats["meanPercent"] = round(stats["sum"] / valid, 4) if valid else None

    total = {
        "classes": classes,
        "binLabels": BIN_LABELS,
        "haPerCell": HA_PER_CELL,
        "elapsedSeconds": round(time.time() - started, 1),
    }
    out = f"{WORKSPACE}/bc-canopy-crosswalk-2022.json"
    with open(out, "w") as handle:
        json.dump(total, handle, indent=2)
    print(f"wrote {out} in {total['elapsedSeconds']}s")


if __name__ == "__main__":
    main()
