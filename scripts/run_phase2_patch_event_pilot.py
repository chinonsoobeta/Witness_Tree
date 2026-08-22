#!/usr/bin/env python3
"""Fail-closed runner for the authorized 1984-1985 patch/event pilot."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import stat
import struct
import time
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Callable, Iterator

import numpy as np

PAIR = (1984, 1985)
GRID_WIDTH = 193936
LOSS_SHA256 = "e165954229c8803679a795145ad600220af50334cc6be5e56859697b3afd7210"
LINEAGE_SHA256 = "ed0b7fa96d1e895b0671036148a10d2ac55adf4a9204740ed974627e2fc28800"
METHOD_SHA256 = "8d12ff6b6fb10208410bedf5f012e96a9682fdec457cccce688509d2dfa0b8fa"
RUN = struct.Struct("<QIII")
COMPONENT = struct.Struct("<QQQI")
MAGIC = b"WTP2PE01"
MAX_COMPONENTS = 10_000
MAX_OUTPUT_BYTES = 64 * 1024**2
MAX_SCRATCH_BYTES = 2 * 1024**3
MAX_SECONDS = 1800
MAX_VCPU = 8
MAX_MEMORY_BYTES = 16 * 1024**3
SORT_CHUNK_BYTES = 1024**3
MAX_WHOLE_RUN_COPIES = 2


@dataclass(frozen=True)
class PilotLimits:
    components: int = MAX_COMPONENTS
    output_bytes: int = MAX_OUTPUT_BYTES
    scratch_bytes: int = MAX_SCRATCH_BYTES
    seconds: int = MAX_SECONDS
    vcpu: int = MAX_VCPU
    memory_bytes: int = MAX_MEMORY_BYTES
    sort_chunk_bytes: int = SORT_CHUNK_BYTES
    whole_run_copies: int = MAX_WHOLE_RUN_COPIES


EXACT_LIMITS = PilotLimits()


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, separators=(",", ":"), sort_keys=True) + "\n").encode()


def validate_limits(limits: PilotLimits) -> None:
    values = (
        limits.components,
        limits.output_bytes,
        limits.scratch_bytes,
        limits.seconds,
        limits.vcpu,
        limits.memory_bytes,
        limits.sort_chunk_bytes,
        limits.whole_run_copies,
    )
    if any(type(value) is not int or value < 1 for value in values):
        raise ValueError("Pilot limits must be exact positive integers.")
    if (
        limits.components > MAX_COMPONENTS
        or limits.output_bytes > MAX_OUTPUT_BYTES
        or limits.scratch_bytes > MAX_SCRATCH_BYTES
        or limits.seconds > MAX_SECONDS
        or limits.vcpu > MAX_VCPU
        or limits.memory_bytes > MAX_MEMORY_BYTES
        or limits.sort_chunk_bytes > SORT_CHUNK_BYTES
        or limits.sort_chunk_bytes < RUN.size
        or limits.whole_run_copies > MAX_WHOLE_RUN_COPIES
    ):
        raise ValueError("Pilot limits exceed or contradict the authorized caps.")


def check_deadline(deadline: float, clock: Callable[[], float]) -> None:
    if clock() >= deadline:
        raise TimeoutError("Pilot exceeded the exact 1,800-second cap.")


def exact_integer(value: object, name: str, maximum: int = 2**64 - 1) -> int:
    if type(value) is not int or not 0 <= value <= maximum:
        raise ValueError(f"{name} must be an exact non-negative integer.")
    return value


def regular_identity(result: os.stat_result) -> tuple[int, int, int, int, int]:
    if not stat.S_ISREG(result.st_mode):
        raise ValueError("Pilot inputs must be regular files.")
    return result.st_dev, result.st_ino, result.st_size, result.st_mtime_ns, result.st_ctime_ns


def open_verified(path: Path) -> tuple[int, tuple[int, int, int, int, int]]:
    if path.is_symlink():
        raise ValueError("Pilot inputs may not be symlinks.")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0))
    try:
        identity = regular_identity(os.fstat(descriptor))
        if regular_identity(os.stat(path, follow_symlinks=False)) != identity:
            raise ValueError("Pilot input path changed while opening its descriptor.")
        return descriptor, identity
    except Exception:
        os.close(descriptor)
        raise


def descriptor_sha256(descriptor: int, deadline: float, clock: Callable[[], float]) -> str:
    digest = hashlib.sha256()
    offset = 0
    while True:
        check_deadline(deadline, clock)
        block = os.pread(descriptor, 8 * 1024**2, offset)
        if not block:
            return digest.hexdigest()
        digest.update(block)
        offset += len(block)


def verify_descriptor(
    descriptor: int,
    identity: tuple[int, int, int, int, int],
    expected_sha256: str,
    deadline: float,
    clock: Callable[[], float],
) -> None:
    if regular_identity(os.fstat(descriptor)) != identity:
        raise ValueError("Pilot input identity changed.")
    if descriptor_sha256(descriptor, deadline, clock) != expected_sha256:
        raise ValueError("Pilot input SHA-256 changed.")
    if regular_identity(os.fstat(descriptor)) != identity:
        raise ValueError("Pilot input identity changed during hashing.")


def verify_path(path: Path, identity: tuple[int, int, int, int, int]) -> None:
    if path.is_symlink() or regular_identity(os.stat(path, follow_symlinks=False)) != identity:
        raise ValueError("Pilot input path identity changed.")


def descriptor_lines(descriptor: int) -> Iterator[bytes]:
    with os.fdopen(os.dup(descriptor), "rb") as stream:
        stream.seek(0)
        yield from stream


def record_from_line(line: bytes) -> dict[str, object]:
    if not line.endswith(b"\n"):
        raise ValueError("Lineage contains an unterminated record.")
    try:
        value = json.loads(line)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("Lineage contains invalid JSON.") from error
    if not isinstance(value, dict) or canonical_json(value) != line:
        raise ValueError("Lineage records must use exact canonical JSON encoding.")
    return value


def resolve(component_id: int, aliases: dict[int, int]) -> int:
    seen: set[int] = set()
    while component_id in aliases:
        if component_id in seen:
            raise ValueError("Lineage alias cycle detected.")
        seen.add(component_id)
        target = aliases[component_id]
        if target >= component_id:
            raise ValueError("Lineage aliases must descend.")
        component_id = target
    return component_id


def select_components(
    descriptor: int,
    maximum: int,
    deadline: float,
    clock: Callable[[], float],
) -> tuple[dict[int, tuple[int, int]], dict[int, int]]:
    aliases: dict[int, int] = {}
    selected: dict[int, tuple[int, int]] = {}
    header_seen = footer_seen = False
    for line in descriptor_lines(descriptor):
        check_deadline(deadline, clock)
        record = record_from_line(line)
        kind = record.get("record")
        if kind == "header":
            if header_seen or record.get("pair") != [1984, 1985] or record.get("sourceLossSha256") != LOSS_SHA256:
                raise ValueError("Lineage header is not the exact approved 1984-1985 source.")
            header_seen = True
        elif kind == "alias":
            source = exact_integer(record.get("fromComponentId"), "alias source")
            target = exact_integer(record.get("toComponentId"), "alias target")
            if source in aliases or target >= source:
                raise ValueError("Lineage alias is duplicate or non-descending.")
            aliases[source] = target
        elif kind == "component" and len(selected) < maximum:
            root = exact_integer(record.get("componentId"), "component ID")
            first = exact_integer(record.get("firstCell"), "component first cell")
            cells = exact_integer(record.get("cellCount"), "component cell count")
            if root in selected or first != root or cells == 0:
                raise ValueError("Selected component summary is invalid or duplicate.")
            selected[root] = (first, cells)
        elif kind == "footer":
            if footer_seen:
                raise ValueError("Lineage has multiple footers.")
            footer_seen = True
        elif kind not in {"run", "component"}:
            raise ValueError("Lineage contains an unknown record type.")
    if not header_seen or not footer_seen or len(selected) != maximum:
        raise ValueError("Lineage does not contain the exact requested finalized-component prefix.")
    for source in aliases:
        aliases[source] = resolve(source, aliases)
    if any(resolve(root, aliases) != root for root in selected):
        raise ValueError("A finalized component is still an alias source.")
    return selected, aliases


def validate_owner_directory(path: Path) -> None:
    if path.is_symlink() or not path.is_dir():
        raise ValueError("Pilot output parent must be an existing non-symlink directory.")
    result = os.stat(path, follow_symlinks=False)
    if result.st_uid != os.getuid() or stat.S_IMODE(result.st_mode) != 0o700:
        raise ValueError("Pilot output parent must be owner-owned mode 700.")


def prepare_paths(final_path: Path) -> tuple[Path, Path]:
    if not final_path.is_absolute() or final_path.name in {"", ".", ".."}:
        raise ValueError("Pilot output must be an absolute file path.")
    validate_owner_directory(final_path.parent)
    partial = final_path.with_name(f"{final_path.name}.partial")
    scratch = final_path.with_name(f"{final_path.name}.scratch.partial")
    for path in (final_path, partial, scratch):
        if path.exists() or path.is_symlink():
            raise ValueError(f"Pilot path must be unused: {path.name}")
    return partial, scratch


def open_exclusive(path: Path, buffering: int = -1) -> BinaryIO:
    descriptor = os.open(
        path,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_CLOEXEC", 0),
        0o600,
    )
    return os.fdopen(descriptor, "wb", buffering=buffering)


class ByteBudget:
    def __init__(self, maximum: int, label: str) -> None:
        self.maximum = maximum
        self.label = label
        self.used = 0

    def add(self, amount: int) -> None:
        if amount < 0 or self.used + amount > self.maximum:
            raise ValueError(f"Pilot exceeded its exact {self.label} cap.")
        self.used += amount


def write_all(stream: BinaryIO, payload: bytes, budget: ByteBudget | None = None) -> None:
    if budget is not None:
        budget.add(len(payload))
    stream.write(payload)


def emit_selected_runs(
    descriptor: int,
    aliases: dict[int, int],
    selected: dict[int, tuple[int, int]],
    spool: BinaryIO,
    scratch: ByteBudget,
    deadline: float,
    clock: Callable[[], float],
) -> dict[int, int]:
    counts = {root: 0 for root in selected}
    for line in descriptor_lines(descriptor):
        check_deadline(deadline, clock)
        record = record_from_line(line)
        if record.get("record") != "run":
            continue
        component = exact_integer(record.get("componentId"), "run component ID")
        row = exact_integer(record.get("row"), "run row", 2**32 - 1)
        x0 = exact_integer(record.get("x0"), "run x0", 2**32 - 1)
        x1 = exact_integer(record.get("x1"), "run x1", 2**32 - 1)
        if x1 < x0 or x1 >= GRID_WIDTH:
            raise ValueError("Lineage run coordinates are invalid.")
        root = resolve(component, aliases)
        if root in selected:
            payload = RUN.pack(root, row, x0, x1)
            scratch.add(len(payload))
            spool.write(payload)
            counts[root] += 1
    if any(count == 0 for count in counts.values()):
        raise ValueError("A selected component has no resolved run.")
    return counts


def sort_spool_in_place(
    spool_path: Path,
    raw_bytes: int,
    limits: PilotLimits,
    deadline: float,
    clock: Callable[[], float],
) -> None:
    if limits.whole_run_copies < 2:
        raise ValueError("Sorting requires exactly two or fewer whole-run copies, with a peak of two.")
    if raw_bytes > limits.scratch_bytes or raw_bytes > limits.sort_chunk_bytes or raw_bytes % RUN.size:
        raise ValueError("Pilot run spool exceeds its scratch, chunk, or 20-byte encoding bound.")
    check_deadline(deadline, clock)
    dtype = np.dtype([("root", "<u8"), ("row", "<u4"), ("x0", "<u4"), ("x1", "<u4")], align=False)
    if dtype.itemsize != RUN.size:
        raise ValueError("NumPy run representation is not exactly 20 bytes.")
    records = np.memmap(spool_path, dtype=dtype, mode="r+")
    try:
        records.sort(order=["root", "row", "x0", "x1"], kind="quicksort")
        records.flush()
    finally:
        del records
    check_deadline(deadline, clock)


def read_run(stream: BinaryIO) -> tuple[int, int, int, int] | None:
    payload = stream.read(RUN.size)
    if not payload:
        return None
    if len(payload) != RUN.size:
        raise ValueError("Sorted chunk contains a partial 20-byte record.")
    return RUN.unpack(payload)


def spool_runs(path: Path) -> Iterator[tuple[int, int, int, int]]:
    with path.open("rb") as stream:
        while (record := read_run(stream)) is not None:
            yield record


def tagged_json(kind: bytes, value: object) -> bytes:
    payload = canonical_json(value)
    return kind + struct.pack("<I", len(payload)) + payload


def expected_header(component_count: int) -> dict[str, object]:
    return {
        "schemaVersion": "witness-tree/phase2-real-patch-event-pilot/1",
        "pair": list(PAIR),
        "sourceLossSha256": LOSS_SHA256,
        "sourceLineageSha256": LINEAGE_SHA256,
        "methodParameterSha256": METHOD_SHA256,
        "componentSelection": f"first-{component_count}-finalized-components",
        "runEncoding": "little-endian-u64-root-u32-row-u32-x0-u32-x1",
        "geometryEncoding": "unsimplified-30m-inclusive-x-runs",
        "released": False,
        "productionEligible": False,
    }


def compact_output_lower_bound(raw_run_bytes: int, component_count: int) -> int:
    if raw_run_bytes % RUN.size:
        raise ValueError("Run spool is not an exact sequence of 20-byte records.")
    return len(MAGIC) + raw_run_bytes // RUN.size * (1 + RUN.size) + component_count * (1 + COMPONENT.size) + 4096


def write_output(
    path: Path,
    runs: Iterator[tuple[int, int, int, int]],
    selected: dict[int, tuple[int, int]],
    run_counts: dict[int, int],
    limits: PilotLimits,
    started: float,
    deadline: float,
    clock: Callable[[], float],
) -> dict[str, object]:
    budget = ByteBudget(limits.output_bytes, "64 MiB output")
    body_digest = hashlib.sha256()
    component_count = run_count = cell_count = 0
    with open_exclusive(path, buffering=1024**2) as output:

        def body(payload: bytes) -> None:
            write_all(output, payload, budget)
            body_digest.update(payload)

        body(MAGIC)
        body(tagged_json(b"H", expected_header(len(selected))))
        current_root: int | None = None
        observed_cells = observed_runs = 0
        previous: tuple[int, int, int, int] | None = None
        for record in runs:
            check_deadline(deadline, clock)
            root, row, x0, x1 = record
            if previous is not None and record <= previous:
                raise ValueError("Merged pilot runs are duplicate or not strictly sorted.")
            previous = record
            if root != current_root:
                if current_root is not None:
                    first, expected_cells = selected[current_root]
                    if observed_cells != expected_cells or observed_runs != run_counts[current_root]:
                        raise ValueError("Resolved runs differ from the finalized component summary.")
                first, expected_cells = selected[root]
                body(b"C" + COMPONENT.pack(root, first, expected_cells, run_counts[root]))
                component_count += 1
                current_root, observed_cells, observed_runs = root, 0, 0
            body(b"R" + RUN.pack(*record))
            observed_cells += x1 - x0 + 1
            observed_runs += 1
            run_count += 1
            cell_count += x1 - x0 + 1
        if current_root is not None:
            first, expected_cells = selected[current_root]
            if observed_cells != expected_cells or observed_runs != run_counts[current_root]:
                raise ValueError("Resolved runs differ from the finalized component summary.")
        if component_count != len(selected):
            raise ValueError("Pilot output does not contain the exact selected component prefix.")
        elapsed = clock() - started
        footer = {
            "record": "footer",
            "bodySha256": body_digest.hexdigest(),
            "componentCount": component_count,
            "runCount": run_count,
            "lossCellCount": cell_count,
            "elapsedSeconds": f"{elapsed:.6f}",
            "maximumWholeRunCopies": 2,
            "maximumVcpu": limits.vcpu,
            "maximumMemoryBytes": limits.memory_bytes,
            "sortChunkBytes": limits.sort_chunk_bytes,
            "outputCapBytes": limits.output_bytes,
            "scratchCapBytes": limits.scratch_bytes,
            "elapsedCapSeconds": limits.seconds,
            "released": False,
            "productionEligible": False,
        }
        write_all(output, tagged_json(b"F", footer), budget)
        output.flush()
        os.fsync(output.fileno())
    return footer | {"byteLength": budget.used}


def read_tagged_json(stream: BinaryIO, expected_kind: bytes) -> dict[str, object]:
    if stream.read(1) != expected_kind:
        raise ValueError("Pilot compact output record order changed.")
    size_bytes = stream.read(4)
    if len(size_bytes) != 4:
        raise ValueError("Pilot compact JSON record is truncated.")
    size = struct.unpack("<I", size_bytes)[0]
    payload = stream.read(size)
    if len(payload) != size:
        raise ValueError("Pilot compact JSON record is truncated.")
    value = record_from_line(payload)
    return value


def readback_output(
    path: Path,
    selected: dict[int, tuple[int, int]],
    limits: PilotLimits = EXACT_LIMITS,
) -> dict[str, object]:
    file_digest = hashlib.sha256(path.read_bytes()).hexdigest()
    body_digest = hashlib.sha256()
    component_count = run_count = cell_count = 0
    with path.open("rb") as stream:
        magic = stream.read(len(MAGIC))
        if magic != MAGIC:
            raise ValueError("Pilot compact output magic changed.")
        body_digest.update(magic)
        header_start = stream.tell()
        header = read_tagged_json(stream, b"H")
        stream.seek(header_start)
        body_digest.update(stream.read(1 + 4 + len(canonical_json(header))))
        if header != expected_header(len(selected)):
            raise ValueError("Pilot compact output header changed.")
        seen: set[int] = set()
        previous_root: int | None = None
        while True:
            marker = stream.read(1)
            if marker == b"F":
                stream.seek(-1, os.SEEK_CUR)
                footer = read_tagged_json(stream, b"F")
                break
            if marker != b"C":
                raise ValueError("Pilot compact output component marker changed.")
            payload = stream.read(COMPONENT.size)
            if len(payload) != COMPONENT.size:
                raise ValueError("Pilot compact component header is truncated.")
            root, first, expected_cells, expected_runs = COMPONENT.unpack(payload)
            body_digest.update(marker + payload)
            if (
                root in seen
                or (previous_root is not None and root <= previous_root)
                or selected.get(root) != (first, expected_cells)
            ):
                raise ValueError("Pilot compact component identity changed.")
            seen.add(root)
            previous_root = root
            observed_cells = 0
            observed_first: int | None = None
            previous: tuple[int, int, int, int] | None = None
            for _ in range(expected_runs):
                run_marker = stream.read(1)
                run_payload = stream.read(RUN.size)
                if run_marker != b"R" or len(run_payload) != RUN.size:
                    raise ValueError("Pilot compact run encoding changed or is truncated.")
                record = RUN.unpack(run_payload)
                if record[0] != root or (previous is not None and record <= previous):
                    raise ValueError("Pilot compact runs are misgrouped, duplicate or unsorted.")
                previous = record
                if record[3] < record[2] or record[3] >= GRID_WIDTH:
                    raise ValueError("Pilot compact run coordinates changed.")
                observed_cells += record[3] - record[2] + 1
                cell = record[1] * GRID_WIDTH + record[2]
                observed_first = cell if observed_first is None else min(observed_first, cell)
                body_digest.update(run_marker + run_payload)
            if observed_cells != expected_cells or observed_first != first:
                raise ValueError("Pilot compact component cell count changed.")
            component_count += 1
            run_count += expected_runs
            cell_count += observed_cells
        if stream.read(1):
            raise ValueError("Pilot compact output has trailing bytes.")
    if seen != set(selected) or footer.get("bodySha256") != body_digest.hexdigest():
        raise ValueError("Pilot compact output body readback changed.")
    if [footer.get(key) for key in ("componentCount", "runCount", "lossCellCount")] != [component_count, run_count, cell_count]:
        raise ValueError("Pilot compact output footer totals changed.")
    elapsed = footer.get("elapsedSeconds")
    try:
        elapsed_value = float(elapsed)  # type: ignore[arg-type]
    except (TypeError, ValueError) as error:
        raise ValueError("Pilot compact output elapsed telemetry changed.") from error
    if not math.isfinite(elapsed_value) or not 0 <= elapsed_value <= limits.seconds:
        raise ValueError("Pilot compact output elapsed telemetry exceeds its cap.")
    exact_footer = {
        "maximumWholeRunCopies": 2,
        "maximumVcpu": limits.vcpu,
        "maximumMemoryBytes": limits.memory_bytes,
        "sortChunkBytes": limits.sort_chunk_bytes,
        "outputCapBytes": limits.output_bytes,
        "scratchCapBytes": limits.scratch_bytes,
        "elapsedCapSeconds": limits.seconds,
        "released": False,
        "productionEligible": False,
    }
    if any(footer.get(key) != value for key, value in exact_footer.items()):
        raise ValueError("Pilot compact output cap or non-production telemetry changed.")
    return {
        "schemaVersion": "witness-tree/phase2-real-patch-event-pilot-readback/1",
        "byteLength": path.stat().st_size,
        "sha256": file_digest,
        "bodySha256": body_digest.hexdigest(),
        "componentCount": component_count,
        "runCount": run_count,
        "lossCellCount": cell_count,
        "released": False,
        "productionEligible": False,
    }


def fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def run_pilot(
    loss_path: Path,
    lineage_path: Path,
    final_path: Path,
    *,
    expected_loss_sha256: str = LOSS_SHA256,
    expected_lineage_sha256: str = LINEAGE_SHA256,
    limits: PilotLimits = EXACT_LIMITS,
    clock: Callable[[], float] = time.monotonic,
) -> dict[str, object]:
    validate_limits(limits)
    if RUN.size != 20:
        raise ValueError("Pilot encoding or caps are invalid.")
    partial, scratch_root = prepare_paths(final_path)
    started = clock()
    deadline = started + limits.seconds
    loss_descriptor, loss_identity = open_verified(loss_path)
    try:
        lineage_descriptor, lineage_identity = open_verified(lineage_path)
    except Exception:
        os.close(loss_descriptor)
        raise
    try:
        verify_descriptor(loss_descriptor, loss_identity, expected_loss_sha256, deadline, clock)
        verify_descriptor(lineage_descriptor, lineage_identity, expected_lineage_sha256, deadline, clock)
        selected, aliases = select_components(lineage_descriptor, limits.components, deadline, clock)
        scratch_root.mkdir(mode=0o700)
        if stat.S_IMODE(scratch_root.stat().st_mode) != 0o700:
            raise ValueError("Pilot scratch directory is not mode 700.")
        fsync_directory(scratch_root.parent)
        spool_path = scratch_root / "runs.unsorted.bin"
        scratch_budget = ByteBudget(limits.scratch_bytes, "2 GiB scratch")
        with open_exclusive(spool_path, buffering=1024**2) as spool:
            run_counts = emit_selected_runs(
                lineage_descriptor, aliases, selected, spool, scratch_budget, deadline, clock
            )
            spool.flush()
            os.fsync(spool.fileno())
        raw_run_bytes = scratch_budget.used
        if compact_output_lower_bound(raw_run_bytes, len(selected)) > limits.output_bytes:
            raise ValueError("Pilot compact output cannot fit the exact 64 MiB cap.")
        sort_spool_in_place(spool_path, raw_run_bytes, limits, deadline, clock)
        if spool_path.stat().st_size != raw_run_bytes:
            raise ValueError("In-place sort changed the exact 20-byte run representation.")
        fsync_directory(scratch_root)
        telemetry = write_output(
            partial, spool_runs(spool_path), selected, run_counts, limits, started, deadline, clock
        )
        readback = readback_output(partial, selected, limits)
        verify_descriptor(loss_descriptor, loss_identity, expected_loss_sha256, deadline, clock)
        verify_descriptor(lineage_descriptor, lineage_identity, expected_lineage_sha256, deadline, clock)
        verify_path(loss_path, loss_identity)
        verify_path(lineage_path, lineage_identity)
        check_deadline(deadline, clock)
        if spool_path.is_symlink() or not spool_path.is_file():
            raise ValueError("Pilot scratch spool identity changed before cleanup.")
        spool_path.unlink()
        scratch_root.rmdir()
        fsync_directory(final_path.parent)
        check_deadline(deadline, clock)
        try:
            os.link(partial, final_path, follow_symlinks=False)
        except FileExistsError as error:
            raise ValueError("Pilot final path appeared during execution.") from error
        fsync_directory(final_path.parent)
        if clock() >= deadline:
            final_path.unlink()
            fsync_directory(final_path.parent)
            raise TimeoutError("Pilot exceeded its exact 1,800-second cap during finalization.")
        partial.unlink()
        fsync_directory(final_path.parent)
        whole_operation_elapsed = clock() - started
        if whole_operation_elapsed > limits.seconds:
            os.link(final_path, partial, follow_symlinks=False)
            fsync_directory(final_path.parent)
            final_path.unlink()
            fsync_directory(final_path.parent)
            raise TimeoutError("Pilot exceeded its exact 1,800-second cap during finalization.")
        return {
            "schemaVersion": "witness-tree/phase2-real-patch-event-pilot-result/1",
            "status": "completed",
            "pair": list(PAIR),
            "telemetry": telemetry | {
                "wholeOperationElapsedSeconds": f"{whole_operation_elapsed:.6f}",
                "scratchPeakBytes": raw_run_bytes,
                "wholeRunCopiesPeak": 2,
            },
            "readback": readback,
            "released": False,
            "productionEligible": False,
        }
    finally:
        os.close(lineage_descriptor)
        os.close(loss_descriptor)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--loss", required=True, type=Path)
    parser.add_argument("--lineage", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = run_pilot(args.loss, args.lineage, args.output)
    print(json.dumps(result, separators=(",", ":"), sort_keys=True))


if __name__ == "__main__":
    main()
