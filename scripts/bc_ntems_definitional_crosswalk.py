#!/usr/bin/env python3
"""British Columbia read of the NTEMS FAO-forest and treed-area products.

These two products are the publisher's own answers to questions the VLCE2
forest-mask decision record leaves open, so this job cross-tabulates them
against the VLCE2 class that produced our own baseline. A disagreement can then
be attributed to a class rather than reported as an unexplained total.

CA_treed_area_1984-2022 codes: 0 non-treed, 1 always-treed, 2 newly-treed,
3 was-treed. Treed in 1984 is 1 or 3; treed in 2022 is 1 or 2.

CA_FAO_forest_2022 codes: 0 non-forest, 1 current forest, 2 temporally informed
forest area, meaning ground whose trees were removed by fire or harvest and
which remains forest by land use because the trees will return.

Neither product is independent truth. Both descend from the same Landsat
composites and the same VLCE2 lineage the validation boundary excludes, so what
this job recovers is the publisher's crosswalk made explicit and testable. That
is a different and lesser thing than validation, and no result here can close
the forest-mask gate.
"""
import json
import multiprocessing as mp
import os
import time

from bc_forest_window import (
    DATA_ROOT, HA_PER_CELL, TILE, VLCE2_CODES, WORKERS, XSIZE, YSIZE,
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
FAO = f"{WORKSPACE}/rasters/nrcan-fao-forest-2022/CA_FAO_forest_2022.tif"
TREED = f"{WORKSPACE}/rasters/nrcan-treed-area-1984-2022/CA_treed_area_1984-2022.tif"


def run_tile(args):
    x0, y0, w, h = args
    mask_ds = gdal.Open(MASK)
    bc = mask_ds.GetRasterBand(1).ReadAsArray(x0, y0, w, h).astype(bool)
    if not bc.any():
        return None
    n = int(bc.sum())

    fao = read_window(FAO, x0, y0, w, h)[bc]
    tre = read_window(TREED, x0, y0, w, h)[bc]
    lc = read_window(LC, x0, y0, w, h)[bc]

    out = {"bc_cells": n}
    for name, values, codes in (("fao_forest_2022", fao, range(3)),
                                ("treed_area_1984_2022", tre, range(4))):
        counts = {str(k): int((values == k).sum()) for k in codes}
        counts["other"] = n - sum(counts.values())
        out[name] = counts

    cross = {}
    for code in VLCE2_CODES:
        m = lc == code
        cells = int(m.sum())
        if cells == 0:
            continue
        cross[str(code)] = {
            "cells": cells,
            "fao": [int((fao[m] == k).sum()) for k in range(3)],
            "treed": [int((tre[m] == k).sum()) for k in range(4)],
        }
    out["cross_vlce2"] = cross
    return out


def merge(dst, src):
    for k, v in src.items():
        if isinstance(v, int):
            dst[k] = dst.get(k, 0) + v
        elif isinstance(v, list):
            cur = dst.setdefault(k, [0] * len(v))
            for i, x in enumerate(v):
                cur[i] += x
        else:
            merge(dst.setdefault(k, {}), v)


def main():
    for path in (MASK, LC, FAO, TREED):
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
                merge(total, res)
            if done % 40 == 0:
                elapsed = time.time() - started
                print(f"  {done}/{len(work)}  {elapsed:.1f}s  eta {elapsed / done * (len(work) - done):.0f}s", flush=True)
    total["elapsedSeconds"] = round(time.time() - started, 1)
    total["haPerCell"] = HA_PER_CELL
    out = f"{WORKSPACE}/bc-ntems-definitional-2022.json"
    with open(out, "w") as handle:
        json.dump(total, handle, indent=2)
    print(f"wrote {out} in {total['elapsedSeconds']}s")


if __name__ == "__main__":
    main()
