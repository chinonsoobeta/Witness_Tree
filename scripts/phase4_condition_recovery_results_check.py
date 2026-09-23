#!/usr/bin/env python3
"""Independent check: v2 recovery calls against BC RESULTS forest cover.

Rule fixed on 2026-09-23 BEFORE any agreement figure was computed:
  reference "regenerated"   STOCKING_STATUS_CODE IMM or MAT, leading-species
                            height I_SPECIES_HEIGHT_1 >= 5 m, REFERENCE_YEAR
                            2015-2022 (observed near the end of the series,
                            tall enough for Landsat to see canopy)
  reference "not restocked" STOCKING_STATUS_CODE NSR, REFERENCE_YEAR 2015-2022
  our call per polygon      among the polygon's known lost cells (cell inside
                            the polygon when rasterized), recovered if more
                            than half are recovered under latest-loss semantics
  eligible polygon          at least 10 known lost cells (0.9 ha)
Every eligible polygon is used; nothing is sampled. Reported: overall
agreement, agreement within each reference class, balanced agreement, and the
count of polygons that had too few lost cells to call.

A second breakdown was written AFTER the agreement figure was seen, so it is
an explanation and never a pass criterion: the same agreement restricted to
polygons where more than half of the lost cells had their latest loss before
the RESULTS reference year. It is reported under "postHoc" and labelled so.

Reads the per-cell VRT written by scripts/phase4_condition_recovery_v2.py
(band 1 and 6 are the state for sets A and B, band 2 and 7 the latest loss
year minus 1900) and the RESULTS WFS pages as fetched. Features repeated
across pages are counted once by OBJECTID. Nothing here edits an input.
"""
import argparse, hashlib, json, os, sys, time
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
import numpy as np
from osgeo import gdal, ogr, osr

gdal.UseExceptions()
MIN_CELLS = 10
MIN_HEIGHT = 5.0
YEARS = (2015, 2022)
RECOVERED, NOT_RECOVERED, UNCONFIRMED = 4, 5, 6
SETS = {"A": (1, 2), "B": (6, 7)}
CHUNK = 500
_VRT = {}
# GDAL 3.11 renamed the in-memory vector driver from "Memory" to "MEM"; CI runs an older GDAL.
OGR_MEMORY = ogr.GetDriverByName("MEM") or ogr.GetDriverByName("Memory")


def ref_class(p):
    ry = p.get("REFERENCE_YEAR")
    if ry is None or not (YEARS[0] <= ry <= YEARS[1]):
        return None
    s = p.get("STOCKING_STATUS_CODE")
    if s == "NSR":
        return "notRestocked"
    h = p.get("I_SPECIES_HEIGHT_1")
    if s in ("IMM", "MAT") and h is not None and h >= MIN_HEIGHT:
        return "regenerated"
    return None


def polygon_job(args):
    """Per polygon and set: (lost cells, recovered cells, lost cells whose latest loss precedes the reference year)."""
    vrt_path, items = args
    if vrt_path not in _VRT:
        _VRT[vrt_path] = gdal.Open(vrt_path)
    ds = _VRT[vrt_path]
    gt = ds.GetGeoTransform(); wkt = ds.GetProjection()
    dst = osr.SpatialReference(); dst.ImportFromWkt(wkt)
    dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    src = osr.SpatialReference(); src.ImportFromEPSG(3005)
    src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    tx = osr.CoordinateTransformation(src, dst)
    out = []
    for fid, cls, ry, gjson in items:
        g = ogr.CreateGeometryFromJson(gjson); g.Transform(tx)
        minx, maxx, miny, maxy = g.GetEnvelope()
        c0 = max(int(np.floor((minx - gt[0]) / gt[1])), 0)
        c1 = min(int(np.ceil((maxx - gt[0]) / gt[1])), ds.RasterXSize)
        r0 = max(int(np.floor((maxy - gt[3]) / gt[5])), 0)
        r1 = min(int(np.ceil((miny - gt[3]) / gt[5])), ds.RasterYSize)
        if c1 <= c0 or r1 <= r0:
            out.append((fid, cls, None)); continue
        w, h = c1 - c0, r1 - r0
        mem = gdal.GetDriverByName("MEM").Create("", w, h, 1, gdal.GDT_Byte)
        mem.SetGeoTransform((gt[0] + c0 * gt[1], gt[1], 0, gt[3] + r0 * gt[5], 0, gt[5]))
        mem.SetProjection(wkt)
        mds = OGR_MEMORY.CreateDataSource("p")
        lyr = mds.CreateLayer("p", dst, ogr.wkbMultiPolygon)
        f = ogr.Feature(lyr.GetLayerDefn()); f.SetGeometry(g); lyr.CreateFeature(f)
        gdal.RasterizeLayer(mem, [1], lyr, burn_values=[1])
        inside = mem.GetRasterBand(1).ReadAsArray() == 1
        res = {}
        for k, (state_band, year_band) in SETS.items():
            st = ds.GetRasterBand(state_band).ReadAsArray(c0, r0, w, h)[inside]
            ly = ds.GetRasterBand(year_band).ReadAsArray(c0, r0, w, h)[inside].astype(np.int32) + 1900
            lost = np.isin(st, (RECOVERED, NOT_RECOVERED, UNCONFIRMED))
            res[k] = (int(lost.sum()), int((st == RECOVERED).sum()), int((lost & (ly < ry)).sum()))
        out.append((fid, cls, res))
    return out


def agreement(rows):
    """rows: (reference class, lost, recovered). Agreement tables over eligible polygons."""
    conf = {"regenerated": [0, 0], "notRestocked": [0, 0]}   # [we say recovered, we say not]
    for cls, lost, rec in rows:
        conf[cls][0 if rec * 2 > lost else 1] += 1
    agree = conf["regenerated"][0] + conf["notRestocked"][1]
    total = sum(sum(v) for v in conf.values())
    per = {c: (conf[c][0 if c == "regenerated" else 1] / sum(conf[c]) if sum(conf[c]) else None) for c in conf}
    return {"confusion": conf, "eligible": total,
            "agreement": agree / total if total else None, "agreementByReferenceClass": per,
            "balancedAgreement": sum(per.values()) / 2 if all(v is not None for v in per.values()) else None}


def summarize(results):
    out = {}
    for k in SETS:
        too_few = {"regenerated": 0, "notRestocked": 0}
        outside = {"regenerated": 0, "notRestocked": 0}
        rows, before, after_share = [], [], {"regenerated": [0, 0], "notRestocked": [0, 0]}
        for fid, cls, res in results:
            if res is None:
                outside[cls] += 1; continue
            lost, rec, lost_before = res[k]
            if lost < MIN_CELLS:
                too_few[cls] += 1; continue
            rows.append((cls, lost, rec))
            after_share[cls][1] += 1
            if (lost - lost_before) * 2 > lost:
                after_share[cls][0] += 1
            if lost_before * 2 > lost:
                before.append((cls, lost, rec))
        s = agreement(rows)
        s["tooFewLostCells"] = too_few
        s["outsideRaster"] = outside
        pb = agreement(before)
        pb["latestLossMostlyAfterReferenceYear"] = {
            c: {"polygons": v[0], "ofEligible": v[1], "share": v[0] / v[1] if v[1] else None}
            for c, v in after_share.items()}
        s["postHoc"] = {"label": "Written after the agreement figure was seen. An explanation, not a pass criterion.",
                        "latestLossMostlyBeforeReferenceYear": pb}
        out[k] = s
    return out


def read_pages(pages):
    items, seen = [], set()
    counts = {"pageFiles": 0, "featuresRead": 0, "repeatedObjectIds": 0, "nullGeometry": 0}
    for fn in sorted(os.listdir(pages)):
        if not fn.endswith(".geojson"):
            continue
        counts["pageFiles"] += 1
        with open(os.path.join(pages, fn)) as fh:
            feats = json.load(fh)["features"]
        for feat in feats:
            counts["featuresRead"] += 1
            p = feat["properties"]
            fid = p["OBJECTID"]
            if fid in seen:
                counts["repeatedObjectIds"] += 1; continue
            seen.add(fid)
            if feat.get("geometry") is None:
                counts["nullGeometry"] += 1; continue
            cls = ref_class(p)
            if cls:
                items.append((fid, cls, p["REFERENCE_YEAR"], json.dumps(feat["geometry"])))
    counts["uniqueObjectIds"] = len(seen)
    counts["qualifying"] = {c: sum(1 for i in items if i[1] == c) for c in ("regenerated", "notRestocked")}
    return items, counts


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", required=True, help="directory of RESULTS WFS GeoJSON pages")
    ap.add_argument("--vrt", required=True, help="British Columbia per-cell VRT from the v2 worker")
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=os.cpu_count())
    a = ap.parse_args()
    t0 = time.time()
    with open(__file__, "rb") as fh:
        worker_sha256 = hashlib.sha256(fh.read()).hexdigest()
    items, counts = read_pages(a.pages)
    print("features", json.dumps(counts), flush=True)
    chunks = [(a.vrt, items[i:i + CHUNK]) for i in range(0, len(items), CHUNK)]
    results = []
    with ProcessPoolExecutor(max_workers=a.workers) as ex:
        for r in ex.map(polygon_job, chunks):
            results += r
    summary = {
        "method": "condition-recovery-results-agreement-v1",
        "workerSha256": worker_sha256,
        "executedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rule": __doc__.split("A second breakdown")[0].strip(),
        "minLostCells": MIN_CELLS, "minLeadingHeightMetres": MIN_HEIGHT, "referenceYears": list(YEARS),
        "reference": counts,
        "sets": summarize(results),
        "workers": a.workers,
        "elapsedSeconds": round(time.time() - t0, 1),
    }
    for k, s in summary["sets"].items():
        print(k, f"agreement {s['agreement']:.4f} eligible {s['eligible']}", flush=True)
    tmp = a.out + ".part"
    with open(tmp, "w") as fh:
        json.dump(summary, fh, indent=1)
        fh.write("\n")
    os.replace(tmp, a.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
