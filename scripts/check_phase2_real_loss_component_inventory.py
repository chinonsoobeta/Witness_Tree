#!/usr/bin/env python3
"""Exact, streaming readback for the real 38-pair loss-component inventory."""

from __future__ import annotations

import argparse
from bisect import bisect_right
import hashlib
import json
import os
import stat
import time
from datetime import datetime, timezone
from pathlib import Path


PAIR_COUNT = 38
GRID = [193936, 128340]
LINEAGE_CAP = 2 * 1024**4
SOURCE_MAP_SHA256 = "c962180952e11af0766c5b929d97d4bb635181f93c04e93bbfa7d808e1561430"


def fail(message: str) -> None:
    raise ValueError(message)


def exact_int(value: object, label: str) -> int:
    if type(value) is not int:
        fail(f"{label} must be an exact integer")
    return value


def exact_keys(value: object, keys: set[str], label: str) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != keys:
        fail(f"{label} shape changed")
    return value


def canonical_json(record: dict[str, object]) -> bytes:
    return (json.dumps(record, separators=(",", ":"), sort_keys=True) + "\n").encode()


def file_identity(value: os.stat_result) -> tuple[int, int, int, int, int, int]:
    return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns, value.st_nlink)


def open_regular_file(path: Path) -> tuple[int, tuple[int, int, int, int, int, int]]:
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        result = os.fstat(descriptor)
        if not stat.S_ISREG(result.st_mode):
            fail(f"regular file required: {path.name}")
        identity = file_identity(result)
        if file_identity(os.stat(path, follow_symlinks=False)) != identity:
            fail(f"file path changed while opening: {path.name}")
        return descriptor, identity
    except Exception:
        os.close(descriptor)
        raise


def verify_identity(path: Path, descriptor: int, expected: tuple[int, int, int, int, int, int]) -> None:
    if file_identity(os.fstat(descriptor)) != expected or file_identity(os.stat(path, follow_symlinks=False)) != expected:
        fail(f"file identity changed during readback: {path.name}")


def sha256_regular_file(path: Path) -> tuple[int, str]:
    descriptor, identity = open_regular_file(path)
    try:
        digest = hashlib.sha256()
        byte_length = 0
        offset = 0
        while chunk := os.pread(descriptor, 8 * 1024 * 1024, offset):
            digest.update(chunk)
            byte_length += len(chunk)
            offset += len(chunk)
        verify_identity(path, descriptor, identity)
        if byte_length != identity[2]:
            fail(f"file length changed during readback: {path.name}")
        return byte_length, digest.hexdigest()
    finally:
        os.close(descriptor)


def read_regular_file(path: Path) -> tuple[bytes, str]:
    descriptor, identity = open_regular_file(path)
    try:
        chunks = []
        offset = 0
        digest = hashlib.sha256()
        while chunk := os.pread(descriptor, 1024 * 1024, offset):
            chunks.append(chunk)
            digest.update(chunk)
            offset += len(chunk)
        verify_identity(path, descriptor, identity)
        payload = b"".join(chunks)
        if len(payload) != identity[2]:
            fail(f"file length changed during readback: {path.name}")
        return payload, digest.hexdigest()
    finally:
        os.close(descriptor)


def load_source_map(repository_root: Path) -> list[tuple[int, int, str]]:
    path = repository_root / "data" / "phase2-real-loss-source-map.json"
    payload, digest = read_regular_file(path)
    if digest != SOURCE_MAP_SHA256:
        fail("canonical source map checksum changed")
    value = json.loads(payload)
    pairs = value.get("pairs") if isinstance(value, dict) else None
    expected_years = [[1984 + index, 1985 + index] for index in range(PAIR_COUNT)]
    if not isinstance(pairs, list) or len(pairs) != PAIR_COUNT:
        fail("canonical source map pair count changed")
    if [row[:2] for row in pairs] != expected_years:
        fail("canonical source map order changed")
    return [(exact_int(row[0], "from year"), exact_int(row[1], "to year"), row[2]) for row in pairs]


class ComponentGraphReplay:
    """Replay component lifecycle with memory bounded to active state and two rows."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.active: dict[int, list[int]] = {}
        self.last_row: int | None = None
        self.buffer_row: int | None = None
        self.row_runs: list[tuple[int, int, int]] = []
        self.previous_runs: list[tuple[int, int, int]] = []
        self.previous_starts: list[int] = []
        self.pending_aliases: list[tuple[int, int]] = []
        self.row_aliases: list[tuple[int, int, int]] = []
        self.run_digest = hashlib.sha256()
        self.run_cells = 0
        self.component_cells = 0
        self.run_count = 0
        self.alias_count = 0
        self.component_count = 0

    def _overlap_ids(self, x0: int, x1: int) -> set[int]:
        matches: set[int] = set()
        index = bisect_right(self.previous_starts, x1) - 1
        while index >= 0 and self.previous_runs[index][1] >= x0:
            matches.add(self.previous_runs[index][2])
            index -= 1
        return matches

    def _finish_run_row(self) -> None:
        if self.buffer_row is None:
            return
        previous_x1 = -1
        for x0, x1, _ in sorted(self.row_runs):
            if x0 <= previous_x1:
                fail(f"loss runs overlap or duplicate within a row: {self.path.name}")
            self.run_digest.update(f"{self.buffer_row}:{x0}:{x1}\n".encode())
            previous_x1 = x1
        adjacent = self.last_row is not None and self.buffer_row == self.last_row + 1
        if not adjacent:
            if self.active:
                fail(f"active component lifecycle skipped a raster row: {self.path.name}")
            prior_runs: list[tuple[int, int, int]] = []
            prior_starts: list[int] = []
        else:
            prior_runs = self.previous_runs
            prior_starts = self.previous_starts

        def overlap_ids(x0: int, x1: int) -> set[int]:
            self.previous_runs = prior_runs
            self.previous_starts = prior_starts
            return self._overlap_ids(x0, x1)

        parent = list(range(len(self.row_runs)))

        def find(index: int) -> int:
            while parent[index] != index:
                parent[index] = parent[parent[index]]
                index = parent[index]
            return index

        def union(left: int, right: int) -> None:
            left_root = find(left)
            right_root = find(right)
            if left_root != right_root:
                parent[right_root] = left_root

        overlaps: list[set[int]] = []
        prior_owner: dict[int, int] = {}
        for index, (x0, x1, _) in enumerate(self.row_runs):
            ids = overlap_ids(x0, x1) if adjacent else set()
            for component_id in ids:
                if component_id not in self.active:
                    fail(f"current run overlaps a prematurely finalized component: {self.path.name}")
                if component_id in prior_owner:
                    union(index, prior_owner[component_id])
                else:
                    prior_owner[component_id] = index
            overlaps.append(ids)

        groups: dict[int, list[int]] = {}
        for index in range(len(self.row_runs)):
            groups.setdefault(find(index), []).append(index)
        expected_by_group: dict[int, set[tuple[int, int]]] = {}
        next_active: dict[int, list[int]] = {}
        next_runs: list[tuple[int, int, int]] = []
        consumed_prior: set[int] = set()
        for indices in groups.values():
            group_root = find(indices[0])
            prior_ids = set().union(*(overlaps[index] for index in indices))
            if prior_ids:
                canonical = min(prior_ids)
                expected_by_group[group_root] = {(source, canonical) for source in prior_ids if source != canonical}
                first_cell = min(self.active[component_id][0] for component_id in prior_ids)
                cell_count = sum(self.active[component_id][1] for component_id in prior_ids)
                consumed_prior.update(prior_ids)
            else:
                if len(indices) != 1:
                    fail(f"disconnected new runs were grouped together: {self.path.name}")
                x0 = self.row_runs[indices[0]][0]
                canonical = self.buffer_row * GRID[0] + x0
                first_cell = canonical
                cell_count = 0
                expected_by_group[group_root] = set()
            if first_cell != canonical:
                fail(f"overlap group does not preserve its canonical first cell: {self.path.name}")
            for index in indices:
                x0, x1, emitted_component = self.row_runs[index]
                if emitted_component != canonical:
                    fail(f"run does not use its overlap group's canonical root: {self.path.name}")
                cell_count += x1 - x0 + 1
                next_runs.append((x0, x1, canonical))
            if canonical in next_active:
                fail(f"two disconnected groups use the same component root: {self.path.name}")
            next_active[canonical] = [first_cell, cell_count, self.buffer_row]
        observed_by_group: dict[int, list[tuple[int, int]]] = {root: [] for root in expected_by_group}
        for source, target, run_index in self.row_aliases:
            observed_by_group.setdefault(find(run_index), []).append((source, target))
        for root, expected in expected_by_group.items():
            observed = observed_by_group.get(root, [])
            if len(observed) != len(set(observed)) or set(observed) != expected:
                fail(f"component aliases do not exactly match row-boundary overlap groups: {self.path.name}")
        if set(self.active) != consumed_prior:
            fail(f"prior-row component lacks exact finalization or continuation: {self.path.name}")
        self.active = next_active
        self.previous_runs = sorted(next_runs)
        self.previous_starts = [run[0] for run in self.previous_runs]
        self.last_row = self.buffer_row
        self.buffer_row = None
        self.row_runs = []
        self.row_aliases = []

    def alias(self, source: int, target: int) -> None:
        edge = (source, target)
        if target >= source:
            fail(f"component alias does not descend between canonical roots: {self.path.name}")
        self.pending_aliases.append(edge)
        self.alias_count += 1

    def run(self, component_id: int, row: int, x0: int, x1: int) -> None:
        if self.buffer_row is not None and row != self.buffer_row:
            if row < self.buffer_row:
                fail(f"loss-run rows are not in raster order: {self.path.name}")
            self._finish_run_row()
        if self.buffer_row is None:
            if self.last_row is not None and row <= self.last_row:
                fail(f"loss-run rows are not in raster order: {self.path.name}")
            self.buffer_row = row
        run_index = len(self.row_runs)
        self.row_aliases.extend((source, target, run_index) for source, target in self.pending_aliases)
        self.pending_aliases = []
        self.row_runs.append((x0, x1, component_id))
        self.run_cells += x1 - x0 + 1
        self.run_count += 1

    def component(self, component_id: int, first_cell: int, cell_count: int) -> None:
        self._finish_run_row()
        if self.pending_aliases:
            fail(f"component summary interrupts a row-boundary alias set: {self.path.name}")
        state = self.active.get(component_id)
        if state is None:
            fail(f"component summary has a dangling, duplicate or finalized ID: {self.path.name}")
        if state[0] != first_cell or state[1] != cell_count or component_id != first_cell:
            fail(f"component summary differs from its resolved ordered runs: {self.path.name}")
        del self.active[component_id]
        self.component_cells += cell_count
        self.component_count += 1

    def finish(self) -> None:
        self._finish_run_row()
        if self.pending_aliases:
            fail(f"lineage ends with aliases that have no current-row runs: {self.path.name}")
        if self.active:
            fail(f"lineage ends with unfinalized component IDs: {self.path.name}")


def readback_lineage(
    path: Path,
    from_year: int,
    to_year: int,
    source_sha256: str,
    inventory: dict[str, object],
) -> dict[str, object]:
    digest = hashlib.sha256()
    bytes_read = 0
    record_count = 0
    grid_cells = GRID[0] * GRID[1]
    replay = ComponentGraphReplay(path)
    footer: dict[str, object] | None = None
    descriptor, identity = open_regular_file(path)
    try:
        with os.fdopen(os.dup(descriptor), "rb") as stream:
            for line in stream:
                bytes_read += len(line)
                digest.update(line)
                if not line.endswith(b"\n"):
                    fail(f"unterminated lineage record: {path.name}")
                try:
                    record = json.loads(line)
                except (UnicodeDecodeError, json.JSONDecodeError) as error:
                    raise ValueError(f"invalid lineage JSON: {path.name}") from error
                if not isinstance(record, dict) or canonical_json(record) != line:
                    fail(f"non-canonical lineage JSON: {path.name}")
                record_count += 1
                kind = record.get("record")
                if record_count == 1:
                    header = exact_keys(
                        record,
                        {"connectivity", "encoding", "grid", "pair", "productionEligible", "record", "released", "schemaVersion", "sourceLossSha256"},
                        "lineage header",
                    )
                    expected_header = {
                        "connectivity": 4,
                        "encoding": "inclusive-x-runs",
                        "grid": GRID,
                        "pair": [from_year, to_year],
                        "productionEligible": False,
                        "record": "header",
                        "released": False,
                        "schemaVersion": "witness-tree/phase2-real-loss-component-lineage/1",
                        "sourceLossSha256": source_sha256,
                    }
                    if header != expected_header:
                        fail(f"lineage header mismatch: {path.name}")
                    continue
                if footer is not None:
                    fail(f"record appears after lineage footer: {path.name}")
                if kind == "run":
                    exact_keys(record, {"componentId", "record", "row", "x0", "x1"}, "run record")
                    component_id = exact_int(record["componentId"], "run component ID")
                    row = exact_int(record["row"], "run row")
                    x0 = exact_int(record["x0"], "run x0")
                    x1 = exact_int(record["x1"], "run x1")
                    if not (0 <= row < GRID[1] and 0 <= x0 <= x1 < GRID[0] and 0 <= component_id < grid_cells):
                        fail(f"run is outside the canonical grid: {path.name}")
                    replay.run(component_id, row, x0, x1)
                elif kind == "alias":
                    exact_keys(record, {"fromComponentId", "record", "toComponentId"}, "alias record")
                    source = exact_int(record["fromComponentId"], "alias source")
                    target = exact_int(record["toComponentId"], "alias target")
                    if not (0 <= target < source < grid_cells):
                        fail(f"component alias is not strictly descending: {path.name}")
                    replay.alias(source, target)
                elif kind == "component":
                    exact_keys(record, {"cellCount", "componentId", "firstCell", "record"}, "component record")
                    component_id = exact_int(record["componentId"], "component ID")
                    first_cell = exact_int(record["firstCell"], "component first cell")
                    cell_count = exact_int(record["cellCount"], "component cell count")
                    if not (0 <= component_id == first_cell < grid_cells and cell_count > 0):
                        fail(f"component summary value changed: {path.name}")
                    replay.component(component_id, first_cell, cell_count)
                elif kind == "footer":
                    footer = exact_keys(
                        record,
                        {"connectedComponentCount", "lossCellCount", "orderedLossRunSha256", "productionEligible", "record", "released"},
                        "lineage footer",
                    )
                else:
                    fail(f"unknown lineage record: {path.name}")
        verify_identity(path, descriptor, identity)
    finally:
        os.close(descriptor)
    replay.finish()
    if record_count < 2 or footer is None:
        fail(f"lineage footer is absent: {path.name}")
    expected_loss = exact_int(inventory["lossCellCount"], "inventory loss count")
    expected_components = exact_int(inventory["connectedComponentCount"], "inventory component count")
    expected_run_sha = inventory["orderedLossRunSha256"]
    if footer != {
        "connectedComponentCount": expected_components,
        "lossCellCount": expected_loss,
        "orderedLossRunSha256": expected_run_sha,
        "productionEligible": False,
        "record": "footer",
        "released": False,
    }:
        fail(f"lineage footer does not match inventory: {path.name}")
    if replay.run_cells != expected_loss or replay.component_cells != expected_loss:
        fail(f"lineage cell totals do not match inventory: {path.name}")
    if replay.component_count != expected_components or replay.run_digest.hexdigest() != expected_run_sha:
        fail(f"lineage component count or ordered-run digest differs: {path.name}")
    return {
        "recordCount": record_count,
        "runRecordCount": replay.run_count,
        "aliasRecordCount": replay.alias_count,
        "componentRecordCount": replay.component_count,
        "byteLength": bytes_read,
        "sha256": digest.hexdigest(),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository-root", type=Path, required=True)
    parser.add_argument("--input-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    started = time.monotonic()
    for label, path in (("input root", args.input_root), ("output root", args.output_root)):
        if path.is_symlink() or not path.is_dir():
            fail(f"{label} must be an existing non-symlink directory")
    components_root = args.output_root / "components"
    if components_root.is_symlink() or not components_root.is_dir():
        fail("component root must be an existing non-symlink directory")
    if args.evidence.parent.is_symlink() or not args.evidence.parent.is_dir():
        fail("evidence parent must be an existing non-symlink directory")
    inventory_path = args.output_root / "inventory.json"
    inventory_payload, inventory_sha256 = read_regular_file(inventory_path)
    inventory_bytes = len(inventory_payload)
    inventory_stat = os.stat(inventory_path, follow_symlinks=False)
    run_started = inventory_stat.st_birthtime
    run_completed = inventory_stat.st_mtime
    run_elapsed = run_completed - run_started
    if not 0 < run_elapsed <= 345600:
        fail("filesystem-observed execution interval is outside the approved 96-hour cap")
    batch = json.loads(inventory_payload)
    if not isinstance(batch, dict) or canonical_json(batch) != inventory_payload:
        fail("batch inventory JSON is not exact canonical JSONL")
    expected_batch_keys = {
        "aggregateMaxSeconds", "blockRows", "canonicalPairCount", "completedPairCount", "componentLineage",
        "pairs", "productionEligible", "released", "schemaVersion", "scratchBytes", "status",
    }
    exact_keys(batch, expected_batch_keys, "batch inventory")
    if any(args.output_root.glob("*.partial")) or any(components_root.glob("*.partial")):
        fail("partial output remains after the completed run")
    source_pairs = load_source_map(args.repository_root)
    expected_names = {f"detected-forest-loss-{a}-{b}.components.jsonl" for a, b, _ in source_pairs}
    observed_names = {path.name for path in components_root.iterdir()}
    if observed_names != expected_names:
        fail("component output set is not the exact canonical 38 files")
    if batch["schemaVersion"] != "witness-tree/phase2-real-loss-component-inventory-batch/1" or batch["status"] != "completed":
        fail("batch inventory does not report exact completion")
    if batch["canonicalPairCount"] != PAIR_COUNT or batch["completedPairCount"] != PAIR_COUNT or len(batch["pairs"]) != PAIR_COUNT:
        fail("batch inventory pair count changed")
    if batch["blockRows"] != 64 or batch["aggregateMaxSeconds"] != 345600 or batch["scratchBytes"] != 0:
        fail("batch execution bounds changed")
    if batch["released"] is not False or batch["productionEligible"] is not False:
        fail("batch must remain unreleased and non-production")
    lineage_batch = exact_keys(batch["componentLineage"], {"directoryName", "maxBytes", "usedBytes"}, "batch lineage")
    if lineage_batch["directoryName"] != "components" or lineage_batch["maxBytes"] != LINEAGE_CAP:
        fail("batch lineage cap or directory changed")
    evidence_pairs = []
    lineage_bytes = 0
    grid_cells = GRID[0] * GRID[1]
    pair_keys = {
        "algorithmicBounds", "blockRows", "componentLineage", "connectivity", "grid", "inventory", "pair",
        "productionEligible", "released", "schemaVersion", "sourceLossSha256",
    }
    inventory_keys = {
        "connectedComponentCount", "lossCellCount", "maxActiveComponents", "maxRunsInOneRow", "nodataCellCount",
        "orderedLossRunSha256", "validNonLossCellCount",
    }
    for index, (from_year, to_year, source_sha256) in enumerate(source_pairs):
        pair = exact_keys(batch["pairs"][index], pair_keys, "pair inventory")
        if pair["pair"] != [from_year, to_year] or pair["sourceLossSha256"] != source_sha256:
            fail("pair order or source checksum changed")
        if pair["schemaVersion"] != "witness-tree/phase2-real-loss-component-inventory/1" or pair["grid"] != GRID or pair["connectivity"] != 4 or pair["blockRows"] != 64:
            fail("pair inventory method identity changed")
        if pair["released"] is not False or pair["productionEligible"] is not False:
            fail("pair inventory must remain unreleased and non-production")
        if pair["algorithmicBounds"] != {"componentStateScope": "previous-and-current-row-only", "gdalCacheBytes": 67108864, "rowsHeld": 64, "scratchBytes": 0}:
            fail("pair algorithmic bounds changed")
        inventory = exact_keys(pair["inventory"], inventory_keys, "pair metrics")
        loss_cells = exact_int(inventory["lossCellCount"], "loss cell count")
        valid_cells = exact_int(inventory["validNonLossCellCount"], "valid non-loss count")
        nodata_cells = exact_int(inventory["nodataCellCount"], "nodata count")
        if loss_cells + valid_cells + nodata_cells != grid_cells:
            fail("pair cell census does not equal the canonical grid")
        source_name = f"detected-forest-loss-{from_year}-{to_year}.tif"
        source_bytes, observed_source_sha = sha256_regular_file(args.input_root / source_name)
        if observed_source_sha != source_sha256:
            fail(f"source checksum differs during readback: {source_name}")
        lineage_name = f"detected-forest-loss-{from_year}-{to_year}.components.jsonl"
        lineage = exact_keys(pair["componentLineage"], {"byteLength", "fileName", "sha256"}, "pair lineage")
        if lineage["fileName"] != lineage_name:
            fail("pair lineage filename changed")
        replay = readback_lineage(components_root / lineage_name, from_year, to_year, source_sha256, inventory)
        if replay["byteLength"] != lineage["byteLength"] or replay["sha256"] != lineage["sha256"]:
            fail(f"lineage bytes or checksum differ: {lineage_name}")
        lineage_bytes += exact_int(lineage["byteLength"], "lineage byte length")
        evidence_pairs.append({
            "pair": [from_year, to_year],
            "sourceLoss": {"fileName": source_name, "byteLength": source_bytes, "sha256": source_sha256},
            "lineage": {"fileName": lineage_name, **replay},
            "inventory": inventory,
        })
    if lineage_bytes != lineage_batch["usedBytes"] or lineage_bytes > LINEAGE_CAP:
        fail("aggregate lineage bytes differ or exceed the approved cap")
    evidence = {
        "schemaVersion": "witness-tree/phase2-real-loss-component-inventory-readback/1",
        "status": "exact-readback-passed",
        "sourceBatchId": "phase2-real-national-1984-2022-v1",
        "inventory": {"fileName": "inventory.json", "byteLength": inventory_bytes, "sha256": inventory_sha256},
        "canonicalPairCount": PAIR_COUNT,
        "completedPairCount": PAIR_COUNT,
        "componentLineageBytes": lineage_bytes,
        "retainedOutputBytes": lineage_bytes + inventory_bytes,
        "approvedComponentLineageCapBytes": LINEAGE_CAP,
        "scratchBytes": 0,
        "executionObservation": {
            "basis": "final inventory inode birth time through final modification time; includes shell redirection, all-pair preflight, processing, and final inventory write",
            "startedAtUtc": datetime.fromtimestamp(run_started, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "completedAtUtc": datetime.fromtimestamp(run_completed, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "elapsedSeconds": f"{run_elapsed:.6f}",
            "approvedMaxSeconds": 345600,
        },
        "pairs": evidence_pairs,
        "readbackAtUtc": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "readbackElapsedSeconds": f"{time.monotonic() - started:.6f}",
        "released": False,
        "productionEligible": False,
    }
    if args.evidence.exists() or args.evidence.is_symlink():
        fail("evidence target already exists")
    payload = (json.dumps(evidence, indent=2, sort_keys=True) + "\n").encode()
    partial = args.evidence.with_name(f"{args.evidence.name}.partial")
    if partial.exists() or partial.is_symlink():
        fail("evidence partial target already exists")
    with partial.open("xb") as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())
    os.link(partial, args.evidence, follow_symlinks=False)
    directory_descriptor = os.open(args.evidence.parent, os.O_RDONLY)
    try:
        os.fsync(directory_descriptor)
    finally:
        os.close(directory_descriptor)
    os.unlink(partial)
    directory_descriptor = os.open(args.evidence.parent, os.O_RDONLY)
    try:
        os.fsync(directory_descriptor)
    finally:
        os.close(directory_descriptor)
    print(f"Exact Phase 2 component-inventory readback passed for {PAIR_COUNT} pairs; productionEligible=false.")


if __name__ == "__main__":
    main()
