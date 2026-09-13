#!/usr/bin/env python3
"""British Columbia treed extent from VLCE2 classes, 1984 and 2022.

This is a treed-extent baseline derived from VLCE2's own land-cover classes.
It is deliberately not a forest denominator and asserts no Canada National
Forest Inventory claim: VLCE2 publishes 13 class codes and no crown-closure,
area, height or width threshold, so no NFI condition can be read out of a class
value. What this job measures is the extent of the classes VLCE2 calls treed,
plus how much that extent moves under the two conditions we can apply to a
categorical raster on our own: a minimum mapped area and a connectivity rule.

Two class sets are reported rather than one. `upland` is 210/220/230. Wetland,
treed (81) is reported separately because whether a treed wetland belongs in a
forest denominator is a land-use decision this job has no standing to make.

Reported quantities are endpoint extents and the transition between them. The
loss figure here is not the repository's cumulative disturbance headline and
must never be presented as it: a stand cut in 1998 and regrown by 2022 nets to
zero in an endpoint difference and counts in a union of annual disturbance.
"""
import json
import multiprocessing as mp
import os
import time

from bc_forest_window import (
    DATA_ROOT, HA_PER_CELL, HALO, MIN_CELLS_1_HA, TILE, VLCE2_TREED_ALL,
    VLCE2_TREED_UPLAND, WORKERS, XSIZE, YSIZE, assert_aligned, read_window, sieve,
)
from osgeo import gdal

WORKSPACE = os.environ.get(
    "WITNESS_TREE_BC_TREED_WORKSPACE",
    f"{DATA_ROOT}/derived/bc-treed-extent-20260909",
)
MASK = f"{WORKSPACE}/bc_mask.tif"
YEARS = (1984, 2022)
CLASS_SETS = {"upland": VLCE2_TREED_UPLAND, "upland_plus_wetland_treed": VLCE2_TREED_ALL}
CONNS = {"conn4": 4, "conn8": 8}


def raster(year):
    return f"{WORKSPACE}/rasters/CA_forest_VLCE2_{year}.tif"


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

    lc = {year: read_window(raster(year), rx0, ry0, rw, rh) for year in YEARS}
    out = {"bc_cells": int(inner.sum())}

    for set_name, codes in CLASS_SETS.items():
        binaries = {}
        for year in YEARS:
            a = lc[year]
            b = a == codes[0]
            for code in codes[1:]:
                b |= a == code
            binaries[year] = b.astype("uint8")

        variants = {"raw": binaries}
        for conn_name, conn in CONNS.items():
            variants[f"min1ha_{conn_name}"] = {
                year: sieve(binaries[year], MIN_CELLS_1_HA, conn) for year in YEARS
            }

        for variant, byyear in variants.items():
            a = byyear[YEARS[0]][iy:iy + h, ix:ix + w].astype(bool) & inner
            b = byyear[YEARS[1]][iy:iy + h, ix:ix + w].astype(bool) & inner
            key = f"{set_name}|{variant}"
            out[f"{key}|treed_{YEARS[0]}"] = int(a.sum())
            out[f"{key}|treed_{YEARS[1]}"] = int(b.sum())
            out[f"{key}|lost"] = int((a & ~b).sum())
            out[f"{key}|gained"] = int((b & ~a).sum())
    return out


def main():
    assert_aligned(MASK)
    for year in YEARS:
        assert_aligned(raster(year))
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
            if done % 40 == 0:
                elapsed = time.time() - started
                print(f"  {done}/{len(work)}  {elapsed:.1f}s  eta {elapsed / done * (len(work) - done):.0f}s", flush=True)
    total["elapsedSeconds"] = round(time.time() - started, 1)
    total["haPerCell"] = HA_PER_CELL
    out = f"{WORKSPACE}/bc-treed-extent-result.json"
    with open(out, "w") as handle:
        json.dump(total, handle, indent=2)
    print(f"wrote {out} in {total['elapsedSeconds']}s")


if __name__ == "__main__":
    main()
