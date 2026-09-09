#!/usr/bin/env python3
"""NFI area and crown-closure conditions applied at stand level, British Columbia.

The Satellite-Based Forest Inventory is the only NTEMS product in this set that
is stand-based rather than pixel-based, and that is what makes it worth reading.
The NFI conditions are written about stands. Every pixel derivation applies a
stand-level definition to a raster grid and hopes the aggregation is faithful.
This job does not have to: SBFI supplies polygon area, FAO-forest fraction,
canopy cover and canopy height per stand, so the at-least-1-hectare and
at-least-10-percent conditions are applied to the unit they were written for.

Geometry is ignored. JURISDICTION already selects British Columbia, so no
spatial clip is needed and the attribute read is far cheaper.

Three limits belong with any number this job produces. SBFI is a 2020 snapshot,
so it cannot be differenced against 1984 and is not the same year as the other
products here. Its segmentation used a 0.45 ha minimum map unit, so stands below
that size do not exist to be tested. And it descends from the same Landsat
composites as VLCE2, so it is not independent truth.
"""
import json
import multiprocessing as mp
import os
import time

from bc_forest_window import DATA_ROOT, WORKERS
from osgeo import ogr

ogr.UseExceptions()

WORKSPACE = os.environ.get(
    "WITNESS_TREE_NTEMS_WORKSPACE",
    f"{DATA_ROOT}/derived/ntems-definitional-products-20260909")
GDB = f"{WORKSPACE}/rasters/nrcan-satellite-forest-inventory-2020/SBFI_2020/SBFI_2020.gdb"
OUT = f"{WORKSPACE}/bc-sbfi-2020.json"

JURISDICTION = "British Columbia"
FIELDS = [
    "AREA_HA", "JURISDICTION", "LC_TREED", "LC_FAO_FOREST",
    "STRUCTURE_CANOPY_COVER_AVG", "STRUCTURE_CANOPY_HEIGHT_AVG",
    "STRUCTURE_LOREYS_HEIGHT_AVG", "AGE_AVG", "MANAGEMENT",
]

NFI_MIN_AREA_HA = 1.0
NFI_MIN_CROWN_CLOSURE_PERCENT = 10.0

AREA_BINS = [0, 0.5, 1, 2, 5, 10, 50, 100, 1e12]
COVER_BINS = [0, 5, 10, 25, 50, 75, 100.01]
HEIGHT_BINS = [0, 2, 5, 10, 15, 20, 30, 1e6]


def bin_of(value, edges):
    for i in range(len(edges) - 1):
        if edges[i] <= value < edges[i + 1]:
            return i
    return len(edges) - 2


def run_layer(name):
    ds = ogr.Open(GDB)
    lyr = ds.GetLayerByName(name)
    defn = lyr.GetLayerDefn()
    have = {defn.GetFieldDefn(i).GetName() for i in range(defn.GetFieldCount())}
    # The geodatabase carries a tile-grid reference layer alongside the 388 tile
    # layers. It has no JURISDICTION field, so it is skipped rather than filtered.
    if "JURISDICTION" not in have:
        return None
    keep = set(FIELDS)
    lyr.SetIgnoredFields([n for n in have if n not in keep] + ["Shape"])
    lyr.SetAttributeFilter(f"JURISDICTION = '{JURISDICTION}'")

    acc = {
        "polygons": 0, "area_ha": 0.0, "fao_forest_ha": 0.0, "treed_ha": 0.0,
        "area_hist": [0] * (len(AREA_BINS) - 1),
        "area_hist_ha": [0.0] * (len(AREA_BINS) - 1),
        "cover_hist_ha": [0.0] * (len(COVER_BINS) - 1),
        "height_hist_ha": [0.0] * (len(HEIGHT_BINS) - 1),
        "nfi_pass_ha": 0.0, "nfi_pass_polygons": 0,
        "fail_area_ha": 0.0, "fail_cover_ha": 0.0, "fail_both_ha": 0.0,
        "cover_missing_ha": 0.0, "height_missing_ha": 0.0,
    }
    for feat in lyr:
        area = feat.GetField("AREA_HA") or 0.0
        if area <= 0:
            continue
        fao = feat.GetField("LC_FAO_FOREST") or 0.0
        treed = feat.GetField("LC_TREED") or 0.0
        cover = feat.GetField("STRUCTURE_CANOPY_COVER_AVG")
        height = feat.GetField("STRUCTURE_CANOPY_HEIGHT_AVG")

        acc["polygons"] += 1
        acc["area_ha"] += area
        acc["fao_forest_ha"] += area * fao / 100.0
        acc["treed_ha"] += area * treed / 100.0
        index = bin_of(area, AREA_BINS)
        acc["area_hist"][index] += 1
        acc["area_hist_ha"][index] += area

        # Everything below is scoped to the stand's FAO-forest portion, so a
        # mostly-water polygon does not contribute its whole area to a forest test.
        forest_ha = area * fao / 100.0
        if forest_ha <= 0:
            continue
        if cover is None:
            acc["cover_missing_ha"] += forest_ha
        else:
            acc["cover_hist_ha"][bin_of(cover, COVER_BINS)] += forest_ha
        if height is None:
            acc["height_missing_ha"] += forest_ha
        else:
            acc["height_hist_ha"][bin_of(height, HEIGHT_BINS)] += forest_ha
        if cover is None:
            continue

        ok_area = area >= NFI_MIN_AREA_HA
        ok_cover = cover >= NFI_MIN_CROWN_CLOSURE_PERCENT
        if ok_area and ok_cover:
            acc["nfi_pass_ha"] += forest_ha
            acc["nfi_pass_polygons"] += 1
        elif ok_area:
            acc["fail_cover_ha"] += forest_ha
        elif ok_cover:
            acc["fail_area_ha"] += forest_ha
        else:
            acc["fail_both_ha"] += forest_ha
    return acc


def main():
    ds = ogr.Open(GDB)
    names = [ds.GetLayer(i).GetName() for i in range(ds.GetLayerCount())]
    ds = None
    started = time.time()
    total, done = {}, 0
    with mp.Pool(WORKERS) as pool:
        for acc in pool.imap_unordered(run_layer, names, chunksize=1):
            done += 1
            for k, v in (acc or {}).items():
                if isinstance(v, list):
                    cur = total.setdefault(k, [0] * len(v))
                    for i, x in enumerate(v):
                        cur[i] += x
                else:
                    total[k] = total.get(k, 0) + v
            if done % 40 == 0:
                elapsed = time.time() - started
                print(f"  {done}/{len(names)}  {elapsed:.1f}s  eta {elapsed / done * (len(names) - done):.0f}s", flush=True)
    total["elapsedSeconds"] = round(time.time() - started, 1)
    total["areaBins"] = AREA_BINS
    total["coverBins"] = COVER_BINS
    total["heightBins"] = HEIGHT_BINS
    with open(OUT, "w") as handle:
        json.dump(total, handle, indent=2)
    print(f"wrote {OUT} in {total['elapsedSeconds']}s")


if __name__ == "__main__":
    main()
