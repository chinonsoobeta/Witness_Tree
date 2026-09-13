#!/usr/bin/env python3
"""The minimum-width condition, and why a 30 m grid cannot decide it.

The FAO and Canada National Forest Inventory forest definitions carry a minimum
width alongside the minimum area: a qualifying patch must be at least 20 metres
across. A small-area sieve cannot express that condition, because area and width
are independent. A one-cell ribbon twenty cells long covers 1.8 ha and passes a
1 ha area test while being as narrow as the grid can represent.

The first result of this job is negative and it is the important one. At 30 m
resolution the 20 metre rule is not expressible at all. The narrowest feature a
30 m raster can represent is one cell, which is 30 m across, already wider than
the threshold. A morphological opening sized to 20 m therefore has a structuring
element smaller than a single cell and is the identity: it removes nothing, and
a zero it reported would be an artefact of the grid rather than a finding about
British Columbia. Recording that zero as evidence of compliance would be exactly
the move the decision record forbids, turning an unmeasurable condition into a
passing one.

What the grid can measure is the neighbouring question: how much of the mapped
extent sits in features narrow enough that a width rule of any size would bite.
This job opens the extent with square structuring elements of 2 and 3 cells,
which is 60 m and 90 m, the two smallest widths the grid can actually resolve.
The removed areas bracket the answer from above. If opening at 60 m removes a
negligible share, then no width rule at or below 60 m can matter much either,
and the 20 metre condition is bounded even though it cannot be evaluated. If it
removes a large share, the condition is unresolved and consequential, and the
decision record has to say so.

Opening is erosion followed by dilation by the same element. A pixel survives
opening with a k by k square exactly when some k by k block of set pixels
contains it, so the result keeps every part of the extent that is at least k
cells wide in both directions and discards narrower ribbons and spurs. The
square element is separable and small, so the implementation is a handful of
shifted array intersections rather than a convolution.

Tiling is exact. Opening with a k by k element propagates information at most
k - 1 cells, so a halo of at least k - 1 makes every interior cell of a tile
identical to what a whole-province computation would produce. HALO is 16 and k
is at most 3, so the margin is large.

This job asserts nothing about which classes belong in a forest denominator and
does not implement a forest mask. It measures one condition's sensitivity on
inputs that are not independent truth.
"""
import json
import multiprocessing as mp
import os
import time

import numpy as np
from bc_forest_window import (
    DATA_ROOT, HALO, HA_PER_CELL, TILE, VLCE2_TREED_ALL, WORKERS, XOFF, XSIZE,
    YOFF, YSIZE, assert_aligned, tiles,
)
from osgeo import gdal

TREED_WORKSPACE = os.environ.get(
    "WITNESS_TREE_BC_TREED_WORKSPACE", f"{DATA_ROOT}/derived/bc-treed-extent-20260909")
WORKSPACE = os.environ.get(
    "WITNESS_TREE_NTEMS_WORKSPACE",
    f"{DATA_ROOT}/derived/ntems-definitional-products-20260909")

MASK = f"{TREED_WORKSPACE}/bc_mask.tif"
FAO = f"{WORKSPACE}/rasters/nrcan-fao-forest-2022/CA_FAO_forest_2022.tif"
LC2022 = f"{TREED_WORKSPACE}/rasters/CA_forest_VLCE2_2022.tif"

CELL_METRES = 30
# The condition the definitions state, and the widths the grid can resolve.
NFI_MINIMUM_WIDTH_METRES = 20
KERNELS = (2, 3)


def opening(binary, k):
    """Binary opening by a k by k square, exact away from the array border.

    Erosion is the intersection of the k by k shifted copies, evaluated on the
    valid region so nothing wraps. Dilation puts each surviving block back.
    """
    height, width = binary.shape
    if height < k or width < k:
        return np.zeros_like(binary)
    eroded = binary[: height - k + 1, : width - k + 1].copy()
    for dy in range(k):
        for dx in range(k):
            if dy == 0 and dx == 0:
                continue
            eroded &= binary[dy : dy + height - k + 1, dx : dx + width - k + 1]
    out = np.zeros_like(binary)
    for dy in range(k):
        for dx in range(k):
            out[dy : dy + height - k + 1, dx : dx + width - k + 1] |= eroded
    return out


def run_tile(args):
    x0, y0, w, h = args
    rx0, ry0 = max(0, x0 - HALO), max(0, y0 - HALO)
    rx1, ry1 = min(XSIZE, x0 + w + HALO), min(YSIZE, y0 + h + HALO)
    rw, rh = rx1 - rx0, ry1 - ry0
    ix, iy = x0 - rx0, y0 - ry0

    mask_ds = gdal.Open(MASK)
    bc = mask_ds.GetRasterBand(1).ReadAsArray(rx0, ry0, rw, rh).astype(bool)
    if not bc[iy : iy + h, ix : ix + w].any():
        return None

    fao_ds = gdal.Open(FAO)
    fao = fao_ds.GetRasterBand(1).ReadAsArray(XOFF + rx0, YOFF + ry0, rw, rh)
    lc_ds = gdal.Open(LC2022)
    lc = lc_ds.GetRasterBand(1).ReadAsArray(XOFF + rx0, YOFF + ry0, rw, rh)

    layers = {
        "fao_forest_all": bc & (fao > 0),
        "fao_forest_current": bc & (fao == 1),
        "vlce2_treed_2022": bc & np.isin(lc, VLCE2_TREED_ALL),
    }

    out = {}
    for name, layer in layers.items():
        core = layer[iy : iy + h, ix : ix + w]
        out[f"{name}|raw"] = int(core.sum())
        for k in KERNELS:
            opened = opening(layer, k)[iy : iy + h, ix : ix + w]
            out[f"{name}|open{k * CELL_METRES}m"] = int(opened.sum())
    return out


def main():
    for path in (MASK, FAO, LC2022):
        assert_aligned(path)

    if NFI_MINIMUM_WIDTH_METRES < CELL_METRES:
        expressible = False
        note = (
            f"A {NFI_MINIMUM_WIDTH_METRES} m width rule is not expressible on a "
            f"{CELL_METRES} m grid: the narrowest representable feature is one "
            f"cell, {CELL_METRES} m across, which already exceeds the threshold. "
            "Opening at that width is the identity and would report a removal of "
            "zero as a property of the grid, not of British Columbia. The kernels "
            "below bracket the condition from above instead."
        )
    else:
        expressible = True
        note = "The width rule is at least one cell wide and is evaluated directly."

    work = tiles()
    started = time.time()
    totals, done = {}, 0
    with mp.Pool(WORKERS) as pool:
        for res in pool.imap_unordered(run_tile, work, chunksize=1):
            done += 1
            if res:
                for key, value in res.items():
                    totals[key] = totals.get(key, 0) + value
            if done % 40 == 0:
                elapsed = time.time() - started
                print(f"  {done}/{len(work)}  {elapsed:.1f}s  eta {elapsed / done * (len(work) - done):.0f}s", flush=True)

    removals = {}
    for name in ("fao_forest_all", "fao_forest_current", "vlce2_treed_2022"):
        raw = totals.get(f"{name}|raw", 0)
        for k in KERNELS:
            opened = totals.get(f"{name}|open{k * CELL_METRES}m", 0)
            removals[f"{name}|open{k * CELL_METRES}m"] = {
                "removedCells": raw - opened,
                "removedHectares": round((raw - opened) * HA_PER_CELL, 2),
                "removedPercent": round((raw - opened) / raw * 100, 4) if raw else None,
            }

    result = {
        "nfiMinimumWidthMetres": NFI_MINIMUM_WIDTH_METRES,
        "cellMetres": CELL_METRES,
        "widthRuleExpressibleAtThisResolution": expressible,
        "note": note,
        "kernelWidthsMetres": [k * CELL_METRES for k in KERNELS],
        "cells": totals,
        "hectares": {key: round(value * HA_PER_CELL, 2) for key, value in totals.items()},
        "removals": removals,
        "elapsedSeconds": round(time.time() - started, 1),
        "haPerCell": HA_PER_CELL,
    }
    out = f"{WORKSPACE}/bc-forest-width-opening-2022.json"
    with open(out, "w") as handle:
        json.dump(result, handle, indent=2)
    print(f"wrote {out} in {result['elapsedSeconds']}s")


if __name__ == "__main__":
    main()
