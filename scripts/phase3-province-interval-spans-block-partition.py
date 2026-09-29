#!/usr/bin/env python3
"""Interval spans for large boundaries, by an exact block partition.

The phase3 interval worker answers all 741 spans for one boundary in one
process, holding a histogram of distinct loss trajectories. A whole province
exceeds that histogram's ceiling, which is why the province framework run
failed. This driver does not change the worker. It cuts each boundary into
pieces along exact pixel edges, hands each piece to the worker's own
_summarize_feature unchanged, and adds the pieces up.

Why the sum is exact:
- The worker's mask uses GDAL's default rasterization: a cell belongs to a
  polygon when its centre is inside it. Every cut runs along a pixel edge, half
  a cell away from every centre, so each cell of the boundary lands in exactly
  one piece.
- Every field summed below is a count of cells (union, known, unknown, annual,
  summed), so a count over disjoint pieces is the sum of the piece counts.
- distinctTrajectories is not additive and is emitted as null.

Validation mode (--compare) re-runs whole boundaries that already have a
single-process result and requires every summed field to match exactly.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from multiprocessing import get_context

SCRIPTS = "/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/wt/premises/scripts"
sys.path.insert(0, SCRIPTS)
import phase3_interval_zonal_aggregate as W  # noqa: E402  (unchanged, checksum-bound worker)
from osgeo import gdal, ogr  # noqa: E402

DATA_ROOT = "/Volumes/Extended_SSD/Witness_Tree-data"
RASTERS = f"{DATA_ROOT}/derived/phase2-real-national-1984-2022-v1"
EXTENT = f"{DATA_ROOT}/derived/phase2-vlce2-mapped-extent-v1/mapped-extent.tif"
EXPECTED_WORKER_SHA = "e8705301aaf5ae6e1812e6f80f5f8ff3707411c56fe631fd4dc0f8eeeac94674"
EXPECTED_HELPER_SHA = "44c86765b4f1a0ba527f7ed7cb91f95b1d490af404f9d783a84ffdf208a13958"

SUM_SCALAR = ["cells", "unmappedCells", "tilesRead"]
SUM_VECTOR = {
    "forestKnownCells": 39, "forestUnknownCells": 39,
    "annualKnownCells": 38, "annualLossCells": 38, "annualUnknownCells": 38,
    "annualOutsideForestCells": 38,
    "intervalKnownCells": 741, "intervalUnionLossCells": 741,
    "intervalUnknownCells": 741, "intervalSummedLossCells": 741,
}


def file_sha(path: str) -> str:
    real = path
    if path.startswith("/vsizip/"):
        real = path[len("/vsizip/"):].split(".zip/")[0] + ".zip"
    h = hashlib.sha256()
    with open(real, "rb") as f:
        for chunk in iter(lambda: f.read(8 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def areal_only(geometry: ogr.Geometry) -> ogr.Geometry | None:
    """Keep polygon parts only. A line or point left by a cut would be burned
    by the rasterizer as touched cells, which a polygon never is."""
    flat = ogr.GT_Flatten(geometry.GetGeometryType())
    if flat in (ogr.wkbPolygon, ogr.wkbMultiPolygon):
        return geometry
    if flat == ogr.wkbGeometryCollection:
        out = ogr.Geometry(ogr.wkbMultiPolygon)
        for i in range(geometry.GetGeometryCount()):
            part = geometry.GetGeometryRef(i)
            pf = ogr.GT_Flatten(part.GetGeometryType())
            if pf == ogr.wkbPolygon:
                out.AddGeometry(part)
            elif pf == ogr.wkbMultiPolygon:
                for j in range(part.GetGeometryCount()):
                    out.AddGeometry(part.GetGeometryRef(j))
        return out if out.GetGeometryCount() else None
    return None


def cut(boundary_id: str, name: str | None, wkb: bytes, reference, block: int):
    geometry = ogr.CreateGeometryFromWkb(wkb)
    x0, px, _, y0, _, py = reference.GetGeoTransform()
    xoff, yoff, width, height = W.pixel_window(reference, geometry.GetEnvelope())
    pieces = []
    area = 0.0
    for r in range(yoff, yoff + height, block):
        r1 = min(r + block, yoff + height)
        for c in range(xoff, xoff + width, block):
            c1 = min(c + block, xoff + width)
            ring = ogr.Geometry(ogr.wkbLinearRing)
            for cx, ry in ((c, r), (c1, r), (c1, r1), (c, r1), (c, r)):
                ring.AddPoint_2D(x0 + cx * px, y0 + ry * py)
            box = ogr.Geometry(ogr.wkbPolygon)
            box.AddGeometry(ring)
            if not geometry.Intersects(box):
                continue
            piece = geometry.Intersection(box)
            if piece is None or piece.IsEmpty():
                continue
            piece = areal_only(piece)
            if piece is None or piece.GetArea() <= 0:
                continue
            area += piece.GetArea()
            pieces.append((f"{boundary_id}:{r}:{c}", name, piece.ExportToWkb(), piece.GetArea()))
    whole = geometry.GetArea()
    if abs(area - whole) / whole > 1e-9:
        W.fail(f"Pieces of {boundary_id} cover {area} of {whole} square metres")
    return pieces


def run(boundaries, id_field, name_field, ids, block, workers, cache_mb):
    forest_paths, loss_paths = W.resolve_series(f"{RASTERS}/masks", f"{RASTERS}/loss")
    gdal.UseExceptions()
    ogr.UseExceptions()
    reference = gdal.Open(forest_paths[0], gdal.GA_ReadOnly)
    ns = argparse.Namespace(boundaries=boundaries, boundary_id_field=id_field,
                            boundary_name_field=name_field)
    features = [f for f in W.read_boundaries(ns, reference.GetProjection()) if f[0] in ids]
    if sorted(f[0] for f in features) != sorted(ids):
        W.fail(f"Asked for {sorted(ids)}, found {sorted(f[0] for f in features)}")
    config = {
        "forestPaths": forest_paths, "lossPaths": loss_paths, "extentPath": EXTENT,
        "gdalCacheBytes": cache_mb * 1024 * 1024, "histogramCeiling": 4_000_000,
    }
    payloads, owner, names = [], {}, {}
    for bid, name, wkb in features:
        names[bid] = name
        for pid, pname, pwkb, parea in cut(bid, name, wkb, reference, block):
            payloads.append((parea, (config, pid, pname, pwkb)))
            owner[pid] = bid
    payloads.sort(key=lambda p: -p[0])  # biggest first, for load balance
    print(f"{len(features)} boundaries -> {len(payloads)} pieces, {workers} workers",
          file=sys.stderr, flush=True)

    totals = {bid: {"boundaryId": bid, "boundaryName": names[bid], "pieces": 0,
                    **{k: 0 for k in SUM_SCALAR},
                    **{k: [0] * n for k, n in SUM_VECTOR.items()}} for bid in names}
    piece_rows = []
    started = time.monotonic()
    with get_context("spawn").Pool(processes=workers) as pool:
        for i, res in enumerate(pool.imap_unordered(W._summarize_feature,
                                                    [p[1] for p in payloads], chunksize=1), 1):
            piece_rows.append(res)
            t = totals[owner[res["boundaryId"]]]
            t["pieces"] += 1
            for k in SUM_SCALAR:
                t[k] += res[k]
            for k, n in SUM_VECTOR.items():
                if len(res[k]) != n:
                    W.fail(f"Piece {res['boundaryId']} field {k} has {len(res[k])} entries")
                acc = t[k]
                for j, v in enumerate(res[k]):
                    acc[j] += v
            if i % 25 == 0 or i == len(payloads):
                print(f"{i}/{len(payloads)} pieces, {time.monotonic() - started:.0f}s",
                      file=sys.stderr, flush=True)
    for t in totals.values():
        t["distinctTrajectories"] = None
        # Same impossibility check the worker applies per window.
        for known, union in zip(t["intervalKnownCells"], t["intervalUnionLossCells"]):
            if known < 0 or union < 0 or union > known:
                W.fail(f"{t['boundaryId']} has an impossible window after summing")
    return totals, piece_rows, forest_paths, loss_paths, time.monotonic() - started


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--boundaries", required=True)
    p.add_argument("--id-field", required=True)
    p.add_argument("--name-field", default="")
    p.add_argument("--ids", required=True, help="comma-separated boundary ids")
    p.add_argument("--block", type=int, default=4096)
    p.add_argument("--workers", type=int, default=os.cpu_count())
    p.add_argument("--gdal-cache-megabytes", type=int, default=96)
    p.add_argument("--compare", help="single-process interval output to match exactly")
    p.add_argument("--output", required=True)
    p.add_argument("--hash-inputs", action="store_true")
    a = p.parse_args()
    if os.path.exists(a.output):
        W.fail(f"Refusing to overwrite {a.output}")
    for path, want in ((f"{SCRIPTS}/phase3_interval_zonal_aggregate.py", EXPECTED_WORKER_SHA),
                       (f"{SCRIPTS}/phase2_annual_zonal_aggregate_v2.py", EXPECTED_HELPER_SHA)):
        if file_sha(path) != want:
            W.fail(f"{path} is not the checksum-bound worker")

    started_at = datetime.now(timezone.utc)
    ids = [s.strip() for s in a.ids.split(",") if s.strip()]
    totals, pieces, forest_paths, loss_paths, elapsed = run(
        a.boundaries, a.id_field, a.name_field, ids, a.block, a.workers, a.gdal_cache_megabytes)

    comparison = None
    if a.compare:
        ref = {d["boundaryId"]: d for d in json.load(open(a.compare))["districts"]}
        mismatches = []
        for bid, t in totals.items():
            for k in SUM_SCALAR[:2] + list(SUM_VECTOR):
                if t[k] != ref[bid][k]:
                    mismatches.append(f"{bid}.{k}")
        comparison = {"against": a.compare, "againstSha256": file_sha(a.compare),
                      "boundaries": sorted(totals), "fieldsCompared": SUM_SCALAR[:2] + list(SUM_VECTOR),
                      "mismatches": mismatches, "exact": not mismatches}
        print(json.dumps(comparison, indent=1), file=sys.stderr)

    inputs = None
    if a.hash_inputs:
        paths = ([("forestMask", q) for q in forest_paths] + [("annualLoss", q) for q in loss_paths]
                 + [("mappedExtent", EXTENT), ("boundaries", a.boundaries)])
        with ThreadPoolExecutor(max_workers=4) as ex:
            shas = list(ex.map(lambda kp: file_sha(kp[1]), paths))
        inputs = [{"kind": k, "path": q, "sha256": s} for (k, q), s in zip(paths, shas)]

    doc = {
        "schema": "witness-tree/phase3-interval-zonal-block-partition/1",
        "methodVersion": "interval-union-and-sum-1984-2022-v1",
        "boundaries": a.boundaries, "boundaryIdField": a.id_field,
        "productionClaim": False, "admissionStatus": "not-admitted",
        "claims": {"admitted": False, "released": False, "productionEligible": False,
                   "expertReviewed": False},
        "cellHectares": 0.09, "firstYear": W.FIRST_YEAR, "lastYear": W.LAST_YEAR,
        "forestYears": list(W.FOREST_YEARS),
        "lossPairs": [{"fromYear": x, "toYear": y} for x, y in W.LOSS_PAIRS],
        "intervalOrder": [{"fromYear": x, "toYear": y} for x, y in W.WINDOWS],
        "intervalCount": W.INTERVAL_COUNT,
        "unionTerm": "Forest lost at least once", "summedTerm": "Yearly losses added together",
        "summedPercentAllowed": False, "netChangeIncluded": False,
        "unknownPolicy": "unmapped and nodata are preserved as Unknown and never counted as zero",
        "derivation": {
            "kind": "exact-block-partition",
            "blockCells": a.block,
            "why": ("Each boundary is cut along exact pixel edges; the worker's centre-rule mask puts "
                    "every cell in exactly one piece, and every summed field is a cell count."),
            "notSummable": ["distinctTrajectories"],
            "worker": {"path": f"{SCRIPTS}/phase3_interval_zonal_aggregate.py", "sha256": EXPECTED_WORKER_SHA},
            "annualWorkerHelpers": {"path": f"{SCRIPTS}/phase2_annual_zonal_aggregate_v2.py",
                                    "sha256": EXPECTED_HELPER_SHA},
            "driverSha256": file_sha(os.path.abspath(__file__)),
        },
        "execution": {"startedAt": started_at.isoformat().replace("+00:00", "Z"),
                      "completedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                      "elapsedSeconds": round(elapsed, 1), "workers": a.workers,
                      "pieceCount": len(pieces),
                      "gdalVersion": gdal.__version__, "pythonVersion": sys.version.split()[0]},
        "comparison": comparison,
        "inputs": inputs,
        "boundariesSummed": [totals[k] for k in sorted(totals)],
    }
    with open(a.output, "x") as f:
        json.dump(doc, f, indent=2)
        f.write("\n")
    with gzip.open(a.output.replace(".json", ".pieces.jsonl.gz"), "xt") as f:
        for row in sorted(pieces, key=lambda r: r["boundaryId"]):
            f.write(json.dumps(row) + "\n")
    print(f"wrote {a.output} in {elapsed:.0f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
