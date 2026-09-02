#!/usr/bin/env python3
"""Prove the pair identity against an independent national histogram.

The coarse grid answers a drawn shape with

    union[a,b] = sum[a,b] - overcount[a,b]

where overcount counts a cell once for every consecutive pair of its own loss
years lying entirely inside the window.  The blocks store the two right-hand
terms as aggregates; they do not store trajectories, so a block cannot check
itself.

The national trajectory histogram is computed on the same pass but by a
different route: it keeps the per-cell loss bitmask and never aggregates it
into a block.  Reconstructing the nation from the blocks and comparing it
against that histogram for all 741 windows therefore tests the identity rather
than restating it.  A window is contiguous, so a cell's in-window loss years
are a contiguous run of its own; k losses give k-1 interior pairs and
k - (k-1) = 1.  That is the argument this script checks against real data.

Exit 0 only when every window agrees on both union and sum.
"""

from __future__ import annotations

import argparse
import json
import multiprocessing
import os
import sys
from pathlib import Path

import numpy as np

FIRST_YEAR = 1984
LAST_YEAR = 2022
STEPS = LAST_YEAR - FIRST_YEAR  # 38 annual steps, 1984-85 through 2021-22


def fail(message: str) -> None:
    print(f"pair identity: {message}", file=sys.stderr)
    raise SystemExit(1)


def popcount(values: np.ndarray) -> np.ndarray:
    """Population count, whichever numpy this machine has."""

    if hasattr(np, "bitwise_count"):
        return np.bitwise_count(values).astype(np.int64)
    counted = np.zeros(values.shape, dtype=np.int64)
    working = values.copy()
    while np.any(working):
        counted += (working & np.uint64(1)).astype(np.int64)
        working >>= np.uint64(1)
    return counted


def _scan_range(task: tuple[str, int, int]) -> tuple:
    """Accumulate one byte range of the blocks file.

    A range starts at a byte offset, so it discards the line it lands inside
    and finishes the line that straddles its end.  The previous range owns the
    first and this one owns the last, so every line is read exactly once by
    exactly one worker whatever the split.
    """

    path, start, end = task
    annual = np.zeros(STEPS, dtype=np.int64)
    pairs = np.zeros((STEPS, STEPS), dtype=np.int64)
    blocks = 0
    countable = 0
    mapped = 0
    with open(path, "rb") as stream:
        if start:
            stream.seek(start - 1)
            if stream.read(1) != b"\n":
                stream.readline()
        while stream.tell() < end:
            line = stream.readline()
            if not line:
                break
            record = json.loads(line)
            blocks += 1
            countable += record["countableCells"]
            mapped += record["mappedCells"]
            losses = record["annualLossCells"]
            if len(losses) != STEPS:
                raise ValueError(
                    f"block {record.get('gx')},{record.get('gy')} has {len(losses)} annual steps"
                )
            annual += np.asarray(losses, dtype=np.int64)
            for first, second, count in record["pairs"]:
                if not 0 <= first < second < STEPS:
                    raise ValueError(
                        f"block {record.get('gx')},{record.get('gy')} has a pair outside the record"
                    )
                pairs[first][second] += count
    return annual, pairs, blocks, countable, mapped


def read_blocks(path: Path, workers: int = 1) -> dict[str, object]:
    """Stream the blocks and accumulate only what the identity needs.

    Every accumulator is a sum over independent lines, so the file is split by
    byte range across workers.  The merged totals do not depend on the number
    of workers; the parallel-agreement test pins that.
    """

    size = path.stat().st_size
    workers = max(1, min(workers, os.cpu_count() or 1))
    # A range smaller than a few megabytes costs more in process startup than
    # it saves, so a small file is read by one worker.
    if size < 8 * 1024 * 1024:
        workers = 1
    span = size // workers
    tasks = [
        (str(path), index * span, size if index == workers - 1 else (index + 1) * span)
        for index in range(workers)
    ]

    annual = np.zeros(STEPS, dtype=np.int64)
    pairs = np.zeros((STEPS, STEPS), dtype=np.int64)
    blocks = 0
    countable = 0
    mapped = 0

    if workers == 1:
        results = [_scan_range(task) for task in tasks]
    else:
        with multiprocessing.Pool(workers) as pool:
            results = pool.map(_scan_range, tasks)

    for part_annual, part_pairs, part_blocks, part_countable, part_mapped in results:
        annual += part_annual
        pairs += part_pairs
        blocks += part_blocks
        countable += part_countable
        mapped += part_mapped
    return {"annual": annual, "pairs": pairs, "blocks": blocks, "countable": countable, "mapped": mapped}


def windows() -> list[tuple[int, int]]:
    return [(a, b) for a in range(STEPS) for b in range(a, STEPS)]


def main(args: argparse.Namespace) -> None:
    sidecar = json.loads(Path(args.sidecar).read_text(encoding="utf-8"))
    trajectories = sidecar.get("nationalTrajectories")
    if not isinstance(trajectories, list) or not trajectories:
        fail("the sidecar carries no national trajectory histogram")

    masks = np.asarray([entry[0] for entry in trajectories], dtype=np.uint64)
    counts = np.asarray([entry[1] for entry in trajectories], dtype=np.int64)
    if np.any(counts <= 0):
        fail("the histogram carries a non-positive count")
    if np.any(masks == 0):
        fail("the histogram carries a zero trajectory, which is not a loss")

    grid = read_blocks(Path(args.blocks), args.workers)
    print(
        f"read {grid['blocks']} blocks, {grid['countable']} countable cells, "
        f"{len(masks)} distinct trajectories over {int(counts.sum())} cells",
        flush=True,
    )

    # The two totals the sidecar states about itself, checked against the file
    # that actually shipped rather than against the run that wrote it.
    for label, observed, recorded in (
        ("blocksWritten", grid["blocks"], sidecar.get("blocksWritten")),
        ("countableCells", grid["countable"], sidecar.get("countableCells")),
        ("mappedCells", grid["mapped"], sidecar.get("mappedCells")),
        ("annualLossCellYears", int(grid["annual"].sum()), sidecar.get("annualLossCellYears")),
    ):
        if observed != recorded:
            fail(f"{label} is {recorded} in the sidecar and {observed} in the blocks")

    # Every loss-year in the histogram must also appear in the block totals.
    per_step = np.zeros(STEPS, dtype=np.int64)
    for step in range(STEPS):
        per_step[step] = int(counts[(masks & np.uint64(1 << step)) != 0].sum())
    if not np.array_equal(per_step, grid["annual"]):
        first = int(np.argmax(per_step != grid["annual"]))
        fail(
            f"step {FIRST_YEAR + first}-{FIRST_YEAR + first + 1} counts "
            f"{int(grid['annual'][first])} in the blocks and {int(per_step[first])} in the histogram"
        )

    annual = grid["annual"]
    pairs = grid["pairs"]
    mismatches: list[str] = []
    checked = 0
    for opening, closing in windows():
        checked += 1
        window_mask = np.uint64(0)
        for step in range(opening, closing + 1):
            window_mask |= np.uint64(1 << step)

        inside = (masks & window_mask) != np.uint64(0)
        union_expected = int(counts[inside].sum())
        sum_expected = int((popcount(masks & window_mask) * counts).sum())

        sum_actual = int(annual[opening : closing + 1].sum())
        overcount = int(pairs[opening : closing + 1, opening : closing + 1].sum())
        union_actual = sum_actual - overcount

        if sum_actual != sum_expected:
            mismatches.append(
                f"{FIRST_YEAR + opening}-{FIRST_YEAR + closing + 1}: sum {sum_actual} vs {sum_expected}"
            )
        if union_actual != union_expected:
            mismatches.append(
                f"{FIRST_YEAR + opening}-{FIRST_YEAR + closing + 1}: union {union_actual} vs {union_expected}"
            )
        if union_actual > sum_actual:
            mismatches.append(f"{FIRST_YEAR + opening}-{FIRST_YEAR + closing + 1}: union exceeds sum")

    if checked != 741:
        fail(f"checked {checked} windows rather than 741")

    report = {
        "schemaVersion": "witness-tree/phase6-pair-identity/1",
        "blocks": str(Path(args.blocks)),
        "sidecar": str(Path(args.sidecar)),
        "methodVersion": sidecar.get("methodVersion"),
        "windowsChecked": checked,
        "mismatches": mismatches,
        "blocksRead": grid["blocks"],
        "countableCells": grid["countable"],
        "distinctTrajectories": len(masks),
        "cellsWithAnyLoss": int(counts.sum()),
        "identityHolds": not mismatches,
    }
    if args.report:
        Path(args.report).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    if mismatches:
        for line in mismatches[:20]:
            print(f"  {line}", file=sys.stderr)
        fail(f"{len(mismatches)} mismatches across {checked} windows")
    print(f"pair identity holds for all {checked} windows")


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--blocks", required=True)
    p.add_argument("--sidecar", required=True)
    p.add_argument("--report")
    p.add_argument("--workers", type=int, default=os.cpu_count() or 1)
    return p


if __name__ == "__main__":
    main(parser().parse_args())
