#!/usr/bin/env python3
"""The four in-scope provinces as run-length cell masks on the national grid.

The per-cell patch archives were built nationally, so patches draw in
Saskatchewan, New Brunswick and the territories. Clipping them needs to know,
for every cell, which of BC, AB, ON and QC it belongs to, by exactly the rule
the province figures use, so the map and the numbers agree cell for cell.

How the rule is kept identical:
- Boundaries are read by the interval worker's own read_boundaries (same
  source file, same repair tolerance, same reprojection).
- Each province is cut into pixel-aligned pieces by the block partition
  driver's own cut(), and each piece is rasterized by the worker's own
  create_feature_mask (GDAL's default rule: a cell belongs to a polygon when
  its centre is inside). Cuts run along pixel edges, half a cell from every
  centre, so every cell lands in exactly one piece.

Output is one binary file of 16-byte little-endian records
(row, x0, x1 inclusive, province index) sorted by row then x0, plus a JSON
sidecar. Provinces are checked not to overlap, and each province's cell total
must equal the `cells` figure of the admitted span aggregate exactly.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import sys
import time
from datetime import datetime, timezone
from multiprocessing import get_context
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import phase3_interval_zonal_aggregate as W  # noqa: E402  (unchanged worker, read-only import)
from osgeo import gdal, ogr  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "block_partition", HERE / "phase3-province-interval-spans-block-partition.py"
)
P = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(P)

PROVINCES = (("59", "BC"), ("48", "AB"), ("35", "ON"), ("24", "QC"))
RECORD = np.dtype([("row", "<u4"), ("x0", "<u4"), ("x1", "<u4"), ("province", "<u4")])


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(8 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def piece_runs(payload):
    """Rasterizes one piece and returns its runs in grid coordinates."""
    reference_path, province_index, wkb = payload
    gdal.UseExceptions()
    ogr.UseExceptions()
    reference = gdal.Open(reference_path, gdal.GA_ReadOnly)
    geometry = ogr.CreateGeometryFromWkb(wkb)
    xoff, yoff, width, height = W.pixel_window(reference, geometry.GetEnvelope())
    if width <= 0 or height <= 0:
        return province_index, np.zeros(0, dtype=RECORD), 0
    mask_path, dataset, _ = W.create_feature_mask(
        geometry, reference.GetProjection(), reference.GetGeoTransform(), xoff, yoff, width, height
    )
    try:
        mask = dataset.GetRasterBand(1).ReadAsArray().astype(bool)
    finally:
        dataset = None
        os.unlink(mask_path)
    cells = int(np.count_nonzero(mask))
    padded = np.zeros((height, width + 2), dtype=np.int8)
    padded[:, 1:-1] = mask
    edges = np.diff(padded, axis=1)
    start_rows, start_cols = np.nonzero(edges == 1)
    end_rows, end_cols = np.nonzero(edges == -1)
    if not np.array_equal(start_rows, end_rows):
        raise RuntimeError("run starts and ends disagree on rows")
    out = np.empty(start_rows.size, dtype=RECORD)
    out["row"] = start_rows + yoff
    out["x0"] = start_cols + xoff
    out["x1"] = end_cols - 1 + xoff
    out["province"] = province_index
    return province_index, out, cells


def merge(runs: np.ndarray) -> np.ndarray:
    """Joins runs that touch across a piece edge on the same row and province."""
    order = np.lexsort((runs["x0"], runs["row"]))
    runs = runs[order]
    if runs.size == 0:
        return runs
    joined = np.empty_like(runs)
    count = 0
    current = runs[0].copy()
    for record in runs[1:]:
        if (
            record["row"] == current["row"]
            and record["province"] == current["province"]
            and record["x0"] == current["x1"] + 1
        ):
            current["x1"] = record["x1"]
        else:
            joined[count] = current
            count += 1
            current = record.copy()
    joined[count] = current
    return joined[: count + 1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--boundaries", required=True)
    parser.add_argument("--spans", required=True, help="the admitted span aggregate, for the cell anchor")
    parser.add_argument("--output", required=True)
    parser.add_argument("--block", type=int, default=4096)
    parser.add_argument("--workers", type=int, default=os.cpu_count())
    args = parser.parse_args()
    sidecar = args.output + ".json"
    if os.path.exists(args.output) or os.path.exists(sidecar):
        W.fail(f"Refusing to overwrite {args.output}")

    started_at = datetime.now(timezone.utc)
    started = time.monotonic()
    forest_paths, _ = W.resolve_series(f"{P.RASTERS}/masks", f"{P.RASTERS}/loss")
    gdal.UseExceptions()
    reference = gdal.Open(forest_paths[0], gdal.GA_ReadOnly)
    namespace = argparse.Namespace(boundaries=args.boundaries, boundary_id_field="PRUID", boundary_name_field="")
    wanted = {pruid: index for index, (pruid, _) in enumerate(PROVINCES)}
    features = [f for f in W.read_boundaries(namespace, reference.GetProjection()) if f[0] in wanted]
    if sorted(f[0] for f in features) != sorted(wanted):
        W.fail("the boundary file does not hold all four provinces")

    payloads = []
    for pruid, name, wkb in features:
        for _, _, piece_wkb, area in P.cut(pruid, name, wkb, reference, args.block):
            payloads.append((area, (forest_paths[0], wanted[pruid], piece_wkb)))
    payloads.sort(key=lambda item: -item[0])
    print(f"{len(payloads)} pieces, {args.workers} workers", file=sys.stderr, flush=True)

    collected = {index: [] for index in range(len(PROVINCES))}
    cells = [0] * len(PROVINCES)
    with get_context("spawn").Pool(processes=args.workers) as pool:
        for done, (index, runs, count) in enumerate(
            pool.imap_unordered(piece_runs, [p[1] for p in payloads], chunksize=1), 1
        ):
            collected[index].append(runs)
            cells[index] += count
            if done % 50 == 0 or done == len(payloads):
                print(f"{done}/{len(payloads)} pieces, {time.monotonic() - started:.0f}s", file=sys.stderr, flush=True)

    merged = merge(np.concatenate([np.concatenate(parts) for parts in collected.values()]))

    # Provinces must not overlap: within a row, each run starts after the last ends.
    same_row = merged["row"][1:] == merged["row"][:-1]
    if np.any(same_row & (merged["x0"][1:] <= merged["x1"][:-1])):
        W.fail("two provinces claim the same cell")

    spans = json.load(open(args.spans))
    anchor = {entry["boundaryId"]: entry["cells"] for entry in spans["boundariesSummed"]}
    provinces = []
    for index, (pruid, code) in enumerate(PROVINCES):
        mine = merged[merged["province"] == index]
        from_runs = int(np.sum(mine["x1"].astype(np.int64) - mine["x0"] + 1))
        if from_runs != cells[index]:
            W.fail(f"{code} runs hold {from_runs} cells but the masks held {cells[index]}")
        if cells[index] != anchor[pruid]:
            W.fail(f"{code} mask holds {cells[index]} cells, the span aggregate {anchor[pruid]}")
        provinces.append({"index": index, "pruid": pruid, "code": code, "cells": cells[index],
                          "runs": int(mine.size), "matchesSpanAggregateCells": True})

    merged.tofile(args.output)
    record = {
        "schemaVersion": "witness-tree/phase2-four-province-cell-runs/1",
        "purpose": "Which cells of the national grid belong to BC, AB, ON and QC, by the province figures' own rule.",
        "recordLayout": "16-byte little-endian records: row, x0, x1 (inclusive), province index; sorted by row then x0",
        "boundaries": args.boundaries,
        "boundariesSha256": P.file_sha(args.boundaries),
        "referenceGrid": forest_paths[0],
        "rule": "GDAL default rasterization (cell centre inside the polygon), via the interval worker's create_feature_mask, on pixel-aligned pieces",
        "block": args.block,
        "pieces": len(payloads),
        "workerSha256": P.file_sha(str(HERE / "phase3_interval_zonal_aggregate.py")),
        "anchor": {"path": args.spans, "sha256": sha256_file(args.spans), "field": "boundariesSummed[].cells"},
        "provinces": provinces,
        "runCount": int(merged.size),
        "output": {"path": args.output, "byteLength": os.path.getsize(args.output), "sha256": sha256_file(args.output)},
        "startedAt": started_at.isoformat().replace("+00:00", "Z"),
        "elapsedSeconds": round(time.monotonic() - started, 1),
        "workers": args.workers,
    }
    with open(sidecar, "x") as handle:
        json.dump(record, handle, indent=2)
        handle.write("\n")
    print(json.dumps(provinces), file=sys.stderr)


if __name__ == "__main__":
    main()
