#!/usr/bin/env python3
"""Drive the v2 condition-and-recovery worker over hand-built trajectories.

Each cell below exercises one rule, and every expected value was worked out by
hand from the rules, not taken from a previous run, so the test can fail the
implementation. The grid is in longitude and latitude and the regions are a
plain GeoJSON, so a swapped axis order rasterizes nothing and fails loudly.
"""
import json, os, shutil, subprocess, sys, tempfile
import numpy as np
from osgeo import gdal, osr

gdal.UseExceptions()
HERE = os.path.dirname(os.path.abspath(__file__))
WORKER = os.path.join(HERE, "phase4_condition_recovery_v2.py")
YEARS = list(range(1984, 2023))
W, H = 12, 4
GT = (-120.0, 0.001, 0.0, 50.0, 0.0, -0.001)


def traj(base=210, gaps=(), fill=50, until=None):
    """base every year, fill in the gap years; until=(year, cls) switches class after year."""
    out = []
    for y in YEARS:
        v = base
        if until is not None and y > until[0]:
            v = until[1]
        if y in gaps:
            v = fill
        out.append(v)
    return out


def cells():
    """(row, col) -> 39 classes, plus the fire and harvest years."""
    t = {(r, c): [50] * 39 for r in range(H) for c in range(W)}
    t[0, 0] = [210] * 39
    t[0, 1] = traj(until=(1990, 50))
    t[0, 2] = [81] * 39
    t[0, 3] = traj(until=(1990, 81))
    t[0, 4] = traj(gaps=(1991, 1992, 1993))
    t[0, 5] = traj(gaps=(2020,))
    t[0, 6] = traj(gaps=(1991, 2018))
    t[0, 7] = traj(gaps=(1991, 2020, 2021, 2022))
    t[0, 8] = [0] * 39
    t[0, 9] = [255 if y == 2000 else 210 for y in YEARS]
    t[0, 11] = [210] * 39                    # outside the province mask
    for c in (0, 1, 2):
        t[1, c] = traj(until=(2004, 50))
    t[1, 3] = traj(until=(2005, 81))
    t[1, 4] = [210 if y < 2000 else 50 if y < 2002 else 81 for y in YEARS]
    # Returns for two years, is lost again, returns for one final year. Only a
    # counter that restarts at the second loss leaves this unconfirmed.
    t[2, 0] = traj(gaps=(2018, 2021))
    fire = np.zeros((H, W), np.uint16); harvest = np.zeros((H, W), np.uint16)
    fire[1, 0] = 2004                          # one year before the loss: fire
    harvest[1, 1] = 2007                       # two years after: not recorded
    fire[1, 2] = 2005; harvest[1, 2] = 2006    # both inside the window
    return t, fire, harvest


# Expected per-cell layers: (state, latest, recovery start, first loss, cause+1)
# for set A then set B. Years are written in full here and compared minus 1900.
EXPECT = {
    (0, 0): ((3, 0, 0, 0, 0), (3, 0, 0, 0, 0)),
    (0, 1): ((5, 1991, 0, 1991, 1), (5, 1991, 0, 1991, 1)),
    (0, 2): ((2, 0, 0, 0, 0), (3, 0, 0, 0, 0)),
    (0, 3): ((5, 1991, 0, 1991, 1), (3, 0, 0, 0, 0)),
    (0, 4): ((4, 1991, 1994, 1991, 1), (4, 1991, 1994, 1991, 1)),
    (0, 5): ((6, 2020, 0, 2020, 1), (6, 2020, 0, 2020, 1)),
    (0, 6): ((4, 2018, 2019, 1991, 1), (4, 2018, 2019, 1991, 1)),
    (0, 7): ((5, 2020, 0, 1991, 1), (5, 2020, 0, 1991, 1)),
    (0, 8): ((1, 0, 0, 0, 0), (1, 0, 0, 0, 0)),
    (0, 9): ((1, 0, 0, 0, 0), (1, 0, 0, 0, 0)),
    (0, 10): ((2, 0, 0, 0, 0), (2, 0, 0, 0, 0)),
    (0, 11): ((0, 0, 0, 0, 0), (0, 0, 0, 0, 0)),
    (1, 0): ((5, 2005, 0, 2005, 2), (5, 2005, 0, 2005, 2)),
    (1, 1): ((5, 2005, 0, 2005, 1), (5, 2005, 0, 2005, 1)),
    (1, 2): ((5, 2005, 0, 2005, 4), (5, 2005, 0, 2005, 4)),
    (1, 3): ((5, 2006, 0, 2006, 1), (3, 0, 0, 0, 0)),
    (1, 4): ((5, 2000, 0, 2000, 1), (4, 2000, 2002, 2000, 1)),
    (2, 0): ((6, 2021, 0, 2018, 1), (6, 2021, 0, 2018, 1)),
}


def write(path, arr, dtype):
    ds = gdal.GetDriverByName("GTiff").Create(path, W, H, 1, dtype, ["TILED=YES", "BLOCKXSIZE=16", "BLOCKYSIZE=16"])
    ds.SetGeoTransform(GT)
    srs = osr.SpatialReference(); srs.ImportFromEPSG(4326)
    ds.SetProjection(srs.ExportToWkt())
    ds.GetRasterBand(1).WriteArray(arr)
    ds = None


def box(c0, c1):
    x0, x1 = GT[0] + c0 * GT[1], GT[0] + c1 * GT[1]
    y1, y0 = GT[3], GT[3] + H * GT[5]
    return [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]


def build(tmp):
    t, fire, harvest = cells()
    lc = os.path.join(tmp, "lc"); os.makedirs(lc)
    for i, y in enumerate(YEARS):
        a = np.zeros((H, W), np.uint8)
        for (r, c), v in t.items():
            a[r, c] = v[i]
        write(os.path.join(lc, f"CA_forest_VLCE2_{y}.tif"), a, gdal.GDT_Byte)
    mask = np.ones((H, W), np.uint8); mask[:, 11] = 0
    write(os.path.join(tmp, "mask.tif"), mask, gdal.GDT_Byte)
    write(os.path.join(tmp, "fire.tif"), fire, gdal.GDT_UInt16)
    write(os.path.join(tmp, "harvest.tif"), harvest, gdal.GDT_UInt16)
    json.dump({"provinces": {"british-columbia": {
        "window": {"xoff": 0, "yoff": 0, "xsize": W, "ysize": H},
        "landCells": int(mask.sum()), "mask": os.path.join(tmp, "mask.tif")}}},
        open(os.path.join(tmp, "windows.json"), "w"))
    feats = [("5910", "West", "59", box(0, 6)), ("5920", "East", "59", box(6, 10)),
             ("4810", "Elsewhere", "48", box(0, 12))]   # another province: ignored
    json.dump({"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"ERUID": e, "ERNAME": n, "PRUID": p},
         "geometry": {"type": "Polygon", "coordinates": g}} for e, n, p, g in feats]},
        open(os.path.join(tmp, "regions.geojson"), "w"))
    return lc


def run(tmp, lc, strip):
    out = os.path.join(tmp, f"out-{strip}.json")
    cd = os.path.join(tmp, f"cells-{strip}")
    subprocess.run([sys.executable, WORKER, "--lc-dir", lc,
                    "--windows", os.path.join(tmp, "windows.json"),
                    "--regions", os.path.join(tmp, "regions.geojson"),
                    "--fire", os.path.join(tmp, "fire.tif"),
                    "--harvest", os.path.join(tmp, "harvest.tif"),
                    "--provinces", "british-columbia", "--workers", "2",
                    "--strip", str(strip), "--cells-dir", cd, "--output", out], check=True,
                   stdout=subprocess.DEVNULL)
    return json.load(open(out)), cd


def cell_layers(cd):
    grid = np.zeros((10, H, W), np.uint8)
    for f in os.listdir(cd):
        ds = gdal.Open(os.path.join(cd, f))
        gt = ds.GetGeoTransform()
        c0 = round((gt[0] - GT[0]) / GT[1]); r0 = round((gt[3] - GT[3]) / GT[5])
        grid[:, r0:r0 + ds.RasterYSize, c0:c0 + ds.RasterXSize] = ds.ReadAsArray()
    return grid


def main():
    tmp = tempfile.mkdtemp()
    fails = []

    def eq(name, got, want):
        if got != want:
            fails.append(f"{name}: got {got}, want {want}")

    try:
        lc = build(tmp)
        results = [run(tmp, lc, s) for s in (1, 2, 16)]
        for (res, cd), strip in zip(results, (1, 2, 16)):
            g = cell_layers(cd)
            for (r, c), sets in EXPECT.items():
                for si, want in enumerate(sets):
                    got = tuple(int(g[si * 5 + b, r, c]) + (1900 if b in (1, 2, 3) and g[si * 5 + b, r, c] else 0)
                                for b in range(5))
                    eq(f"strip{strip} cell{(r, c)} set{'AB'[si]}", got, want)
            p = res["provinces"]["british-columbia"]
            A, B = p["sets"]["A"], p["sets"]["B"]
            eq("maskCells", p["maskCells"], 44)
            eq("unknown class0", p["unknownClass0Cells"], 1)
            eq("unknown nodata", p["unknownNodataCells"], 1)
            ra, rb = A["regions"], B["regions"]
            eq("region ids", sorted(ra), ["5910", "5920", "none"])
            eq("A 5910 lost", ra["5910"]["lostCells"], 10)
            eq("A 5910 recovered", ra["5910"]["latestLoss"]["recoveredCells"], 1)
            eq("B 5910 lost", rb["5910"]["lostCells"], 8)
            eq("B 5910 latest", rb["5910"]["latestLoss"],
               {"recoveredCells": 2, "notRecoveredCells": 6, "unconfirmedCells": 2})
            eq("B 5910 class81", rb["5910"]["recoveredClass81In2022Cells"], 1)
            eq("A 5920 latest", ra["5920"]["latestLoss"],
               {"recoveredCells": 1, "notRecoveredCells": 1, "unconfirmedCells": 0})
            eq("A 5920 any", ra["5920"]["anyLoss"], {"recoveredCells": 2, "notRecoveredCells": 0})
            eq("A 5920 unknown", ra["5920"]["unknownCells"], 2)
            eq("A 5920 mask", ra["5920"]["maskCells"], 16)
            eq("A none", (ra["none"]["maskCells"], ra["none"]["neverTreedCells"]), (4, 4))
            cz = {k: v["lostCells"] for k, v in ra["5910"]["causeOfLatestLoss"].items()}
            eq("A 5910 cause", cz, {"notRecorded": 8, "fire": 1, "harvest": 0, "fireAndHarvest": 1})
            eq("A 5920 first-loss decade", ra["5920"]["byFirstLossDecade"]["1985-1994"],
               {"lostCells": 2, "recoveredAnyLossCells": 2})
            eq("A 5920 latest-loss decades", {k: v["lostCells"] for k, v in ra["5920"]["byLatestLossDecade"].items()},
               {"1985-1994": 0, "1995-2004": 0, "2005-2014": 0, "2015-2022": 2})
            off = A["lossToDisturbanceOffsetHistogram"]
            nz = lambda h: {i - 40: v for i, v in enumerate(h) if v}
            eq("A fire offsets", nz(off["fire"]), {-1: 1, 0: 1})
            eq("A harvest offsets", nz(off["harvest"]), {1: 1, 2: 1})
            eq("A treed 1984", A["annual"]["treedCells"][0], 14)
            eq("B treed 1984", B["annual"]["treedCells"][0], 15)
            eq("A pair loss 1991", A["annual"]["pairLossCells"][YEARS.index(1991)], 5)
            eq("B pair loss 1991", B["annual"]["pairLossCells"][YEARS.index(1991)], 4)
            eq("A total lost", A["total"]["lostCells"], 12)
        strip_free = [json.dumps(r["provinces"], sort_keys=True) for r, _ in results]
        eq("strip size changes nothing", len(set(strip_free)), 1)
    finally:
        shutil.rmtree(tmp)
    if fails:
        print("FAIL"); print("\n".join(fails)); return 1
    print("PASS: hand-built trajectories, regions, causes and strip invariance")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
