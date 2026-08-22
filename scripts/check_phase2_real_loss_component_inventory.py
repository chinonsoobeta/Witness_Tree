#!/usr/bin/env python3
"""Exact, streaming readback for the real 38-pair loss-component inventory."""

from __future__ import annotations

import argparse
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


def readback_lineage(
    path: Path,
    from_year: int,
    to_year: int,
    source_sha256: str,
    inventory: dict[str, object],
) -> dict[str, object]:
    digest = hashlib.sha256()
    run_digest = hashlib.sha256()
    bytes_read = 0
    record_count = 0
    run_count = 0
    alias_count = 0
    component_count = 0
    run_cells = 0
    component_cells = 0
    grid_cells = GRID[0] * GRID[1]
    current_run_row: int | None = None
    current_row_runs: list[tuple[int, int]] = []
    footer: dict[str, object] | None = None

    def finish_run_row() -> None:
        previous_x1 = -1
        for x0, x1 in sorted(current_row_runs):
            if x0 <= previous_x1:
                fail(f"loss runs overlap or duplicate within a row: {path.name}")
            run_digest.update(f"{current_run_row}:{x0}:{x1}\n".encode())
            previous_x1 = x1
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
                    if current_run_row is None:
                        current_run_row = row
                    elif row != current_run_row:
                        if row < current_run_row:
                            fail(f"loss-run rows are not in raster order: {path.name}")
                        finish_run_row()
                        current_run_row = row
                        current_row_runs = []
                    current_row_runs.append((x0, x1))
                    run_cells += x1 - x0 + 1
                    run_count += 1
                elif kind == "alias":
                    exact_keys(record, {"fromComponentId", "record", "toComponentId"}, "alias record")
                    source = exact_int(record["fromComponentId"], "alias source")
                    target = exact_int(record["toComponentId"], "alias target")
                    if not (0 <= target < source < grid_cells):
                        fail(f"component alias is not strictly descending: {path.name}")
                    alias_count += 1
                elif kind == "component":
                    exact_keys(record, {"cellCount", "componentId", "firstCell", "record"}, "component record")
                    component_id = exact_int(record["componentId"], "component ID")
                    first_cell = exact_int(record["firstCell"], "component first cell")
                    cell_count = exact_int(record["cellCount"], "component cell count")
                    if not (0 <= component_id == first_cell < grid_cells and cell_count > 0):
                        fail(f"component summary value changed: {path.name}")
                    component_cells += cell_count
                    component_count += 1
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
    if current_run_row is not None:
        finish_run_row()
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
    if run_cells != expected_loss or component_cells != expected_loss:
        fail(f"lineage cell totals do not match inventory: {path.name}")
    if component_count != expected_components or run_digest.hexdigest() != expected_run_sha:
        fail(f"lineage component count or ordered-run digest differs: {path.name}")
    return {
        "recordCount": record_count,
        "runRecordCount": run_count,
        "aliasRecordCount": alias_count,
        "componentRecordCount": component_count,
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
