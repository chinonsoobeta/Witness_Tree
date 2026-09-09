#!/usr/bin/env python3
"""The 1984 to 2022 annual land-cover and disturbance series for one province.

This is the multi-province form of scripts/bc_annual_series.py. The compute is
identical; what changes is that the province window and mask come from
province-windows.json rather than being pinned to British Columbia, and that
every province is cut from one boundary edition so the four are mutually
comparable.

Boundary edition matters and is not a formality. The earlier British Columbia
jobs used British Columbia's own terrestrial boundary. These use the Statistics
Canada 2021 provincial file. Running British Columbia both ways measures what
the choice is worth, which is the boundary-intersection condition that
docs/VLCE2_FOREST_MASK_DECISION.md still records as Unresolved. The two British
Columbia totals are not interchangeable and neither is a correction of the
other.

Usage: province_annual_series.py <slug> [<slug> ...]
       province_annual_series.py all
"""
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np

import bc_forest_window as window
from bc_forest_window import DATA_ROOT, HA_PER_CELL, VLCE2_CLASS_NAMES, VLCE2_CODES, WORKERS

WORKSPACE = os.environ.get(
    "WITNESS_TREE_PROVINCIAL_WORKSPACE", f"{DATA_ROOT}/derived/provincial-annual-series-20260909"
)
LC_DIR = os.environ.get(
    "WITNESS_TREE_LC_DIR", f"{DATA_ROOT}/derived/bc-annual-series-20260909/lc"
)
RASTERS = f"{DATA_ROOT}/derived/bc-annual-series-20260909/rasters"
HARVEST = f"{RASTERS}/CA_Forest_Harvest_1985-2022.tif"
FIRE = f"{RASTERS}/CA_Forest_Fire_1985-2022.tif"

LC_YEARS = list(range(1984, 2023))
DIST_YEARS = list(range(1985, 2023))
DIST_BINS = [0] + DIST_YEARS

CODE_INDEX = {code: i for i, code in enumerate(VLCE2_CODES)}
N_CLASS = len(VLCE2_CODES)
N_DIST = len(DIST_BINS)

_MASK = None


def _init(win, mask):
    """Rebind the window inside each worker; module state does not cross a fork boundary
    on every platform, so it is set explicitly rather than assumed inherited."""
    global _MASK
    window.use_window(*win)
    _MASK = mask


def _class_index(lc):
    out = np.full(lc.shape, N_CLASS, dtype=np.uint8)
    for code, i in CODE_INDEX.items():
        out[lc == code] = i
    return out


def _dist_index(raster):
    out = np.zeros(raster.shape, dtype=np.uint8)
    for i, year in enumerate(DIST_YEARS, start=1):
        out[raster == year] = i
    return out


def process_tile(args):
    x0, y0, w, h = args
    land = window.read_window(_MASK, x0, y0, w, h).astype(bool)
    n = int(land.sum())
    if n == 0:
        return None

    harvest = _dist_index(window.read_window(HARVEST, x0, y0, w, h))[land]
    fire = _dist_index(window.read_window(FIRE, x0, y0, w, h))[land]

    ny = len(LC_YEARS)
    classes = np.zeros((ny, N_CLASS + 1), dtype=np.int64)
    joint_h = np.zeros((ny, N_CLASS + 1, N_DIST), dtype=np.int64)
    joint_f = np.zeros((ny, N_CLASS + 1, N_DIST), dtype=np.int64)

    for yi, year in enumerate(LC_YEARS):
        lc = _class_index(window.read_window(f"{LC_DIR}/CA_forest_VLCE2_{year}.tif", x0, y0, w, h))[land]
        classes[yi] = np.bincount(lc, minlength=N_CLASS + 1)
        joint_h[yi] = np.bincount(lc.astype(np.int64) * N_DIST + harvest,
                                  minlength=(N_CLASS + 1) * N_DIST).reshape(N_CLASS + 1, N_DIST)
        joint_f[yi] = np.bincount(lc.astype(np.int64) * N_DIST + fire,
                                  minlength=(N_CLASS + 1) * N_DIST).reshape(N_CLASS + 1, N_DIST)
    return n, classes, joint_h, joint_f


def run(slug, entry):
    win = (entry["window"]["xoff"], entry["window"]["yoff"],
           entry["window"]["xsize"], entry["window"]["ysize"])
    mask = entry["mask"]
    window.use_window(*win)
    for path in (mask, HARVEST, FIRE):
        window.assert_aligned(path)

    work = window.tiles()
    started = time.time()
    print(f"[{time.strftime('%H:%M:%S')}] {entry['name']}: {len(work)} tiles, "
          f"{len(LC_YEARS)} years, {WORKERS} workers", flush=True)

    ny = len(LC_YEARS)
    total = 0
    classes = np.zeros((ny, N_CLASS + 1), dtype=np.int64)
    joint_h = np.zeros((ny, N_CLASS + 1, N_DIST), dtype=np.int64)
    joint_f = np.zeros((ny, N_CLASS + 1, N_DIST), dtype=np.int64)

    done = 0
    with ProcessPoolExecutor(max_workers=WORKERS, initializer=_init, initargs=(win, mask)) as pool:
        for result in pool.map(process_tile, work, chunksize=1):
            done += 1
            if result is not None:
                n, c, jh, jf = result
                total += n
                classes += c
                joint_h += jh
                joint_f += jf
            if done % 40 == 0 or done == len(work):
                elapsed = time.time() - started
                print(f"[{time.strftime('%H:%M:%S')}] {entry['name']}: {done}/{len(work)}, "
                      f"{elapsed / 60:.1f} min elapsed, "
                      f"{(len(work) - done) / (done / elapsed) / 60:.1f} min remaining", flush=True)

    if total != entry["landCells"]:
        raise SystemExit(
            f"{entry['name']}: counted {total} land cells but the mask manifest records "
            f"{entry['landCells']}. The window and the mask disagree; refusing to write."
        )
    unmapped = int(classes[:, N_CLASS].sum())

    treed_upland = [int(sum(classes[yi][CODE_INDEX[c]] for c in (210, 220, 230))) for yi in range(ny)]
    treed_all = [int(sum(classes[yi][CODE_INDEX[c]] for c in (81, 210, 220, 230))) for yi in range(ny)]
    ha = lambda v: round(float(v) * HA_PER_CELL, 1)

    result = {
        "province": entry["name"],
        "pruid": entry["pruid"],
        "boundaryEdition": "Statistics Canada 2021 provincial boundary file",
        "window": entry["window"],
        "landCells": total,
        "landHectares": ha(total),
        "years": LC_YEARS,
        "disturbanceBins": ["none"] + [str(y) for y in DIST_YEARS],
        "classCodes": list(VLCE2_CODES),
        "classNames": {str(k): v for k, v in VLCE2_CLASS_NAMES.items()},
        "unmappedCellYears": unmapped,
        "annual": {
            str(year): {
                "classHectares": {VLCE2_CLASS_NAMES[c]: ha(classes[yi][CODE_INDEX[c]]) for c in VLCE2_CODES},
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
    out = f"{WORKSPACE}/{slug}-annual-series-1984-2022.json"
    with open(out, "w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2)
    print(f"[{time.strftime('%H:%M:%S')}] wrote {out} in {result['elapsedSeconds']} s", flush=True)


def main():
    manifest = json.load(open(f"{WORKSPACE}/province-windows.json", encoding="utf-8"))
    wanted = sys.argv[1:] or ["all"]
    slugs = list(manifest["provinces"]) if wanted == ["all"] else wanted
    for slug in slugs:
        if slug not in manifest["provinces"]:
            raise SystemExit(f"unknown province slug {slug}; have {list(manifest['provinces'])}")
    for slug in slugs:
        run(slug, manifest["provinces"][slug])


if __name__ == "__main__":
    sys.exit(main())
