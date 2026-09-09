#!/usr/bin/env python3
"""Apply the minimum-mappable-unit filtering NRCan did not apply.

The FAO forest README states plainly that no MMU filtering has been applied, so
the published layer implements the land-use half of the FAO definition and not
its area threshold. This job applies both the FAO 0.5 ha minimum and the Canada
NFI 1 ha minimum, under 4- and 8-connectivity, to the British Columbia window,
for the FAO layer and for NRCan's treed-area endpoints.

The result is a sensitivity, not an approval. It says how much the area and
connectivity conditions move a published extent. It does not decide which
classes belong in a forest denominator and it does not implement the NFI's
20 metre minimum width, which a small-area sieve cannot express: a one-cell-wide
ribbon twenty cells long passes a twelve-cell area test and fails a width test.
"""
import json
import multiprocessing as mp
import os
import time

import numpy as np
from bc_forest_window import (
    DATA_ROOT, HA_PER_CELL, HALO, MIN_CELLS_0P5_HA, MIN_CELLS_1_HA, TILE,
    WORKERS, XOFF, XSIZE, YOFF, YSIZE, assert_aligned, sieve,
)
from osgeo import gdal

TREED_WORKSPACE = os.environ.get(
    "WITNESS_TREE_BC_TREED_WORKSPACE", f"{DATA_ROOT}/derived/bc-treed-extent-20260909")
WORKSPACE = os.environ.get(
    "WITNESS_TREE_NTEMS_WORKSPACE",
    f"{DATA_ROOT}/derived/ntems-definitional-products-20260909")

MASK = f"{TREED_WORKSPACE}/bc_mask.tif"
FAO = f"{WORKSPACE}/rasters/nrcan-fao-forest-2022/CA_FAO_forest_2022.tif"
TREED = f"{WORKSPACE}/rasters/nrcan-treed-area-1984-2022/CA_treed_area_1984-2022.tif"

THRESHOLDS = {"min0p5ha": MIN_CELLS_0P5_HA, "min1ha": MIN_CELLS_1_HA}
CONNS = {"conn4": 4, "conn8": 8}


def run_tile(args):
    x0, y0, w, h = args
    rx0, ry0 = max(0, x0 - HALO), max(0, y0 - HALO)
    rx1, ry1 = min(XSIZE, x0 + w + HALO), min(YSIZE, y0 + h + HALO)
    rw, rh = rx1 - rx0, ry1 - ry0
    ix, iy = x0 - rx0, y0 - ry0

    mask_ds = gdal.Open(MASK)
    bc = mask_ds.GetRasterBand(1).ReadAsArray(rx0, ry0, rw, rh).astype(bool)
    inner = bc[iy:iy + h, ix:ix + w]
    if not inner.any():
        return None

    fao_ds = gdal.Open(FAO)
    fao = fao_ds.GetRasterBand(1).ReadAsArray(XOFF + rx0, YOFF + ry0, rw, rh)
    tre_ds = gdal.Open(TREED)
    tre = tre_ds.GetRasterBand(1).ReadAsArray(XOFF + rx0, YOFF + ry0, rw, rh)

    layers = {
        "fao_forest_all": ((fao == 1) | (fao == 2)).astype(np.uint8),
        "fao_forest_current": (fao == 1).astype(np.uint8),
        "treed_2022": ((tre == 1) | (tre == 2)).astype(np.uint8),
        "treed_1984": ((tre == 1) | (tre == 3)).astype(np.uint8),
    }
    out = {"bc_cells": int(inner.sum())}
    for name, binary in layers.items():
        out[f"{name}|raw"] = int((binary[iy:iy + h, ix:ix + w] & inner).sum())
        for tname, threshold in THRESHOLDS.items():
            for cname, conn in CONNS.items():
                filtered = sieve(binary, threshold, conn)
                out[f"{name}|{tname}_{cname}"] = int((filtered[iy:iy + h, ix:ix + w] & inner).sum())
    return out


def main():
    for path in (MASK, FAO, TREED):
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
                    total[k] = total.get(k, 0) + v
            if done % 20 == 0:
                elapsed = time.time() - started
                print(f"  {done}/{len(work)}  {elapsed:.1f}s  eta {elapsed / done * (len(work) - done):.0f}s", flush=True)
    total["elapsedSeconds"] = round(time.time() - started, 1)
    total["haPerCell"] = HA_PER_CELL
    out = f"{WORKSPACE}/bc-fao-mmu-2022.json"
    with open(out, "w") as handle:
        json.dump(total, handle, indent=2)
    print(f"wrote {out} in {total['elapsedSeconds']}s")


if __name__ == "__main__":
    main()
