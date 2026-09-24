#!/usr/bin/env python3
"""Drive the per-cell tile builder's strip step over a hand-built strip.

Only the polygonizing step is tested, because it decides what is drawn and what
each shape says; the tiler after it is tippecanoe. The strip is in the national
Lambert grid at 30 m, and every expected count was worked out by hand.
"""
import json, os, shutil, sys, tempfile
import numpy as np
from osgeo import gdal, osr

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from phase4_condition_recovery_tiles import code_for, strip_job  # noqa: E402

gdal.UseExceptions()


def main() -> int:
    state = np.array([[0, 1, 1, 2, 3, 4, 4, 5],
                      [0, 1, 2, 2, 3, 4, 5, 6]], np.uint8)
    # Latest loss year minus 1900: 1990, 2000, 2010 and 2020 fall in decades 0 to 3.
    year = np.array([[0, 0, 0, 0, 0, 90, 90, 110],
                     [0, 0, 0, 0, 0, 100, 120, 120]], np.uint8)
    code = code_for(state, year)
    assert code.tolist() == [[0, 10, 10, 0, 0, 40, 40, 52],
                             [0, 10, 0, 0, 0, 41, 53, 63]], code.tolist()
    tmp = tempfile.mkdtemp()
    try:
        strip = os.path.join(tmp, "strip.tif")
        ds = gdal.GetDriverByName("GTiff").Create(strip, 8, 2, 10, gdal.GDT_Byte)
        ds.SetGeoTransform((-1323180.524, 30, 0, 1467378.1105, 0, -30))
        sr = osr.SpatialReference(); sr.ImportFromEPSG(3978); ds.SetProjection(sr.ExportToWkt())
        ds.GetRasterBand(1).WriteArray(state); ds.GetRasterBand(2).WriteArray(year)
        ds = None
        out = os.path.join(tmp, "strip.geojsonl")
        r = strip_job((strip, out))
        # Unknown is one shape of three cells; the two recovered 1990 cells are one
        # shape; every other drawn cell is its own shape. Never-treed and treed
        # cells are not drawn.
        assert r["cellsByCode"] == {10: 3, 40: 2, 41: 1, 52: 1, 53: 1, 63: 1}, r
        assert r["features"] == 6, r
        feats = [json.loads(line) for line in open(out)]
        props = sorted((f["properties"]["state"], f["properties"].get("decade", -1)) for f in feats)
        assert props == [(1, -1), (4, 0), (4, 1), (5, 2), (5, 3), (6, 3)], props
        for f in feats:
            lon, lat = f["geometry"]["coordinates"][0][0]
            assert -121 < lon < -119 and 59 < lat < 61, (lon, lat)
        assert json.load(open(out + ".done")) == json.loads(json.dumps(r))
        # A finished strip is not polygonized twice.
        os.remove(out)
        assert strip_job((strip, out)) == json.loads(json.dumps(r))
        # Blocks of two columns cut the unknown shape and the 1990 pair in two, and
        # count every cell exactly once.
        cut = os.path.join(tmp, "cut.geojsonl")
        rc = strip_job((strip, cut, 2))
        assert rc["cellsByCode"] == r["cellsByCode"], rc
        assert rc["features"] == 8, rc
    finally:
        shutil.rmtree(tmp)
    print("PASS: condition and recovery tile strip step, one hand-built strip")
    return 0


if __name__ == "__main__":
    sys.exit(main())
