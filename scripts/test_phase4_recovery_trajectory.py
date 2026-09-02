#!/usr/bin/env python3
"""Drive the recovery worker over hand-built trajectories with known answers.

Every column below is one trajectory chosen to exercise one rule, and the
expected counts are worked out by hand from the rules rather than from a
previous run of this code, so the test can fail the implementation.
"""
import json, os, shutil, subprocess, sys, tempfile
import numpy as np
from osgeo import gdal, ogr, osr

gdal.UseExceptions()
HERE = os.path.dirname(os.path.abspath(__file__))
WORKER = os.path.join(HERE, "phase4_recovery_trajectory.py")
FIRST, LAST, NODATA = 1984, 2022, 255
YEARS = list(range(FIRST, LAST + 1))
W, H = 10, 2
GT = (0.0, 1.0, 0.0, 10.0, 0.0, -1.0)

def forest_series() -> dict:
    """column -> list of 39 values, 1 forest, 0 not forest, 255 nodata."""
    s = {c: [0] * 39 for c in range(W)}
    s[1] = [1] * 39                                     # forest throughout
    s[2] = [1 if y <= 1990 else 0 for y in YEARS]       # lost, never returns
    s[3] = [0 if 1991 <= y <= 1993 else 1 for y in YEARS]  # lost, returns 29 years
    s[4] = [0 if y == 2020 else 1 for y in YEARS]       # returns 2021-2022 only
    s[5] = [0 if y in (1991, 1994) else 1 for y in YEARS]  # lost twice, then holds
    s[6] = [NODATA if y == 2000 else 1 for y in YEARS]  # a hole in the trajectory
    s[7] = [1] * 39                                     # outside the mapped extent
    # Recovers early, then is lost again and returns too late to confirm. This
    # is the only column that distinguishes a pending flag that re-arms on a
    # second loss from one that latches off once recovery is recorded.
    s[8] = [0 if y in (1991, 2020) else 1 for y in YEARS]
    # Returns for two years, is lost again, and returns for one final year.
    # Only a counter that resets on the second loss leaves this unconfirmed;
    # a counter that carries the earlier two years over reaches three and
    # would wrongly call it recovered.
    s[9] = [0 if y in (2018, 2021) else 1 for y in YEARS]
    return s

def write_tif(path, arr, nodata=None):
    ds = gdal.GetDriverByName("GTiff").Create(path, W, H, 1, gdal.GDT_Byte)
    ds.SetGeoTransform(GT)
    srs = osr.SpatialReference(); srs.ImportFromEPSG(4326)
    ds.SetProjection(srs.ExportToWkt())
    b = ds.GetRasterBand(1)
    if nodata is not None:
        b.SetNoDataValue(nodata)
    b.WriteArray(arr)
    ds = None

def build(tmp):
    masks = os.path.join(tmp, "masks"); os.makedirs(masks)
    s = forest_series()
    for i, y in enumerate(YEARS):
        a = np.zeros((H, W), dtype=np.uint8)
        for c in range(W):
            a[0, c] = s[c][i]        # row 0 carries the trajectories
        write_tif(os.path.join(masks, f"forest-mask-{y}.tif"), a, NODATA)
    ext = np.ones((H, W), dtype=np.uint8)
    ext[:, 7] = NODATA               # column 7 was never mapped
    epath = os.path.join(tmp, "mapped-extent.tif")
    write_tif(epath, ext, NODATA)

    bpath = os.path.join(tmp, "boundaries.gpkg")
    ds = ogr.GetDriverByName("GPKG").CreateDataSource(bpath)
    srs = osr.SpatialReference(); srs.ImportFromEPSG(4326)
    lyr = ds.CreateLayer("b", srs, ogr.wkbPolygon)
    lyr.CreateField(ogr.FieldDefn("district", ogr.OFTString))
    # District A is stored as two disjoint features sharing one id, the way a
    # district with islands is published. It must be counted as a single zone.
    for name, x0, x1 in (("A", 0, 2), ("A", 2, 4), ("B", 4, 10)):
        ring = ogr.Geometry(ogr.wkbLinearRing)
        for x, y in ((x0, 8), (x1, 8), (x1, 10), (x0, 10), (x0, 8)):
            ring.AddPoint_2D(float(x), float(y))
        poly = ogr.Geometry(ogr.wkbPolygon); poly.AddGeometry(ring)
        f = ogr.Feature(lyr.GetLayerDefn())
        f.SetGeometry(poly); f.SetField("district", name)
        lyr.CreateFeature(f)
    ds = None
    return masks, epath, bpath

# Worked out by hand from the rules, not from a run of the worker.
EXPECT_NATIONAL = {
    "mappedCells": 18,              # 9 mapped columns x 2 rows
    "unknownCells": 1,              # column 6 row 0 carries nodata in 2000
    "knownCells": 17,
    "everForestCells": 7,           # columns 1,2,3,4,5,8,9 in row 0
    "lostCells": 6,                 # columns 2,3,4,5,8,9
    "recoveredCells": 3,            # columns 3, 5 and 8 hold 3+ years
    "returnUnconfirmedCells": 3,    # columns 4, 8 and 9 are mid-return in 2022
    "notRecoveredCells": 3,         # columns 2, 4 and 9
}
# Columns 3, 5 and 8 are recovered; 2 and 4 are not; together they are exactly
# the 5 lost cells. Column 8 is counted as both recovered and unconfirmed,
# because it recovered once and is mid-return from a later loss. The two
# buckets are deliberately not exclusive and this pins that.
EXPECT_BOUNDARIES = {
    "A": {"knownCells": 8, "everForestCells": 3, "lostCells": 2,
          "recoveredCells": 1, "returnUnconfirmedCells": 0, "unknownCells": 0},
    "B": {"knownCells": 9, "everForestCells": 4, "lostCells": 4,
          "recoveredCells": 2, "returnUnconfirmedCells": 3, "unknownCells": 1},
}

def main() -> int:
    tmp = tempfile.mkdtemp(prefix="phase4-recovery-test-",
                           dir=os.environ.get("PHASE4_TEST_DIR") or None)
    try:
        masks, epath, bpath = build(tmp)
        out = os.path.join(tmp, "result.json")
        r = subprocess.run(
            [sys.executable, WORKER, "--forest-mask-dir", masks,
             "--mapped-extent", epath, "--boundaries", bpath,
             "--boundary-id-field", "district", "--workers", "1",
             "--output", out],
            capture_output=True, text=True)
        if r.returncode != 0:
            print(r.stdout); print(r.stderr, file=sys.stderr)
            return 1
        got = json.load(open(out))
        fails = []
        for k, want in EXPECT_NATIONAL.items():
            have = got["national"][k]
            if have != want:
                fails.append(f"national.{k}: expected {want}, got {have}")
        for bid, want in EXPECT_BOUNDARIES.items():
            have = got.get("boundaries", {}).get(bid)
            if have is None:
                fails.append(f"boundary {bid} missing entirely")
                continue
            for k, v in want.items():
                if have[k] != v:
                    fails.append(f"boundary {bid}.{k}: expected {v}, got {have[k]}")
        if got["claims"]["netChangeIncluded"]:
            fails.append("net change must never be claimed")
        for f in fails:
            print(f"FAIL {f}")
        if fails:
            return 1
        print(f"ok  national and both boundaries match "
              f"({len(EXPECT_NATIONAL)} national and "
              f"{sum(len(v) for v in EXPECT_BOUNDARIES.values())} boundary assertions)")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

if __name__ == "__main__":
    sys.exit(main())
