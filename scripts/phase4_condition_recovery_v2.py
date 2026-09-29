#!/usr/bin/env python3
"""Condition and recovery from raw VLCE2 classes, in one pass over 1984-2022.

A successor to scripts/phase4_recovery_trajectory.py, which stays unchanged
because its digest is bound into recorded evidence. That worker read derived
forest masks; this one reads the published VLCE2 classes directly so that two
definitions of "treed" can be measured side by side from the same bytes:

  A = {210, 220, 230}        coniferous, broadleaf, mixedwood
  B = {81, 210, 220, 230}    A plus treed wetland

Rules, identical for both sets:
  loss         treed in year t and not treed in t+1. The loss year recorded
               is t+1, the first year the cell was not treed.
  recovered    treed again for at least CONFIRM consecutive years after a
               loss. Two readings are kept:
                 latest-loss  recovered only if the return followed the
                              cell's last loss (the headline reading)
                 any-loss     recovered if any loss was ever followed by one
  unconfirmed  a return still shorter than CONFIRM years in 2022. Under the
               latest-loss reading it is a subset of not recovered.
  unknown      a cell inside the province whose class is 0 (outside the
               mapped extent), 255 (nodata) or off the VLCE2 legend in ANY
               year. It is counted and reported, never folded into a zero.
  recovered + not recovered == lost, for both readings, in every row.

Everything is cross-tabulated in one bincount per strip: province x economic
region x state x latest-loss decade x first-loss decade x cause x any-loss
recovered x class-81-in-2022. Every published figure is a sum over that table,
so the partition identities hold by construction and are asserted anyway.

Cause of the latest loss comes from the NTEMS fire and harvest year rasters:
a disturbance year within CAUSE_WINDOW years of the loss year counts. The
rasters hold one year per cell and record nothing before 1985, so "cause not
recorded" means exactly that and never "undisturbed". The full offset
histograms are kept so the window can be judged rather than assumed.

Optionally writes one small GeoTIFF per strip holding per-cell layers for the
tiles; a VRT stitches them. Nothing here edits an input.
"""
from __future__ import annotations

import argparse, hashlib, json, os, sys, time
from datetime import datetime, timezone
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from osgeo import gdal, ogr, osr

gdal.UseExceptions()

FIRST, LAST = 1984, 2022
YEARS = list(range(FIRST, LAST + 1))
NY = len(YEARS)
CONFIRM = 3
CAUSE_WINDOW = 1
STRIP = 256
LEGEND = (20, 31, 32, 33, 40, 50, 80, 81, 100, 210, 220, 230)
SETS = {"A": (210, 220, 230), "B": (81, 210, 220, 230)}
SET_KEYS = tuple(SETS)
DECADES = ((1985, 1994), (1995, 2004), (2005, 2014), (2015, 2022))
PRUID = {"british-columbia": "59", "alberta": "48", "ontario": "35", "quebec": "24"}
OFFSET_SPAN = 40                     # histogram bins cover -40..+40 years

# Per-cell state. 0 is reserved for "outside the province" so that Unknown has
# its own code and is never read as a zero.
OUTSIDE, UNKNOWN, NEVER_TREED, TREED_NOT_LOST, RECOVERED, NOT_RECOVERED, UNCONFIRMED = range(7)
STATE_NAMES = ["outside", "unknown", "neverTreed", "treedNotLost", "recovered",
               "notRecovered", "notRecoveredUnconfirmedReturn"]
CAUSE_NAMES = ["notRecorded", "fire", "harvest", "fireAndHarvest"]
# Cross-tab axes, in bincount order (last axis varies fastest).
AXES = (("state", 7), ("latestDecade", 5), ("firstDecade", 5), ("cause", 4),
        ("recoveredAnyLoss", 2), ("class81In2022", 2))
NCODE = int(np.prod([n for _, n in AXES]))


def luts():
    out = {}
    for k, treed in SETS.items():
        t = np.full(256, 2, dtype=np.uint8)     # 2 unknown, 0 not treed, 1 treed
        t[list(LEGEND)] = 0
        t[list(treed)] = 1
        out[k] = t
    return out


LUTS = luts()


def decade_index(year):
    """0 for no loss, 1..4 for the four decades of the loss year."""
    d = np.zeros(year.shape, np.uint8)
    for i, (lo, hi) in enumerate(DECADES, 1):
        d[(year >= lo) & (year <= hi)] = i
    return d


def walk(read_year, inmask):
    """Walk every cell's trajectory once, for both class sets.

    read_year(y) returns the uint8 VLCE2 classes for the strip. Returns the
    per-set cell arrays plus the per-year treed and pair-loss counts over the
    province mask, and the unknown breakdown (identical for both sets).
    """
    shp = inmask.shape
    unk = np.zeros(shp, bool)
    u0 = np.zeros(shp, bool); u255 = np.zeros(shp, bool)
    st = {}
    for k in SET_KEYS:
        st[k] = dict(ever=np.zeros(shp, bool), lost=np.zeros(shp, bool),
                     pend=np.zeros(shp, bool), rec=np.zeros(shp, bool),
                     run=np.zeros(shp, np.uint8), first=np.zeros(shp, np.uint16),
                     latest=np.zeros(shp, np.uint16), rstart=np.zeros(shp, np.uint16),
                     prev=None, treed=np.zeros(NY, np.int64), pair=np.zeros(NY, np.int64))
    last = None
    for i, y in enumerate(YEARS):
        a = read_year(y)
        bad = LUTS["A"][a] == 2          # unknown does not depend on the set
        unk |= bad
        u0 |= a == 0
        u255 |= a == 255
        for k in SET_KEYS:
            s = st[k]
            f = LUTS[k][a] == 1
            s["ever"] |= f
            s["treed"][i] = np.count_nonzero(f & inmask)
            prev = s["prev"]
            if prev is not None:
                loss = prev & ~f & ~bad
                s["pair"][i] = np.count_nonzero(loss & inmask)
                s["first"][loss & (s["first"] == 0)] = y
                s["latest"][loss] = y
                s["lost"] |= loss
                s["pend"] |= loss
                s["rstart"][loss] = 0
                back = s["pend"] & f
                s["run"][back] = np.minimum(s["run"][back], 254) + 1
                s["run"][s["pend"] & ~f] = 0      # also restarts the count at a new loss
                done = back & (s["run"] >= CONFIRM)
                s["rstart"][done] = y - CONFIRM + 1
                s["rec"] |= done
                s["pend"] &= ~done
            s["prev"] = f
        if y == LAST:
            last = a
    return st, unk, u0, u255, last


def cell_state(s, unk, inmask):
    state = np.full(inmask.shape, OUTSIDE, np.uint8)
    state[inmask] = NEVER_TREED
    state[inmask & s["ever"]] = TREED_NOT_LOST
    lost = inmask & s["lost"]
    state[lost & ~s["pend"]] = RECOVERED
    state[lost & s["pend"]] = NOT_RECOVERED
    state[lost & s["pend"] & (s["run"] > 0)] = UNCONFIRMED
    state[inmask & unk] = UNKNOWN
    return state


def cause_of(latest, fire, harvest):
    """0 not recorded, 1 fire, 2 harvest, 3 both, for cells with a loss year."""
    lat = latest.astype(np.int32)
    has = lat > 0
    f = has & (fire > 0) & (np.abs(fire.astype(np.int32) - lat) <= CAUSE_WINDOW)
    h = has & (harvest > 0) & (np.abs(harvest.astype(np.int32) - lat) <= CAUSE_WINDOW)
    return (f.astype(np.uint8) + 2 * h.astype(np.uint8))


def offsets(latest, dist, sel):
    m = sel & (dist > 0)
    d = dist[m].astype(np.int32) - latest[m].astype(np.int32)
    d = np.clip(d, -OFFSET_SPAN, OFFSET_SPAN) + OFFSET_SPAN
    return np.bincount(d, minlength=2 * OFFSET_SPAN + 1).astype(np.int64)


_REGIONS = {}


def region_layer(regions_path, dst_wkt, codes):
    """Economic regions reprojected to the raster grid, cached per process."""
    key = (regions_path, dst_wkt)
    if key in _REGIONS:
        return _REGIONS[key]
    src = ogr.Open(regions_path)
    lyr = src.GetLayer(0)
    s_srs = lyr.GetSpatialRef().Clone()
    s_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    d_srs = osr.SpatialReference(); d_srs.ImportFromWkt(dst_wkt)
    d_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    tx = osr.CoordinateTransformation(s_srs, d_srs)
    mem = (ogr.GetDriverByName("MEM") or ogr.GetDriverByName("Memory")).CreateDataSource("regions")
    out = mem.CreateLayer("r", d_srs, ogr.wkbMultiPolygon)
    out.CreateField(ogr.FieldDefn("code", ogr.OFTInteger))
    for feat in lyr:
        eruid = str(feat.GetField("ERUID"))
        if eruid not in codes:
            continue
        g = feat.GetGeometryRef().Clone()
        g.Transform(tx)
        f = ogr.Feature(out.GetLayerDefn())
        f.SetGeometry(g); f.SetField("code", codes[eruid])
        out.CreateFeature(f)
    _REGIONS[key] = (mem, out)
    return mem, out


def rasterize_regions(regions_path, codes, wkt, gt, x0, y0, w, h):
    _, lyr = region_layer(regions_path, wkt, codes)
    ds = gdal.GetDriverByName("MEM").Create("", w, h, 1, gdal.GDT_Byte)
    ds.SetGeoTransform((gt[0] + x0 * gt[1], gt[1], 0.0, gt[3] + y0 * gt[5], 0.0, gt[5]))
    ds.SetProjection(wkt)
    minx = gt[0] + x0 * gt[1]; maxx = minx + w * gt[1]
    maxy = gt[3] + y0 * gt[5]; miny = maxy + h * gt[5]
    lyr.SetSpatialFilterRect(minx, miny, maxx, maxy)
    gdal.RasterizeLayer(ds, [1], lyr, options=["ATTRIBUTE=code"])
    lyr.SetSpatialFilter(None)
    return ds.GetRasterBand(1).ReadAsArray()


def strip_job(args):
    (lc_dir, mask_path, win, r0, nrows, cache_mb, regions, codes,
     fire_path, harvest_path, cells_dir, tag) = args
    gdal.SetCacheMax(cache_mb * 1024 * 1024)
    md = gdal.Open(mask_path)
    mk = md.GetRasterBand(1).ReadAsArray(0, r0, win["xsize"], nrows) == 1
    md = None
    K = len(codes) + 1
    empty = {"cross": {k: np.zeros(K * NCODE, np.int64) for k in SET_KEYS},
             "annual": {k: {"treed": np.zeros(NY, np.int64), "pair": np.zeros(NY, np.int64)} for k in SET_KEYS},
             "offsets": {k: {"fire": np.zeros(2 * OFFSET_SPAN + 1, np.int64),
                             "harvest": np.zeros(2 * OFFSET_SPAN + 1, np.int64)} for k in SET_KEYS},
             "maskCells": 0, "unknownClass0Cells": 0, "unknownNodataCells": 0}
    if not mk.any():
        return empty
    cols = np.flatnonzero(mk.any(axis=0))
    c0, c1 = int(cols[0]), int(cols[-1]) + 1
    mk = np.ascontiguousarray(mk[:, c0:c1])
    X0, Y0, W = win["xoff"] + c0, win["yoff"] + r0, c1 - c0

    dss = {}

    def read_year(y):
        if y not in dss:
            dss[y] = gdal.Open(os.path.join(lc_dir, f"CA_forest_VLCE2_{y}.tif"))
        return dss[y].GetRasterBand(1).ReadAsArray(X0, Y0, W, nrows)

    st, unk, u0, u255, last = walk(read_year, mk)
    ref = dss[LAST]
    wkt, gt = ref.GetProjection(), ref.GetGeoTransform()
    dss.clear()

    def read16(path):
        d = gdal.Open(path)
        return d.GetRasterBand(1).ReadAsArray(X0, Y0, W, nrows)

    fire, harvest = read16(fire_path), read16(harvest_path)
    reg = rasterize_regions(regions, codes, wkt, gt, X0, Y0, W, nrows).astype(np.int32)
    out = empty
    out["maskCells"] = int(mk.sum())
    out["unknownClass0Cells"] = int((mk & u0).sum())
    out["unknownNodataCells"] = int((mk & u255).sum())
    c81 = (last == 81)
    layers = []
    for k in SET_KEYS:
        s = st[k]
        state = cell_state(s, unk, mk)
        known_lost = mk & ~unk & s["lost"]
        cause = np.where(known_lost, cause_of(s["latest"], fire, harvest), 0).astype(np.uint8)
        ld = np.where(known_lost, decade_index(s["latest"]), 0)
        fd = np.where(known_lost, decade_index(s["first"]), 0)
        ra = known_lost & s["rec"]
        code = state.astype(np.int32)   # K * NCODE stays far below 2**31
        for arr, (_, n) in zip((ld, fd, cause, ra, c81 & known_lost), AXES[1:]):
            code = code * n + arr.astype(np.int32)
        flat = (reg * NCODE + code)[mk]
        out["cross"][k] = np.bincount(flat, minlength=K * NCODE).astype(np.int64)
        out["annual"][k] = {"treed": s["treed"], "pair": s["pair"]}
        out["offsets"][k] = {"fire": offsets(s["latest"], fire, known_lost),
                             "harvest": offsets(s["latest"], harvest, known_lost)}
        if cells_dir:
            yr = lambda a: np.where(known_lost & (a > 0), a.astype(np.int32) - 1900, 0).astype(np.uint8)
            layers += [state, yr(s["latest"]), yr(s["rstart"]), yr(s["first"]),
                       np.where(known_lost, cause + 1, 0).astype(np.uint8)]
    if cells_dir:
        path = os.path.join(cells_dir, f"{tag}.tif")
        tmp = path + ".part"
        ds = gdal.GetDriverByName("GTiff").Create(
            tmp, W, nrows, len(layers), gdal.GDT_Byte,
            ["COMPRESS=LZW", "TILED=YES", "BLOCKXSIZE=256", "BLOCKYSIZE=256", "INTERLEAVE=BAND"])
        ds.SetGeoTransform((gt[0] + X0 * gt[1], gt[1], 0.0, gt[3] + Y0 * gt[5], 0.0, gt[5]))
        ds.SetProjection(wkt)
        for b, arr in enumerate(layers, 1):
            ds.GetRasterBand(b).WriteArray(arr)
        ds = None
        os.replace(tmp, path)
    return out


def jobs_for(p, slug, a, codes):
    w = p["window"]
    jobs, r = [], w["yoff"]
    end = w["yoff"] + w["ysize"]
    while r < end:
        b = min(end, (r // a.strip + 1) * a.strip)   # stop on the next absolute multiple
        jobs.append((a.lc_dir, p["mask"], w, r - w["yoff"], b - r, a.gdal_cache_megabytes,
                     a.regions, codes, a.fire, a.harvest, a.cells_dir, f"{slug}-{r:06d}"))
        r = b
    return jobs


def region_codes(path, pruids):
    src = ogr.Open(path)
    names = {}
    for f in src.GetLayer(0):
        if str(f.GetField("PRUID")) in pruids:
            names[str(f.GetField("ERUID"))] = (str(f.GetField("ERNAME")), str(f.GetField("PRUID")))
    order = sorted(names)
    if len(order) > 254:
        raise SystemExit("more economic regions than a byte code holds")
    return {e: i + 1 for i, e in enumerate(order)}, names


def summarise(cross, K, ids):
    """Turn a flat cross-tab into the published counts for each region row."""
    t = cross.reshape([K] + [n for _, n in AXES])
    rows = {}
    for r in range(K):
        x = t[r]
        by_state = x.sum(axis=(1, 2, 3, 4, 5))
        lost = int(by_state[RECOVERED] + by_state[NOT_RECOVERED] + by_state[UNCONFIRMED])
        rec_any = int(x[RECOVERED:, :, :, :, 1, :].sum())
        row = {
            "maskCells": int(by_state.sum()),
            "unknownCells": int(by_state[UNKNOWN]),
            "knownCells": int(by_state.sum() - by_state[UNKNOWN]),
            "neverTreedCells": int(by_state[NEVER_TREED]),
            "everTreedCells": int(by_state[TREED_NOT_LOST] + lost),
            "lostCells": lost,
            "latestLoss": {"recoveredCells": int(by_state[RECOVERED]),
                           "notRecoveredCells": int(by_state[NOT_RECOVERED] + by_state[UNCONFIRMED]),
                           "unconfirmedCells": int(by_state[UNCONFIRMED])},
            "anyLoss": {"recoveredCells": rec_any, "notRecoveredCells": lost - rec_any},
            "recoveredClass81In2022Cells": int(x[RECOVERED, :, :, :, :, 1].sum()),
            "byLatestLossDecade": {}, "byFirstLossDecade": {}, "causeOfLatestLoss": {},
        }
        for i, (lo, hi) in enumerate(DECADES, 1):
            key = f"{lo}-{hi}"
            lx = x[:, i]
            row["byLatestLossDecade"][key] = {
                "lostCells": int(lx[RECOVERED:].sum()),
                "recoveredCells": int(lx[RECOVERED].sum()),
                "unconfirmedCells": int(lx[UNCONFIRMED].sum())}
            fx = x[:, :, i]
            row["byFirstLossDecade"][key] = {
                "lostCells": int(fx[RECOVERED:].sum()),
                "recoveredAnyLossCells": int(fx[RECOVERED:, :, :, 1].sum())}
        for c, name in enumerate(CAUSE_NAMES):
            cx = x[:, :, :, c]
            row["causeOfLatestLoss"][name] = {
                "lostCells": int(cx[RECOVERED:].sum()),
                "recoveredCells": int(cx[RECOVERED].sum())}
        check(row)
        rows[ids[r]] = row
    return rows


def check(row):
    l = row["latestLoss"]; a = row["anyLoss"]
    assert l["recoveredCells"] + l["notRecoveredCells"] == row["lostCells"]
    assert a["recoveredCells"] + a["notRecoveredCells"] == row["lostCells"]
    assert l["unconfirmedCells"] <= l["notRecoveredCells"]
    assert row["knownCells"] + row["unknownCells"] == row["maskCells"]
    assert sum(v["lostCells"] for v in row["byLatestLossDecade"].values()) == row["lostCells"]
    assert sum(v["lostCells"] for v in row["byFirstLossDecade"].values()) == row["lostCells"]
    assert sum(v["lostCells"] for v in row["causeOfLatestLoss"].values()) == row["lostCells"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lc-dir", required=True)
    ap.add_argument("--windows", required=True)
    ap.add_argument("--regions", required=True, help="StatCan 2021 economic regions (ERUID, ERNAME, PRUID)")
    ap.add_argument("--fire", required=True)
    ap.add_argument("--harvest", required=True)
    ap.add_argument("--provinces", default="british-columbia,alberta,ontario,quebec")
    ap.add_argument("--workers", type=int, default=os.cpu_count())
    ap.add_argument("--strip", type=int, default=STRIP)
    ap.add_argument("--gdal-cache-megabytes", type=int, default=64)
    ap.add_argument("--cells-dir", default=None, help="write per-strip per-cell layers here")
    ap.add_argument("--output", required=True)
    a = ap.parse_args()
    if os.path.exists(a.output):
        print(f"refusing to overwrite {a.output}", file=sys.stderr)
        return 1
    missing = [y for y in YEARS if not os.path.exists(os.path.join(a.lc_dir, f"CA_forest_VLCE2_{y}.tif"))]
    if missing:
        print(f"missing VLCE2 years {missing}", file=sys.stderr)
        return 1
    if a.cells_dir:
        os.makedirs(a.cells_dir, exist_ok=True)
        if os.listdir(a.cells_dir):
            print(f"refusing a non-empty cells directory {a.cells_dir}", file=sys.stderr)
            return 1
    wins = json.load(open(a.windows))["provinces"]
    slugs = a.provinces.split(",")
    pruids = {PRUID[s] for s in slugs}
    codes, names = region_codes(a.regions, pruids)
    K = len(codes) + 1
    ids = ["none"] + sorted(codes, key=codes.get)
    t0 = time.time()
    jobs = [(slug, j) for slug in slugs for j in jobs_for(wins[slug], slug, a, codes)]
    tots = {s: None for s in slugs}

    def add(dst, src):
        if dst is None:
            return src
        for k in SET_KEYS:
            dst["cross"][k] += src["cross"][k]
            for m in ("treed", "pair"):
                dst["annual"][k][m] += src["annual"][k][m]
            for m in ("fire", "harvest"):
                dst["offsets"][k][m] += src["offsets"][k][m]
        for m in ("maskCells", "unknownClass0Cells", "unknownNodataCells"):
            dst[m] += src[m]
        return dst

    with ProcessPoolExecutor(max_workers=a.workers) as ex:
        # One queue across all provinces so no core idles at a province's tail.
        for i, (r, (slug, _)) in enumerate(zip(ex.map(strip_job, [j for _, j in jobs]), jobs), 1):
            tots[slug] = add(tots[slug], r)
            if i % 50 == 0 or i == len(jobs):
                print(f"{i}/{len(jobs)} strips {time.time()-t0:7.0f}s", flush=True)

    result = {}
    for slug in slugs:
        t = tots[slug]
        if t["maskCells"] != wins[slug]["landCells"]:
            raise SystemExit(f"{slug}: mask cells {t['maskCells']} != manifest {wins[slug]['landCells']}")
        prov = {"pruid": PRUID[slug], "window": wins[slug]["window"], "maskCells": t["maskCells"],
                "unknownClass0Cells": t["unknownClass0Cells"],
                "unknownNodataCells": t["unknownNodataCells"], "sets": {}}
        for k in SET_KEYS:
            rows = summarise(t["cross"][k], K, ids)
            total = summarise(t["cross"][k].reshape(K, NCODE).sum(axis=0), 1, ["total"])["total"]
            if total["maskCells"] != t["maskCells"]:
                raise SystemExit(f"{slug}/{k}: cross-tab lost cells")
            prov["sets"][k] = {
                "total": total,
                "regions": {e: dict(r, **({"name": names[e][0], "pruid": names[e][1]} if e in names else {}))
                            for e, r in rows.items() if r["maskCells"]},
                "annual": {"years": YEARS, "treedCells": t["annual"][k]["treed"].tolist(),
                           "pairLossCells": t["annual"][k]["pair"].tolist()},
                "lossToDisturbanceOffsetHistogram": {
                    "offsetsFrom": -OFFSET_SPAN, "clippedAtEnds": True,
                    "fire": t["offsets"][k]["fire"].tolist(),
                    "harvest": t["offsets"][k]["harvest"].tolist()},
            }
        result[slug] = prov
        print(slug, json.dumps({k: prov["sets"][k]["total"]["latestLoss"] for k in SET_KEYS}), flush=True)

    with open(os.path.abspath(__file__), "rb") as fh:
        worker_sha256 = hashlib.sha256(fh.read()).hexdigest()
    payload = {
        "method": "condition-recovery-vlce2-classes-v2",
        "workerSha256": worker_sha256,
        "executedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "treedClassSets": {k: list(v) for k, v in SETS.items()},
        "confirmYears": CONFIRM, "causeWindowYears": CAUSE_WINDOW, "cellHectares": 0.09,
        "lossYearMeaning": "first year not treed after a treed year",
        "stateCodes": STATE_NAMES, "causeNames": CAUSE_NAMES,
        "cellLayerBands": [f"{k}:{b}" for k in SET_KEYS for b in
                           ("state", "latestLossYearMinus1900", "recoveryStartYearMinus1900",
                            "firstLossYearMinus1900", "causePlus1")] if a.cells_dir else None,
        "workers": a.workers, "cpuCount": os.cpu_count(), "strip": a.strip,
        "elapsedSeconds": round(time.time() - t0, 1), "provinces": result,
    }
    tmp = a.output + ".part"
    with open(tmp, "w") as fh:
        json.dump(payload, fh, indent=1)
    os.replace(tmp, a.output)
    print(f"wrote {a.output} in {time.time()-t0:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
