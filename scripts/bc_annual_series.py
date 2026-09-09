#!/usr/bin/env python3
"""The full 1984 to 2022 British Columbia annual series: land cover crossed against
harvest and fire year.

What this produces
------------------
For every one of the 39 VLCE2 years, over the British Columbia window:

  * the complete 13-class area histogram,
  * treed extent on both class sets, upland only and including wetland-treed,
  * the joint distribution of that year's land cover against the harvest year
    raster, and the same against the fire year raster.

The joint distributions are the point of the job. Holding, for every land-cover
year Y and every disturbance year D, the area of each class, lets any lag
question be answered afterwards without ever re-reading the rasters: what
harvested land looked like the year before it was cut, one year after, ten years
after, and whether it ever returns to a treed class. That is the project's
actual question, and a pair of endpoint maps cannot answer it.

Why the loop is tile-outer and year-inner
-----------------------------------------
The obvious loop is year-outer: for each year, sweep the province. It would read
the mask and both disturbance rasters 39 times over. Inverting the loop reads
them once per tile and reuses them across all 39 years, which turns 117 full
sweeps of the three fixed layers into 3. The cost is that all 39 land-cover
years must be extracted at once, about 54 GB.

Limits that belong with any number this produces
------------------------------------------------
These are the publisher's own, stated in the product READMEs, and they are not
incidental.

  * The disturbance products cover Canada's forested ecosystems, roughly
    650 Mha, not the whole country. Absence of a disturbance year outside that
    footprint is not evidence that nothing happened. It is Unknown.
  * An agricultural mask was applied during change detection, so changes near
    agricultural land may be absent by construction.
  * Each pixel carries one change year. Land harvested twice is recorded once,
    so repeat disturbance is not representable in this product at all.
  * The compositing window is August 1 plus or minus 30 days, so a change after
    31 August may be attributed to the following year. The publisher's own
    accuracy assessment puts 97.7 percent of changes within one year.
  * Land cover and disturbance are both derived from the same Landsat
    best-available-pixel composites. Crossing them is not independent
    validation, and nothing here may be used as though it were.
"""
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np

from bc_forest_window import (
    DATA_ROOT, HA_PER_CELL, TILE, VLCE2_CLASS_NAMES, VLCE2_CODES,
    VLCE2_TREED_ALL, VLCE2_TREED_UPLAND, WORKERS, assert_aligned, read_window, tiles,
)

WORKSPACE = os.environ.get(
    "WITNESS_TREE_BC_ANNUAL_WORKSPACE", f"{DATA_ROOT}/derived/bc-annual-series-20260909"
)
MASK = os.environ.get(
    "WITNESS_TREE_BC_MASK", f"{DATA_ROOT}/derived/bc-treed-extent-20260909/bc_mask.tif"
)
HARVEST = f"{WORKSPACE}/rasters/CA_Forest_Harvest_1985-2022.tif"
FIRE = f"{WORKSPACE}/rasters/CA_Forest_Fire_1985-2022.tif"
LC_DIR = f"{WORKSPACE}/lc"

LC_YEARS = list(range(1984, 2023))
# The disturbance products start in 1985; 0 means no recorded disturbance, which
# inside the forested footprint means none detected and outside it means Unknown.
DIST_YEARS = list(range(1985, 2023))
DIST_BINS = [0] + DIST_YEARS  # index 0 is "no recorded disturbance"

CODE_INDEX = {code: i for i, code in enumerate(VLCE2_CODES)}
N_CLASS = len(VLCE2_CODES)
N_DIST = len(DIST_BINS)


def _class_index(lc):
    """Map raw VLCE2 codes to dense indices, with a spare slot for anything else.

    An unmapped code must never be silently folded into class 0; it gets its own
    bucket so the run reports it rather than absorbing it.
    """
    out = np.full(lc.shape, N_CLASS, dtype=np.uint8)
    for code, i in CODE_INDEX.items():
        out[lc == code] = i
    return out


def _dist_index(raster):
    """Map a disturbance-year raster to dense indices, 0 meaning none recorded."""
    out = np.zeros(raster.shape, dtype=np.uint8)
    for i, year in enumerate(DIST_YEARS, start=1):
        out[raster == year] = i
    return out


def process_tile(args):
    x0, y0, w, h = args
    bc = read_window(MASK, x0, y0, w, h).astype(bool)
    n_bc = int(bc.sum())
    if n_bc == 0:
        return None

    harvest = _dist_index(read_window(HARVEST, x0, y0, w, h))[bc]
    fire = _dist_index(read_window(FIRE, x0, y0, w, h))[bc]

    n_years = len(LC_YEARS)
    classes = np.zeros((n_years, N_CLASS + 1), dtype=np.int64)
    treed_upland = np.zeros(n_years, dtype=np.int64)
    treed_all = np.zeros(n_years, dtype=np.int64)
    joint_h = np.zeros((n_years, N_CLASS + 1, N_DIST), dtype=np.int64)
    joint_f = np.zeros((n_years, N_CLASS + 1, N_DIST), dtype=np.int64)

    upland = {CODE_INDEX[c] for c in VLCE2_TREED_UPLAND}
    treed = {CODE_INDEX[c] for c in VLCE2_TREED_ALL}

    for yi, year in enumerate(LC_YEARS):
        lc = _class_index(read_window(f"{LC_DIR}/CA_forest_VLCE2_{year}.tif", x0, y0, w, h))[bc]
        counts = np.bincount(lc, minlength=N_CLASS + 1)
        classes[yi] = counts
        treed_upland[yi] = sum(int(counts[i]) for i in upland)
        treed_all[yi] = sum(int(counts[i]) for i in treed)
        # One bincount over a combined index is far cheaper than a per-class mask.
        joint_h[yi] = np.bincount(
            lc.astype(np.int64) * N_DIST + harvest, minlength=(N_CLASS + 1) * N_DIST
        ).reshape(N_CLASS + 1, N_DIST)
        joint_f[yi] = np.bincount(
            lc.astype(np.int64) * N_DIST + fire, minlength=(N_CLASS + 1) * N_DIST
        ).reshape(N_CLASS + 1, N_DIST)

    return n_bc, classes, treed_upland, treed_all, joint_h, joint_f


def main():
    for path in (MASK, HARVEST, FIRE):
        assert_aligned(path)
    missing = [y for y in LC_YEARS if not os.path.exists(f"{LC_DIR}/CA_forest_VLCE2_{y}.tif")]
    if missing:
        raise SystemExit(f"missing extracted land-cover years: {missing}")
    for year in LC_YEARS:
        assert_aligned(f"{LC_DIR}/CA_forest_VLCE2_{year}.tif")

    work = tiles()
    started = time.time()
    print(f"[{time.strftime('%H:%M:%S')}] {len(work)} tiles, {len(LC_YEARS)} years, {WORKERS} workers", flush=True)

    n_years = len(LC_YEARS)
    total_bc = 0
    classes = np.zeros((n_years, N_CLASS + 1), dtype=np.int64)
    treed_upland = np.zeros(n_years, dtype=np.int64)
    treed_all = np.zeros(n_years, dtype=np.int64)
    joint_h = np.zeros((n_years, N_CLASS + 1, N_DIST), dtype=np.int64)
    joint_f = np.zeros((n_years, N_CLASS + 1, N_DIST), dtype=np.int64)

    done = 0
    with ProcessPoolExecutor(max_workers=WORKERS) as pool:
        for result in pool.map(process_tile, work, chunksize=1):
            done += 1
            if result is not None:
                n_bc, c, tu, ta, jh, jf = result
                total_bc += n_bc
                classes += c
                treed_upland += tu
                treed_all += ta
                joint_h += jh
                joint_f += jf
            if done % 20 == 0 or done == len(work):
                elapsed = time.time() - started
                rate = done / elapsed
                print(
                    f"[{time.strftime('%H:%M:%S')}] {done}/{len(work)} tiles, "
                    f"{elapsed / 60:.1f} min elapsed, "
                    f"{(len(work) - done) / rate / 60:.1f} min remaining",
                    flush=True,
                )

    unmapped = int(classes[:, N_CLASS].sum())
    if unmapped:
        print(f"WARNING: {unmapped} cell-years carried a VLCE2 code outside the known 13", flush=True)

    ha = lambda n: round(float(n) * HA_PER_CELL, 1)
    result = {
        "window": {"province": "British Columbia", "cells": total_bc, "hectares": ha(total_bc)},
        "years": LC_YEARS,
        "disturbanceBins": ["none"] + [str(y) for y in DIST_YEARS],
        "classCodes": list(VLCE2_CODES),
        "classNames": {str(k): v for k, v in VLCE2_CLASS_NAMES.items()},
        "unmappedCellYears": unmapped,
        "annual": {
            str(year): {
                "classHectares": {
                    VLCE2_CLASS_NAMES[code]: ha(classes[yi, CODE_INDEX[code]]) for code in VLCE2_CODES
                },
                "treedUplandHectares": ha(treed_upland[yi]),
                "treedAllHectares": ha(treed_all[yi]),
            }
            for yi, year in enumerate(LC_YEARS)
        },
        "jointLandCoverByHarvestYear": joint_h.tolist(),
        "jointLandCoverByFireYear": joint_f.tolist(),
        "jointAxes": "[landCoverYear][classIndex, 0..12 then 13=unmapped][disturbanceBin, 0=none]",
        "haPerCell": HA_PER_CELL,
        "elapsedSeconds": round(time.time() - started, 1),
        "publisherStatedLimits": [
            "The harvest and fire products cover Canada's forested ecosystems, about 650 Mha, not the whole country. Absence of a disturbance year outside that footprint is Unknown, not zero.",
            "An agricultural mask was applied during change detection, so changes near agricultural land may be absent by construction.",
            "Each pixel carries one change year, so repeat disturbance is not representable in this product.",
            "The compositing window is 1 August plus or minus 30 days; the publisher reports 97.7 percent of changes labelled within one year.",
            "Land cover and disturbance derive from the same Landsat best-available-pixel composites, so crossing them is not independent validation.",
        ],
    }
    out = f"{WORKSPACE}/bc-annual-series-1984-2022.json"
    with open(out, "w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2)
    print(f"[{time.strftime('%H:%M:%S')}] wrote {out} in {result['elapsedSeconds']} s", flush=True)


if __name__ == "__main__":
    sys.exit(main())
