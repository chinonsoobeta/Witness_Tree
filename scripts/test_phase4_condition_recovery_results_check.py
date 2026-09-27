#!/usr/bin/env python3
"""Drive the RESULTS agreement worker over hand-built polygons.

The grid is in BC Albers (EPSG:3005) at 30 m, so a polygon's cells are easy to
count by hand. Each polygon below exercises one rule, and every expected value
was worked out from the rules, not taken from a previous run. One polygon is
repeated on a second page so the OBJECTID de-duplication is tested, and one
lies off the raster.
"""
import json, os, shutil, subprocess, sys, tempfile
import numpy as np
from osgeo import gdal, osr

gdal.UseExceptions()
HERE = os.path.dirname(os.path.abspath(__file__))
WORKER = os.path.join(HERE, "phase4_condition_recovery_results_check.py")
X0, Y0, PX = 1_000_000.0, 1_000_000.0, 30.0
W, H = 40, 10
REC, NOT, UNC, TREED = 4, 5, 6, 3


def box(col, row, ncol, nrow=2):
    """A rectangle covering exactly ncol x nrow cells whose top-left cell is (row, col)."""
    x0, y1 = X0 + col * PX, Y0 - row * PX
    x1, y0 = x0 + ncol * PX, y1 - nrow * PX
    return {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}


def feature(oid, geom, status, year, height=None):
    return {"type": "Feature", "geometry": geom,
            "properties": {"OBJECTID": oid, "STOCKING_STATUS_CODE": status,
                           "REFERENCE_YEAR": year, "I_SPECIES_HEIGHT_1": height}}


def main() -> int:
    a_state = np.zeros((H, W), np.uint8); a_year = np.zeros((H, W), np.uint8)
    # Polygon 1, cols 0-5 (12 cells), regenerated 2018: 7 recovered, 5 not.
    # We call recovered, so it agrees. All losses in 2000, before 2018.
    a_state[0:2, 0:6] = NOT; a_state[0, 0:6] = REC; a_state[1, 0] = REC
    a_year[0:2, 0:6] = 100
    # Polygon 2, cols 6-11, regenerated 2016: 6 recovered, 6 not. Exactly half
    # is not more than half, so we call not recovered and disagree. Latest loss
    # 2016 or later in 7 cells, so it is mostly after the reference year.
    a_state[0:2, 6:12] = NOT; a_state[0, 6:12] = REC
    a_year[0:2, 6:12] = 110; a_year[1, 6:12] = 117; a_year[0, 6] = 116
    # Polygon 3, cols 12-17, NSR 2020: 2 recovered, 8 not, 2 unconfirmed.
    # Unconfirmed is lost, not recovered. Agrees.
    a_state[0:2, 12:18] = NOT; a_state[0, 12:14] = REC; a_state[1, 12:14] = UNC
    a_year[0:2, 12:18] = 90
    # Polygon 4, cols 18-21: only 8 cells, too few to call.
    a_state[0:2, 18:22] = NOT; a_year[0:2, 18:22] = 90
    # Polygon 5, cols 22-27, NSR 2019: 10 lost cells + 2 treed-not-lost; 6 recovered of 10. Disagrees.
    a_state[0:2, 22:28] = NOT; a_state[0, 22:28] = REC; a_state[1, 22:24] = TREED
    a_year[0:2, 22:28] = 95
    # Set B differs only in polygon 2: one more recovered cell, so it agrees.
    b_state = a_state.copy(); b_year = a_year.copy(); b_state[1, 6] = REC

    tmp = tempfile.mkdtemp()
    try:
        vrt = os.path.join(tmp, "cells.tif")
        ds = gdal.GetDriverByName("GTiff").Create(vrt, W, H, 10, gdal.GDT_Byte)
        ds.SetGeoTransform((X0, PX, 0, Y0, 0, -PX))
        sr = osr.SpatialReference(); sr.ImportFromEPSG(3005); ds.SetProjection(sr.ExportToWkt())
        bands = {1: a_state, 2: a_year, 6: b_state, 7: b_year}
        for b in range(1, 11):
            ds.GetRasterBand(b).WriteArray(bands.get(b, np.zeros((H, W), np.uint8)))
        ds = None
        pages = os.path.join(tmp, "pages"); os.mkdir(pages)
        p1 = [feature(1, box(0, 0, 6), "IMM", 2018, 6.0),
              feature(2, box(6, 0, 6), "MAT", 2016, 21.0),
              feature(3, box(12, 0, 6), "NSR", 2020),
              feature(4, box(18, 0, 4), "NSR", 2020),
              feature(5, box(22, 0, 6), "NSR", 2019)]
        p2 = [feature(2, box(6, 0, 6), "MAT", 2016, 21.0),           # repeated OBJECTID
              feature(6, box(0, 0, 6), "IMM", 2018, 4.9),            # too short: not a reference
              feature(7, box(0, 0, 6), "IMM", 2014, 9.0),            # too early: not a reference
              feature(8, box(0, 0, 6), "IMM", 2018, None),           # no height: not a reference
              feature(9, None, "NSR", 2020),                         # no geometry
              feature(10, box(100, 0, 6), "NSR", 2020)]              # off the raster
        for name, feats in (("page-000.geojson", p1), ("page-001.geojson", p2)):
            with open(os.path.join(pages, name), "w") as fh:
                json.dump({"type": "FeatureCollection", "features": feats}, fh)
        out = os.path.join(tmp, "out.json")
        run = subprocess.run([sys.executable, WORKER, "--pages", pages, "--vrt", vrt, "--out", out, "--workers", "2"],
                             capture_output=True, text=True)
        if run.returncode != 0:
            print(run.stdout, run.stderr, file=sys.stderr)
            return 1
        r = json.load(open(out))
        ref = r["reference"]
        assert ref["featuresRead"] == 11 and ref["repeatedObjectIds"] == 1, ref
        assert ref["uniqueObjectIds"] == 10 and ref["nullGeometry"] == 1, ref
        assert ref["qualifying"] == {"regenerated": 2, "notRestocked": 4}, ref
        a = r["sets"]["A"]
        assert a["confusion"] == {"regenerated": [1, 1], "notRestocked": [1, 1]}, a["confusion"]
        assert a["eligible"] == 4 and a["agreement"] == 0.5, a
        assert a["agreementByReferenceClass"] == {"regenerated": 0.5, "notRestocked": 0.5}, a
        assert a["tooFewLostCells"] == {"regenerated": 0, "notRestocked": 1}, a
        assert a["outsideRaster"] == {"regenerated": 0, "notRestocked": 1}, a
        ph = a["postHoc"]["latestLossMostlyBeforeReferenceYear"]
        assert ph["eligible"] == 3 and ph["confusion"] == {"regenerated": [1, 0], "notRestocked": [1, 1]}, ph
        assert ph["latestLossMostlyAfterReferenceYear"]["regenerated"] == {"polygons": 1, "ofEligible": 2, "share": 0.5}, ph
        b = r["sets"]["B"]
        assert b["confusion"] == {"regenerated": [2, 0], "notRestocked": [1, 1]}, b["confusion"]
        assert b["agreement"] == 0.75, b
        assert len(r["workerSha256"]) == 64 and r["executedAt"].endswith("+00:00"), r
        assert "A second breakdown" not in r["rule"] and "fixed on 2026-09-23 BEFORE" in r["rule"], r["rule"]
    finally:
        shutil.rmtree(tmp)
    print("PASS: RESULTS agreement worker, 10 hand-built polygons, sets A and B")
    return 0


if __name__ == "__main__":
    sys.exit(main())
