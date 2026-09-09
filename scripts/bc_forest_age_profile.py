#!/usr/bin/env python3
"""British Columbia read of the NTEMS forest-age 2022 product.

Age codes are 0 to 150 years, 151 for older than 150, and 255 for non-treed.
The companion approach raster records how each age was derived: 0 non-treed,
1 disturbance, 2 recovery, 3 allometric.

The approach layer matters more than the age layer for evidence purposes, which
is why this job reports the two together rather than publishing a mean age.
Only approach 1 is observed time since a satellite-detected stand-replacing
disturbance, and the Landsat record begins in 1985, so approach 1 can supply
almost nothing above forty years. Approach 3 models age by inverting allometric
equations against maps of forest structure and productivity. An age drawn from
approach 3 is therefore an inference from structure, which makes it unsuitable
as evidence for the NFI mature-tree-height condition: it would corroborate a
structure claim with a number derived from that same structure.
"""
import json
import multiprocessing as mp
import os
import time

import numpy as np
from bc_forest_window import (
    DATA_ROOT, HA_PER_CELL, TILE, VLCE2_TREED_ALL, WORKERS, XSIZE, YSIZE,
    assert_aligned, read_window,
)
from osgeo import gdal

TREED_WORKSPACE = os.environ.get(
    "WITNESS_TREE_BC_TREED_WORKSPACE", f"{DATA_ROOT}/derived/bc-treed-extent-20260909")
WORKSPACE = os.environ.get(
    "WITNESS_TREE_NTEMS_WORKSPACE",
    f"{DATA_ROOT}/derived/ntems-definitional-products-20260909")

MASK = f"{TREED_WORKSPACE}/bc_mask.tif"
LC = f"{TREED_WORKSPACE}/rasters/CA_forest_VLCE2_2022.tif"
AGE = f"{WORKSPACE}/rasters/nrcan-forest-age-2022/CA_forest_age_2022.tif"
APPROACH = f"{WORKSPACE}/rasters/nrcan-forest-age-2022/CA_forest_age_2022_approach.tif"
FAO = f"{WORKSPACE}/rasters/nrcan-fao-forest-2022/CA_FAO_forest_2022.tif"

AGE_BIN_EDGES = [0, 10, 20, 40, 60, 80, 100, 150, 151, 152]
NON_TREED = 255


def run_tile(args):
    x0, y0, w, h = args
    mask_ds = gdal.Open(MASK)
    bc = mask_ds.GetRasterBand(1).ReadAsArray(x0, y0, w, h).astype(bool)
    if not bc.any():
        return None

    age = read_window(AGE, x0, y0, w, h)[bc]
    approach = read_window(APPROACH, x0, y0, w, h)[bc]
    fao = read_window(FAO, x0, y0, w, h)[bc]
    lc = read_window(LC, x0, y0, w, h)[bc]

    aged = age != NON_TREED
    fao_forest = (fao == 1) | (fao == 2)
    vlce2_treed = np.isin(lc, VLCE2_TREED_ALL)

    out = {
        "bc_cells": int(bc.sum()),
        "age_hist": np.bincount(age, minlength=256).tolist(),
        "approach_hist": np.bincount(approach, minlength=4).tolist(),
        # Age availability against both forest definitions, so land we call
        # forest but cannot age stays visible rather than being averaged away.
        "fao_forest_cells": int(fao_forest.sum()),
        "fao_forest_aged": int((fao_forest & aged).sum()),
        "fao_current_aged": int(((fao == 1) & aged).sum()),
        "fao_temporal_aged": int(((fao == 2) & aged).sum()),
        "vlce2_treed_cells": int(vlce2_treed.sum()),
        "vlce2_treed_aged": int((vlce2_treed & aged).sum()),
    }
    for value in (1, 2, 3):
        m = approach == value
        out[f"age_bins_approach{value}"] = [
            int(((age >= AGE_BIN_EDGES[i]) & (age < AGE_BIN_EDGES[i + 1]) & m).sum())
            for i in range(len(AGE_BIN_EDGES) - 1)
        ]
    return out


def main():
    for path in (MASK, LC, AGE, APPROACH, FAO):
        assert_aligned(path)
    work = [
        (x, y, min(TILE, XSIZE - x), min(TILE, YSIZE - y))
        for y in range(0, YSIZE, TILE)
        for x in range(0, XSIZE, TILE)
    ]
    started = time.time()
    total, done = {}, 0
    with mp.Pool(WORKERS) as pool:
        for res in pool.imap_unordered(run_tile, work, chunksize=1):
            done += 1
            if res:
                for k, v in res.items():
                    if isinstance(v, list):
                        cur = total.setdefault(k, [0] * len(v))
                        for i, x in enumerate(v):
                            cur[i] += x
                    else:
                        total[k] = total.get(k, 0) + v
            if done % 40 == 0:
                elapsed = time.time() - started
                print(f"  {done}/{len(work)}  {elapsed:.1f}s  eta {elapsed / done * (len(work) - done):.0f}s", flush=True)
    total["elapsedSeconds"] = round(time.time() - started, 1)
    total["haPerCell"] = HA_PER_CELL
    total["ageBinEdges"] = AGE_BIN_EDGES
    out = f"{WORKSPACE}/bc-forest-age-2022.json"
    with open(out, "w") as handle:
        json.dump(total, handle, indent=2)
    print(f"wrote {out} in {total['elapsedSeconds']}s")


if __name__ == "__main__":
    main()
