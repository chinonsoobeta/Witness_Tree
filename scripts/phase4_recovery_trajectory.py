#!/usr/bin/env python3
"""Did forest that was lost come back?

The loss product answers "was forest lost here", one adjacent year pair at a
time. It cannot answer "did it return", because a return is a property of a
cell's whole 39-year trajectory rather than of any one pair. This walks each
mapped cell through 1984 to 2022 once and records what happened to it.

A cell is LOST in a pair when it is forest in the first year and not forest in
the second. It has RECOVERED when it later reads forest again and holds forest
for at least CONFIRM consecutive years, because a single year of forest after a
loss is as likely to be a classification wobble as a regrown stand. Recovered
and not-recovered partition the lost cells: every lost cell is in exactly one.

A return that begins too close to 2022 to accumulate CONFIRM years is reported
separately as unconfirmed. That is an overlapping measure, not a third bucket. A
cell still mid-return in 2022 has not met the rule, so it is counted as not
recovered; a cell that recovered from an earlier loss and is mid-return from a
later one is counted as both recovered and unconfirmed. This file used to say
the unconfirmed were counted as neither, which its own arithmetic and its own
hand-worked test have never done. Reading the old sentence and subtracting the
unconfirmed from the not-recovered total understates it.

Unknown is never turned into zero. A cell outside the land-cover product's
mapped extent was never looked at, and a cell carrying nodata in any year has a
hole in its trajectory. Both are counted as unknown for every question this
worker answers, so a denominator shrinks rather than quietly absorbing a gap.

Net change is not emitted. Forest appearing where none was lost needs a
validated gain product, and this pipeline does not have one.

This is a new file rather than an edit to any phase2 or phase3 worker, whose
digests are bound into existing evidence.

NEVER edit this file while it is running.
"""
from __future__ import annotations

import argparse, hashlib, json, os, sys, time
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone

import numpy as np
from osgeo import gdal, ogr

gdal.UseExceptions()

FIRST, LAST = 1984, 2022
YEARS = list(range(FIRST, LAST + 1))
NODATA = 255
CODE_FIELD = "wt_code"   # integer code burned in place of the caller's id field
CONFIRM = 3          # consecutive forest years required to call a return a recovery
STRIP = 256

def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def band_rows(args):
    r0, nrows, mask_dir, extent, coded_boundaries, codes, cache_mb = args
    gdal.SetCacheMax(cache_mb * 1024 * 1024)
    ext = gdal.Open(extent)
    W = ext.RasterXSize
    gt = ext.GetGeoTransform()
    masks = [gdal.Open(os.path.join(mask_dir, f"forest-mask-{y}.tif")) for y in YEARS]

    # Boundary codes on the same grid. The parent has already written a copy
    # of the boundary layer carrying an integer CODE_FIELD, so this is one
    # rasterisation per band rather than one per feature per band. The earlier
    # per-feature loop rasterised a full band-sized array for every district,
    # which for 343 districts did 343 times the work to produce the same array.
    bnd = None
    if coded_boundaries:
        ds = ogr.Open(coded_boundaries)
        lyr = ds.GetLayer()
        mem = gdal.GetDriverByName("MEM").Create("", W, nrows, 1, gdal.GDT_UInt16)
        mem.SetGeoTransform((gt[0], gt[1], 0.0, gt[3] + gt[5] * r0, 0.0, gt[5]))
        mem.SetProjection(ext.GetProjection())
        gdal.RasterizeLayer(mem, [1], lyr, options=[f"ATTRIBUTE={CODE_FIELD}"])
        a = mem.ReadAsArray()
        if a.any():
            bnd = a

    exa = ext.ReadAsArray(0, r0, W, nrows)
    mapped = exa == 1

    ever = np.zeros((nrows, W), dtype=bool)     # forest in any year
    lost = np.zeros((nrows, W), dtype=bool)     # at least one loss event
    pend = np.zeros((nrows, W), dtype=bool)     # lost and not yet re-forested
    run  = np.zeros((nrows, W), dtype=np.uint8) # consecutive forest years since return
    rec  = np.zeros((nrows, W), dtype=bool)     # recovery confirmed
    unk  = ~mapped                              # unknown anywhere in the trajectory
    prev = None
    for m in masks:
        a = m.ReadAsArray(0, r0, W, nrows)
        unk |= a == NODATA
        f = (a == 1) & mapped
        ever |= f
        if prev is not None:
            loss_now = prev & ~f & mapped
            lost |= loss_now
            pend |= loss_now
            run[loss_now] = 0
            back = pend & f
            run[back] = np.minimum(run[back].astype(np.uint16) + 1, 255).astype(np.uint8)
            run[pend & ~f] = 0
            done = back & (run >= CONFIRM)
            rec |= done
            pend &= ~done
        prev = f
    good = mapped & ~unk
    out = {
        "rows": int(nrows),
        "national": {
            "mappedCells": int(mapped.sum()),
            "unknownCells": int((mapped & unk).sum()),
            "knownCells": int(good.sum()),
            "everForestCells": int((ever & good).sum()),
            "lostCells": int((lost & good).sum()),
            "recoveredCells": int((rec & good).sum()),
            "returnUnconfirmedCells": int((pend & (run > 0) & good).sum()),
            "notRecoveredCells": int((lost & ~rec & good).sum()),
        },
    }
    if bnd is not None:
        per = {}
        for i, bid in ((int(k), v) for k, v in codes.items()):
            sel = (bnd == i) & good
            if not sel.any():
                continue
            per[bid] = {
                "knownCells": int(sel.sum()),
                "everForestCells": int((ever & sel).sum()),
                "lostCells": int((lost & sel).sum()),
                "recoveredCells": int((rec & sel).sum()),
                "returnUnconfirmedCells": int((pend & (run > 0) & sel).sum()),
                "unknownCells": int(((bnd == i) & mapped & unk).sum()),
            }
        out["boundaries"] = per
    return out

def write_coded_boundaries(src_path: str, id_field: str, dst_path: str):
    """Copy a boundary layer, adding one integer field the rasteriser can burn.

    UInt16 holds 65535 codes and 0 means "no boundary here", so codes start at
    1. A layer larger than that is rejected rather than silently wrapping.
    """
    src = ogr.Open(src_path)
    if src is None:
        raise SystemExit(f"cannot open boundaries: {src_path}")
    lyr = src.GetLayer()
    if lyr.GetLayerDefn().GetFieldIndex(id_field) < 0:
        raise SystemExit(f"boundary layer has no field {id_field!r}")
    if os.path.exists(dst_path):
        ogr.GetDriverByName("GPKG").DeleteDataSource(dst_path)
    dst = ogr.GetDriverByName("GPKG").CreateDataSource(dst_path)
    out = dst.CreateLayer("coded", lyr.GetSpatialRef(), lyr.GetGeomType())
    out.CreateField(ogr.FieldDefn(CODE_FIELD, ogr.OFTInteger))

    # One code per distinct id, not per feature. A district is often stored as
    # several features because it includes islands, and those parts are the
    # same zone: Cape Breton alone repeats FED_NUM 12006. Sharing the code
    # across the parts keeps the zones disjoint, which is what the counts
    # require; giving each part its own code would split one district into
    # several and silently understate every one of them.
    code_of, codes = {}, {}
    lyr.ResetReading()
    for i, f in enumerate(lyr, start=1):
        bid = f.GetField(id_field)
        if bid is None:
            raise SystemExit(f"feature {i} has no value in {id_field!r}")
        bid = str(bid)
        if bid not in code_of:
            code = len(code_of) + 1
            if code >= 65535:
                raise SystemExit("distinct boundary ids exceed the UInt16 code space")
            code_of[bid] = code
            codes[str(code)] = bid
        geom = f.GetGeometryRef()
        if geom is None:
            continue
        nf = ogr.Feature(out.GetLayerDefn())
        nf.SetGeometry(geom.Clone())
        nf.SetField(CODE_FIELD, code_of[bid])
        out.CreateFeature(nf)
    dst = None
    return dst_path, codes


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--forest-mask-dir", required=True)
    p.add_argument("--mapped-extent", required=True)
    p.add_argument("--boundaries")
    p.add_argument("--boundary-id-field")
    p.add_argument("--coded-boundary-path", required=False,
                   help="where to write the integer-coded boundary copy; "
                        "defaults to a sibling of the output")
    p.add_argument("--workers", type=int, default=8)
    p.add_argument("--gdal-cache-megabytes", type=int, default=96)
    p.add_argument("--output", required=True)
    a = p.parse_args()
    if a.coded_boundary_path is None:
        a.coded_boundary_path = os.path.splitext(a.output)[0] + ".coded-boundaries.gpkg"
    if os.path.exists(a.output):
        print(f"refusing to overwrite existing output: {a.output}", file=sys.stderr)
        return 1
    missing = [y for y in YEARS if not os.path.exists(os.path.join(a.forest_mask_dir, f"forest-mask-{y}.tif"))]
    if missing:
        print(f"missing forest masks for {missing}", file=sys.stderr)
        return 1
    ext = gdal.Open(a.mapped_extent)
    H = ext.RasterYSize
    del ext

    # Build the coded boundary copy once. Codes are assigned here, in one
    # place, so every band burns the same integer for the same district and
    # the code-to-id map cannot drift from the raster.
    coded_path, codes = None, {}
    if a.boundaries:
        if not a.boundary_id_field:
            print("--boundaries requires --boundary-id-field", file=sys.stderr)
            return 1
        coded_path, codes = write_coded_boundaries(
            a.boundaries, a.boundary_id_field, a.coded_boundary_path)
        print(f"coded {len(codes)} boundaries into {coded_path}", flush=True)

    jobs = [(r, min(STRIP, H - r), a.forest_mask_dir, a.mapped_extent,
             coded_path, codes, a.gdal_cache_megabytes)
            for r in range(0, H, STRIP)]
    t0 = time.time()
    nat = None
    per = {}
    done = 0
    with ProcessPoolExecutor(max_workers=a.workers) as ex:
        for r in ex.map(band_rows, jobs):
            done += 1
            if nat is None:
                nat = dict(r["national"])
            else:
                for k, v in r["national"].items():
                    nat[k] += v
            for bid, vals in r.get("boundaries", {}).items():
                tgt = per.setdefault(bid, {k: 0 for k in vals})
                for k, v in vals.items():
                    tgt[k] += v
            if done % 20 == 0 or done == len(jobs):
                print(f"{time.time()-t0:8.1f}s  {done}/{len(jobs)} bands", flush=True)
    payload = {
        "schema": "witness-tree/phase4-recovery-trajectory/1",
        "status": "local-nonproduction-executed",
        "claims": {"admitted": False, "released": False, "productionEligible": False,
                   "netChangeIncluded": False},
        "method": {
            "firstYear": FIRST, "lastYear": LAST,
            "lossRule": "forest in year t and not forest in year t+1, inside the mapped extent",
            "recoveryRule": f"after a loss, forest again for at least {CONFIRM} consecutive years",
            "unconfirmedRule": "a return with fewer than the required consecutive years by 2022 is reported separately, and overlaps the other two counts rather than forming a third: it is still counted as not recovered, and a cell recovered from an earlier loss can also be mid-return from a later one",
            "partitionRule": "recoveredCells + notRecoveredCells == lostCells; returnUnconfirmedCells is never added to either",
            "unknownPolicy": "outside the mapped extent, or nodata in any year, is Unknown for every question and never zero",
            "cellHectares": 0.09,
        },
        "executedAt": datetime.now(timezone.utc).isoformat(),
        "elapsedSeconds": time.time() - t0,
        "national": nat,
        "boundaries": per or None,
    }
    with open(a.output, "w") as fh:
        json.dump(payload, fh, indent=1)
    print(f"wrote {a.output} in {time.time()-t0:.0f}s")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
