#!/usr/bin/env python3
"""Fail-closed runner for the authorized 1984-1985 patch/event pilot."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import multiprocessing
import os
import resource
import signal
import stat
import struct
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Callable, Iterator

for _thread_variable in (
    "OMP_NUM_THREADS",
    "OPENBLAS_NUM_THREADS",
    "MKL_NUM_THREADS",
    "VECLIB_MAXIMUM_THREADS",
    "NUMEXPR_NUM_THREADS",
):
    os.environ[_thread_variable] = "1"

import numpy as np

PAIR = (1984, 1985)
GRID_WIDTH = 193936
LOSS_SHA256 = "e165954229c8803679a795145ad600220af50334cc6be5e56859697b3afd7210"
LINEAGE_SHA256 = "ed0b7fa96d1e895b0671036148a10d2ac55adf4a9204740ed974627e2fc28800"
METHOD_SHA256 = "8d12ff6b6fb10208410bedf5f012e96a9682fdec457cccce688509d2dfa0b8fa"
RUN = struct.Struct("<QIII")
MAGIC = b"WTP2PE01"
MAX_COMPONENTS = 10_000
MAX_OUTPUT_BYTES = 64 * 1024**2
MAX_SCRATCH_BYTES = 2 * 1024**3
MAX_SECONDS = 1800
MAX_VCPU = 8
MAX_MEMORY_BYTES = 16 * 1024**3
SORT_CHUNK_BYTES = 1024**3
MAX_WHOLE_RUN_COPIES = 2
GRID_HEIGHT = 128340
ORIGIN_X = -2660910.524
ORIGIN_Y = 2998848.1105
CRS_SHA256 = "221435cb5f13c37ec9936a21dc113d2184e3f5fcb1e4eb1a21b891e39cfd6882"
METHOD_VERSION = "phase2-owner-approved-versioned-nonproduction-v1"


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


def peak_rss_bytes(usage: resource.struct_rusage | None = None) -> int:
    observed = usage or resource.getrusage(resource.RUSAGE_SELF)
    return int(observed.ru_maxrss if sys.platform == "darwin" else observed.ru_maxrss * 1024)


def resource_snapshot(started: float, clock: Callable[[], float], cpu_started: float) -> dict[str, object]:
    usage = resource.getrusage(resource.RUSAGE_SELF)
    elapsed = max(clock() - started, 0.000001)
    cpu_elapsed = max(0.0, usage.ru_utime + usage.ru_stime - cpu_started)
    return {
        "observedPeakRssBytes": peak_rss_bytes(usage),
        "observedUserCpuSeconds": f"{usage.ru_utime:.6f}",
        "observedSystemCpuSeconds": f"{usage.ru_stime:.6f}",
        "observedElapsedSeconds": f"{elapsed:.6f}",
        "observedAverageVcpu": f"{cpu_elapsed / elapsed:.6f}",
        "threadEnvironmentLimit": 1,
        "affinityCpuCount": len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else None,
        "affinityEnforced": hasattr(os, "sched_getaffinity") and hasattr(os, "sched_setaffinity"),
        "cpuRlimitSeconds": resource.getrlimit(resource.RLIMIT_CPU)[0],
        "addressSpaceRlimitBytes": resource.getrlimit(resource.RLIMIT_AS)[0],
    }


def enforce_process_limits(limits: PilotLimits) -> None:
    address_hard = resource.getrlimit(resource.RLIMIT_AS)[1]
    address_limit = limits.memory_bytes if address_hard == resource.RLIM_INFINITY else min(limits.memory_bytes, address_hard)
    try:
        resource.setrlimit(resource.RLIMIT_AS, (address_limit, address_limit))
    except ValueError:
        if sys.platform != "darwin":
            raise
    cpu_hard = resource.getrlimit(resource.RLIMIT_CPU)[1]
    cpu_soft = limits.seconds
    cpu_limit_hard = limits.seconds + 1 if cpu_hard == resource.RLIM_INFINITY else min(limits.seconds + 1, cpu_hard)
    resource.setrlimit(resource.RLIMIT_CPU, (min(cpu_soft, cpu_limit_hard), cpu_limit_hard))
    if hasattr(os, "sched_getaffinity") and hasattr(os, "sched_setaffinity"):
        available = sorted(os.sched_getaffinity(0))
        os.sched_setaffinity(0, set(available[: min(limits.vcpu, len(available))]))


def process_rss_bytes(process_id: int) -> int:
    try:
        output = subprocess.check_output(
            ["/bin/ps", "-o", "rss=", "-p", str(process_id)],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        return int(output) * 1024 if output else 0
    except (OSError, subprocess.SubprocessError, ValueError):
        return 0


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


def open_owner_directory(path: Path) -> tuple[int, tuple[int, int, int, int]]:
    validate_owner_directory(path)
    path_before = os.stat(path, follow_symlinks=False)
    descriptor = os.open(
        path,
        os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0),
    )
    result = os.fstat(descriptor)
    identity = (result.st_dev, result.st_ino, result.st_uid, stat.S_IMODE(result.st_mode))
    if (
        identity[2:] != (os.getuid(), 0o700)
        or (path_before.st_dev, path_before.st_ino) != (result.st_dev, result.st_ino)
    ):
        os.close(descriptor)
        raise ValueError("Pilot output parent descriptor is not owner-owned mode 700.")
    return descriptor, identity


def verify_directory_descriptor(descriptor: int, identity: tuple[int, int, int, int]) -> None:
    result = os.fstat(descriptor)
    observed = (result.st_dev, result.st_ino, result.st_uid, stat.S_IMODE(result.st_mode))
    if observed != identity:
        raise ValueError("Pilot output parent descriptor identity changed.")


def name_exists(descriptor: int, name: str) -> bool:
    try:
        os.stat(name, dir_fd=descriptor, follow_symlinks=False)
        return True
    except FileNotFoundError:
        return False


def exact_inode_identity(result: os.stat_result) -> tuple[int, int, int, int, int, int, int]:
    return (
        result.st_dev,
        result.st_ino,
        result.st_uid,
        stat.S_IMODE(result.st_mode),
        result.st_size,
        result.st_nlink,
        result.st_ctime_ns,
    )


def verify_name_binds_descriptor(directory_descriptor: int, name: str, file_descriptor: int) -> None:
    named = os.stat(name, dir_fd=directory_descriptor, follow_symlinks=False)
    opened = os.fstat(file_descriptor)
    if exact_inode_identity(named) != exact_inode_identity(opened):
        raise ValueError(f"Pilot namespace entry no longer binds its opened inode: {name}")


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


def open_exclusive_at(directory_descriptor: int, name: str) -> int:
    descriptor = os.open(
        name,
        os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0),
        0o600,
        dir_fd=directory_descriptor,
    )
    os.fchmod(descriptor, 0o600)
    result = os.fstat(descriptor)
    if (
        not stat.S_ISREG(result.st_mode)
        or result.st_uid != os.getuid()
        or stat.S_IMODE(result.st_mode) != 0o600
        or result.st_nlink != 1
    ):
        os.close(descriptor)
        raise ValueError("Pilot file descriptor is not a new owner-only regular inode.")
    return descriptor


class ByteBudget:
    def __init__(self, maximum: int, label: str) -> None:
        self.maximum = maximum
        self.label = label
        self.used = 0

    def add(self, amount: int) -> None:
        if amount < 0 or self.used + amount > self.maximum:
            raise ValueError(f"Pilot exceeded its exact {self.label} cap.")
        self.used += amount

    def check(self, amount: int) -> None:
        if amount < 0 or self.used + amount > self.maximum:
            raise ValueError(f"Pilot exceeded its exact {self.label} cap.")


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
    spool_descriptor: int,
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
    with os.fdopen(os.dup(spool_descriptor), "r+b") as stable_spool:
        records = np.memmap(stable_spool, dtype=dtype, mode="r+")
        try:
            records.sort(order=["root", "row", "x0", "x1"], kind="quicksort")
            records.flush()
        finally:
            del records
    os.fsync(spool_descriptor)
    check_deadline(deadline, clock)


def read_run(stream: BinaryIO) -> tuple[int, int, int, int] | None:
    payload = stream.read(RUN.size)
    if not payload:
        return None
    if len(payload) != RUN.size:
        raise ValueError("Sorted chunk contains a partial 20-byte record.")
    return RUN.unpack(payload)


def spool_runs(descriptor: int) -> Iterator[tuple[int, int, int, int]]:
    with os.fdopen(os.dup(descriptor), "rb") as stream:
        stream.seek(0)
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
        "grid": {
            "width": GRID_WIDTH,
            "height": GRID_HEIGHT,
            "originX": ORIGIN_X,
            "originY": ORIGIN_Y,
            "pixelWidth": 30,
            "pixelHeight": -30,
            "crsWktSha256": CRS_SHA256,
        },
        "released": False,
        "productionEligible": False,
    }


def compact_output_lower_bound(raw_run_bytes: int, component_count: int) -> int:
    if raw_run_bytes % RUN.size:
        raise ValueError("Run spool is not an exact sequence of 20-byte records.")
    return len(MAGIC) + raw_run_bytes // RUN.size * (1 + RUN.size) + component_count * 6 + 4096


def js_number(value: int | float) -> str:
    if isinstance(value, int):
        return str(value)
    if not math.isfinite(value):
        return "null"
    if value == 0:
        return "0"
    if value.is_integer():
        return str(int(value))
    return repr(value)


def cells_from_runs(runs: list[tuple[int, int, int, int]]) -> Iterator[int]:
    for _, row, x0, x1 in runs:
        for column in range(x0, x1 + 1):
            yield row * GRID_WIDTH + column


def patch_checksum(runs: list[tuple[int, int, int, int]], from_year: int = 1984) -> str:
    digest = hashlib.sha256()
    update = digest.update
    update(b'{"batchId":"phase2-real-national-1984-2022-v1","cellIndices":[')
    first = True
    for cell in cells_from_runs(runs):
        if not first:
            update(b",")
        update(str(cell).encode())
        first = False
    update(b'],"fromYear":')
    update(str(from_year).encode())
    update(b',"geometry":{"coordinates":[')
    first = True
    for cell in cells_from_runs(runs):
        if not first:
            update(b",")
        first = False
        row, column = divmod(cell, GRID_WIDTH)
        x0, y0 = ORIGIN_X + column * 30, ORIGIN_Y - row * 30
        x1, y1 = x0 + 30, y0 - 30
        ring = ((x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0))
        update(b"[[")
        for index, (x, y) in enumerate(ring):
            if index:
                update(b",")
            update(f"[{js_number(x)},{js_number(y)}]".encode())
        update(b"]]")
    update(b'],"crsWktSha256":"')
    update(CRS_SHA256.encode())
    update(b'","type":"MultiPolygon"},"grid":{"crsWktSha256":"')
    update(CRS_SHA256.encode())
    update(b'","height":128340,"originX":-2660910.524,"originY":2998848.1105,"pixelHeight":-30,"pixelWidth":30,"width":193936},"methodParameterSha256":"')
    update(METHOD_SHA256.encode())
    update(b'","methodVersion":"')
    update(METHOD_VERSION.encode())
    update(b'","sourceLossSha256":"')
    update(LOSS_SHA256.encode())
    update(b'","toYear":1985}')
    return digest.hexdigest()


def compact_event(
    root: int,
    first_cell: int,
    cell_count: int,
    runs: list[tuple[int, int, int, int]],
) -> dict[str, object]:
    if not runs or sum(x1 - x0 + 1 for _, _, x0, x1 in runs) != cell_count:
        raise ValueError("Compact event runs differ from its finalized cell count.")
    observed_first = min(row * GRID_WIDTH + x0 for _, row, x0, _ in runs)
    if first_cell != root or observed_first != first_cell:
        raise ValueError("Compact event runs differ from its finalized first cell.")
    checksum = patch_checksum(runs)
    return {
        "status": "versioned-nonproduction",
        "eventId": f"detected-change-1985-{checksum[:24]}",
        "category": "detected-change",
        "evidence": "satellite-observation",
        "observationYear": 1985,
        "eventStart": "1985-01-01",
        "eventEnd": "1985-12-31",
        "geometry": {
            "type": "MultiPolygon",
            "crsWktSha256": CRS_SHA256,
            "encoding": "one-unsimplified-30m-polygon-per-cell-from-following-inclusive-x-runs",
        },
        "areaHectares": cell_count * 0.09,
        "cellIndices": {
            "encoding": "ascending-indices-from-following-inclusive-x-runs",
            "cellCount": cell_count,
        },
        "lineage": {
            "batchId": "phase2-real-national-1984-2022-v1",
            "sourceLossSha256": LOSS_SHA256,
            "fromYear": 1984,
            "toYear": 1985,
            "sourceLossValue": 1,
        },
        "methodVersion": METHOD_VERSION,
        "methodParameterSha256": METHOD_SHA256,
        "coverageGrade": "national-baseline",
        "patchChecksumSha256": checksum,
        "componentRoot": root,
        "runCount": len(runs),
        "released": False,
        "productionEligible": False,
    }


def write_output(
    descriptor: int,
    runs: Iterator[tuple[int, int, int, int]],
    selected: dict[int, tuple[int, int]],
    run_counts: dict[int, int],
    limits: PilotLimits,
    started: float,
    cpu_started: float,
    deadline: float,
    clock: Callable[[], float],
) -> dict[str, object]:
    budget = ByteBudget(limits.output_bytes, "64 MiB output")
    body_digest = hashlib.sha256()
    payload_digest = hashlib.sha256()
    component_count = run_count = cell_count = 0
    with os.fdopen(os.dup(descriptor), "wb", buffering=1024**2) as output:

        def body(payload: bytes) -> None:
            write_all(output, payload, budget)
            body_digest.update(payload)
            payload_digest.update(payload)

        body(MAGIC)
        body(tagged_json(b"H", expected_header(len(selected))))
        current_root: int | None = None
        current_runs: list[tuple[int, int, int, int]] = []
        previous: tuple[int, int, int, int] | None = None

        def flush_event(root: int, event_runs: list[tuple[int, int, int, int]]) -> None:
            nonlocal component_count, run_count, cell_count
            first_cell, expected_cells = selected[root]
            if len(event_runs) != run_counts[root]:
                raise ValueError("Resolved runs differ from the finalized component run count.")
            event = compact_event(root, first_cell, expected_cells, event_runs)
            event_payload = tagged_json(b"E", event)
            budget.check(len(event_payload) + len(event_runs) * (1 + RUN.size))
            body(event_payload)
            for event_run in event_runs:
                body(b"R" + RUN.pack(*event_run))
            component_count += 1
            run_count += len(event_runs)
            cell_count += expected_cells

        for record in runs:
            check_deadline(deadline, clock)
            root, row, x0, x1 = record
            if previous is not None and record <= previous:
                raise ValueError("Merged pilot runs are duplicate or not strictly sorted.")
            previous = record
            if root != current_root:
                if current_root is not None:
                    flush_event(current_root, current_runs)
                current_root, current_runs = root, []
            current_runs.append(record)
        if current_root is not None:
            flush_event(current_root, current_runs)
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
        } | resource_snapshot(started, clock, cpu_started)
        footer_payload = tagged_json(b"F", footer)
        candidate_payload_digest = payload_digest.copy()
        candidate_payload_digest.update(footer_payload)
        candidate_payload_length = budget.used + len(footer_payload)
        attestation = {
            "record": "attestation",
            "payloadByteLength": candidate_payload_length,
            "payloadSha256": candidate_payload_digest.hexdigest(),
            "bodySha256": body_digest.hexdigest(),
            "componentCount": component_count,
            "runCount": run_count,
            "lossCellCount": cell_count,
            "released": False,
            "productionEligible": False,
        }
        attestation_payload = tagged_json(b"A", attestation)
        budget.check(len(footer_payload) + len(attestation_payload))
        write_all(output, footer_payload, budget)
        payload_digest.update(footer_payload)
        write_all(output, attestation_payload, budget)
        output.flush()
        os.fsync(output.fileno())
    return footer | attestation | {"byteLength": budget.used}


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
    descriptor: int,
    selected: dict[int, tuple[int, int]],
    limits: PilotLimits = EXACT_LIMITS,
) -> dict[str, object]:
    file_digest_builder = hashlib.sha256()
    offset = 0
    while True:
        payload = os.pread(descriptor, 8 * 1024**2, offset)
        if not payload:
            break
        file_digest_builder.update(payload)
        offset += len(payload)
    file_digest = file_digest_builder.hexdigest()
    body_digest = hashlib.sha256()
    component_count = run_count = cell_count = 0
    with os.fdopen(os.dup(descriptor), "rb") as stream:
        stream.seek(0)
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
                footer_start = stream.tell()
                footer = read_tagged_json(stream, b"F")
                attestation_start = stream.tell()
                attestation = read_tagged_json(stream, b"A")
                break
            if marker != b"E":
                raise ValueError("Pilot compact output event marker changed.")
            stream.seek(-1, os.SEEK_CUR)
            event_start = stream.tell()
            event = read_tagged_json(stream, b"E")
            stream.seek(event_start)
            event_payload = stream.read(1 + 4 + len(canonical_json(event)))
            body_digest.update(event_payload)
            root = exact_integer(event.get("componentRoot"), "compact event root")
            expected_runs = exact_integer(event.get("runCount"), "compact event run count", 2**32 - 1)
            cell_indices = event.get("cellIndices")
            if not isinstance(cell_indices, dict):
                raise ValueError("Pilot compact event cellIndices encoding changed.")
            expected_cells = exact_integer(cell_indices.get("cellCount"), "compact event cell count")
            first = selected.get(root, (-1, -1))[0]
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
            event_runs: list[tuple[int, int, int, int]] = []
            for _ in range(expected_runs):
                run_marker = stream.read(1)
                run_payload = stream.read(RUN.size)
                if run_marker != b"R" or len(run_payload) != RUN.size:
                    raise ValueError("Pilot compact run encoding changed or is truncated.")
                record = RUN.unpack(run_payload)
                if record[0] != root or (previous is not None and record <= previous):
                    raise ValueError("Pilot compact runs are misgrouped, duplicate or unsorted.")
                previous = record
                event_runs.append(record)
                if record[3] < record[2] or record[3] >= GRID_WIDTH:
                    raise ValueError("Pilot compact run coordinates changed.")
                observed_cells += record[3] - record[2] + 1
                cell = record[1] * GRID_WIDTH + record[2]
                observed_first = cell if observed_first is None else min(observed_first, cell)
                body_digest.update(run_marker + run_payload)
            if observed_cells != expected_cells or observed_first != first:
                raise ValueError("Pilot compact component cell count changed.")
            if event != compact_event(root, first, expected_cells, event_runs):
                raise ValueError("Pilot compact realDetectedChangeEvent metadata changed.")
            component_count += 1
            run_count += expected_runs
            cell_count += observed_cells
        trailing = stream.read(1)
        operation_telemetry: dict[str, object] | None = None
        final_attestation: dict[str, object] | None = None
        final_attestation_start: int | None = None
        telemetry_start: int | None = None
        if trailing:
            if trailing != b"T":
                raise ValueError("Pilot compact output has an unknown trailing record.")
            stream.seek(-1, os.SEEK_CUR)
            telemetry_start = stream.tell()
            operation_telemetry = read_tagged_json(stream, b"T")
            final_attestation_start = stream.tell()
            final_attestation = read_tagged_json(stream, b"U")
            if stream.read(1):
                raise ValueError("Pilot compact output has trailing bytes after final attestation.")
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
    peak = exact_integer(footer.get("observedPeakRssBytes"), "observed peak RSS")
    affinity = footer.get("affinityCpuCount")
    if affinity is not None:
        affinity = exact_integer(affinity, "observed affinity CPU count")
    if (
        peak > limits.memory_bytes
        or (affinity is not None and affinity > limits.vcpu)
        or footer.get("threadEnvironmentLimit") != 1
        or footer.get("affinityEnforced") != (affinity is not None)
    ):
        raise ValueError("Pilot compact output resource telemetry exceeds its caps.")
    for key in ("observedUserCpuSeconds", "observedSystemCpuSeconds", "observedElapsedSeconds", "observedAverageVcpu"):
        try:
            value = float(footer.get(key))  # type: ignore[arg-type]
        except (TypeError, ValueError) as error:
            raise ValueError("Pilot compact output resource telemetry changed.") from error
        if not math.isfinite(value) or value < 0 or (key == "observedElapsedSeconds" and value > limits.seconds) or (key == "observedAverageVcpu" and value > limits.vcpu):
            raise ValueError("Pilot compact output resource telemetry exceeds its caps.")
    payload_digest = hashlib.sha256()
    offset = 0
    while offset < attestation_start:
        block = os.pread(descriptor, min(8 * 1024**2, attestation_start - offset), offset)
        if not block:
            raise ValueError("Pilot compact payload is truncated before its attestation.")
        payload_digest.update(block)
        offset += len(block)
    expected_attestation = {
        "record": "attestation",
        "payloadByteLength": attestation_start,
        "payloadSha256": payload_digest.hexdigest(),
        "bodySha256": body_digest.hexdigest(),
        "componentCount": component_count,
        "runCount": run_count,
        "lossCellCount": cell_count,
        "released": False,
        "productionEligible": False,
    }
    if attestation != expected_attestation or footer_start <= 0:
        raise ValueError("Pilot compact payload attestation does not reconcile writer, body, footer, and bytes.")
    if operation_telemetry is not None:
        if final_attestation is None or final_attestation_start is None or telemetry_start is None:
            raise ValueError("Pilot operation telemetry lacks its final attestation.")
        candidate_digest = hashlib.sha256()
        offset = 0
        while offset < telemetry_start:
            block = os.pread(descriptor, min(8 * 1024**2, telemetry_start - offset), offset)
            if not block:
                raise ValueError("Pilot candidate payload is truncated before telemetry.")
            candidate_digest.update(block)
            offset += len(block)
        telemetry_relationships = {
            "record": "whole-operation-telemetry",
            "scope": "source-verification-through-candidate-write-fsync-and-same-fd-readback",
            "writerByteLength": telemetry_start,
            "writerBodySha256": body_digest.hexdigest(),
            "writerPayloadSha256": payload_digest.hexdigest(),
            "candidateByteLength": telemetry_start,
            "candidateFileSha256": candidate_digest.hexdigest(),
            "candidateBodySha256": body_digest.hexdigest(),
            "candidatePayloadSha256": payload_digest.hexdigest(),
            "memoryCapBytes": limits.memory_bytes,
            "vcpuCap": limits.vcpu,
            "wallTimeCapSeconds": limits.seconds,
            "threadEnvironmentLimit": 1,
            "affinityEnforced": operation_telemetry.get("affinityCpuCount") is not None,
            "released": False,
            "productionEligible": False,
        }
        if any(operation_telemetry.get(key) != value for key, value in telemetry_relationships.items()):
            raise ValueError("Pilot whole-operation telemetry does not reconcile its candidate bytes and caps.")
        for key, cap in (
            ("wholeOperationElapsedSeconds", limits.seconds),
            ("observedPeakRssBytes", limits.memory_bytes),
            ("observedAverageVcpu", limits.vcpu),
        ):
            try:
                value = float(operation_telemetry.get(key))
            except (TypeError, ValueError) as error:
                raise ValueError("Pilot whole-operation telemetry contains a nonnumeric observation.") from error
            if not math.isfinite(value) or value < 0 or value > cap:
                raise ValueError("Pilot whole-operation telemetry exceeds an exact cap.")
        telemetry_affinity = operation_telemetry.get("affinityCpuCount")
        if telemetry_affinity is not None and exact_integer(telemetry_affinity, "affinity CPU count") > limits.vcpu:
            raise ValueError("Pilot whole-operation affinity telemetry exceeds its cap.")
        bound_digest = hashlib.sha256()
        offset = 0
        while offset < final_attestation_start:
            block = os.pread(descriptor, min(8 * 1024**2, final_attestation_start - offset), offset)
            if not block:
                raise ValueError("Pilot telemetry-bound payload is truncated.")
            bound_digest.update(block)
            offset += len(block)
        expected_final_attestation = {
            "record": "final-attestation",
            "telemetryBoundByteLength": final_attestation_start,
            "telemetryBoundSha256": bound_digest.hexdigest(),
            "candidateFileSha256": operation_telemetry.get("candidateFileSha256"),
            "released": False,
            "productionEligible": False,
        }
        if final_attestation != expected_final_attestation:
            raise ValueError("Pilot whole-operation telemetry is not checksum-bound.")
    result = {
        "schemaVersion": "witness-tree/phase2-real-patch-event-pilot-readback/1",
        "byteLength": os.fstat(descriptor).st_size,
        "sha256": file_digest,
        "bodySha256": body_digest.hexdigest(),
        "payloadByteLength": attestation_start,
        "payloadSha256": payload_digest.hexdigest(),
        "componentCount": component_count,
        "runCount": run_count,
        "lossCellCount": cell_count,
        "released": False,
        "productionEligible": False,
    }
    if operation_telemetry is not None:
        result["operationTelemetry"] = operation_telemetry
        result["telemetryBoundSha256"] = final_attestation["telemetryBoundSha256"]  # type: ignore[index]
    return result


def append_operation_telemetry(
    descriptor: int,
    writer: dict[str, object],
    candidate_readback: dict[str, object],
    started: float,
    cpu_started: float,
    limits: PilotLimits,
    clock: Callable[[], float],
) -> dict[str, object]:
    snapshot = resource_snapshot(started, clock, cpu_started)
    telemetry = {
        "record": "whole-operation-telemetry",
        "scope": "source-verification-through-candidate-write-fsync-and-same-fd-readback",
        "wholeOperationElapsedSeconds": snapshot["observedElapsedSeconds"],
        "observedPeakRssBytes": snapshot["observedPeakRssBytes"],
        "observedUserCpuSeconds": snapshot["observedUserCpuSeconds"],
        "observedSystemCpuSeconds": snapshot["observedSystemCpuSeconds"],
        "observedAverageVcpu": snapshot["observedAverageVcpu"],
        "affinityCpuCount": snapshot["affinityCpuCount"],
        "affinityEnforced": snapshot["affinityEnforced"],
        "threadEnvironmentLimit": 1,
        "memoryCapBytes": limits.memory_bytes,
        "vcpuCap": limits.vcpu,
        "wallTimeCapSeconds": limits.seconds,
        "writerByteLength": writer["byteLength"],
        "writerBodySha256": writer["bodySha256"],
        "writerPayloadSha256": writer["payloadSha256"],
        "candidateByteLength": candidate_readback["byteLength"],
        "candidateFileSha256": candidate_readback["sha256"],
        "candidateBodySha256": candidate_readback["bodySha256"],
        "candidatePayloadSha256": candidate_readback["payloadSha256"],
        "released": False,
        "productionEligible": False,
    }
    elapsed = float(telemetry["wholeOperationElapsedSeconds"])
    if (
        elapsed > limits.seconds
        or exact_integer(telemetry["observedPeakRssBytes"], "observed peak RSS") > limits.memory_bytes
        or (
            telemetry["affinityCpuCount"] is not None
            and exact_integer(telemetry["affinityCpuCount"], "affinity CPU count") > limits.vcpu
        )
    ):
        raise ValueError("Whole-operation telemetry exceeds an exact pilot cap.")
    telemetry_payload = tagged_json(b"T", telemetry)
    if os.fstat(descriptor).st_size + len(telemetry_payload) + 512 > limits.output_bytes:
        raise ValueError("Checksum-bound whole-operation telemetry cannot fit the output cap.")
    os.lseek(descriptor, 0, os.SEEK_END)
    with os.fdopen(os.dup(descriptor), "ab", buffering=0) as output:
        output.write(telemetry_payload)
        output.flush()
        os.fsync(output.fileno())
    bound_length = os.fstat(descriptor).st_size
    bound_digest = hashlib.sha256()
    offset = 0
    while offset < bound_length:
        block = os.pread(descriptor, min(8 * 1024**2, bound_length - offset), offset)
        if not block:
            raise ValueError("Whole-operation telemetry payload is truncated.")
        bound_digest.update(block)
        offset += len(block)
    final_attestation = {
        "record": "final-attestation",
        "telemetryBoundByteLength": bound_length,
        "telemetryBoundSha256": bound_digest.hexdigest(),
        "candidateFileSha256": candidate_readback["sha256"],
        "released": False,
        "productionEligible": False,
    }
    final_attestation_payload = tagged_json(b"U", final_attestation)
    if bound_length + len(final_attestation_payload) > limits.output_bytes:
        raise ValueError("Final telemetry attestation cannot fit the output cap.")
    with os.fdopen(os.dup(descriptor), "ab", buffering=0) as output:
        output.write(final_attestation_payload)
        output.flush()
        os.fsync(output.fileno())
    return telemetry | final_attestation


def run_pilot(
    loss_path: Path,
    lineage_path: Path,
    final_path: Path,
    *,
    expected_loss_sha256: str = LOSS_SHA256,
    expected_lineage_sha256: str = LINEAGE_SHA256,
    limits: PilotLimits = EXACT_LIMITS,
    clock: Callable[[], float] = time.monotonic,
    enforce_resources: bool = False,
    defer_partial_unlink: bool = False,
) -> dict[str, object]:
    validate_limits(limits)
    if enforce_resources:
        enforce_process_limits(limits)
    if RUN.size != 20:
        raise ValueError("Pilot encoding or caps are invalid.")
    partial, scratch_root = prepare_paths(final_path)
    parent_descriptor, parent_identity = open_owner_directory(final_path.parent)
    final_name, partial_name, scratch_name = final_path.name, partial.name, scratch_root.name
    for name in (final_name, partial_name, scratch_name):
        if name_exists(parent_descriptor, name):
            os.close(parent_descriptor)
            raise ValueError(f"Pilot path must be unused: {name}")
    started = clock()
    initial_usage = resource.getrusage(resource.RUSAGE_SELF)
    cpu_started = initial_usage.ru_utime + initial_usage.ru_stime
    deadline = started + limits.seconds
    loss_descriptor, loss_identity = open_verified(loss_path)
    try:
        lineage_descriptor, lineage_identity = open_verified(lineage_path)
    except Exception:
        os.close(loss_descriptor)
        raise
    scratch_descriptor: int | None = None
    spool_descriptor: int | None = None
    partial_descriptor: int | None = None
    try:
        verify_descriptor(loss_descriptor, loss_identity, expected_loss_sha256, deadline, clock)
        verify_descriptor(lineage_descriptor, lineage_identity, expected_lineage_sha256, deadline, clock)
        selected, aliases = select_components(lineage_descriptor, limits.components, deadline, clock)
        verify_directory_descriptor(parent_descriptor, parent_identity)
        os.mkdir(scratch_name, mode=0o700, dir_fd=parent_descriptor)
        os.fsync(parent_descriptor)
        scratch_descriptor = os.open(
            scratch_name,
            os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0),
            dir_fd=parent_descriptor,
        )
        scratch_stat = os.fstat(scratch_descriptor)
        if scratch_stat.st_uid != os.getuid() or stat.S_IMODE(scratch_stat.st_mode) != 0o700:
            raise ValueError("Pilot scratch directory is not mode 700.")
        spool_descriptor = open_exclusive_at(scratch_descriptor, "runs.unsorted.bin")
        scratch_budget = ByteBudget(limits.scratch_bytes, "2 GiB scratch")
        with os.fdopen(os.dup(spool_descriptor), "wb", buffering=1024**2) as spool:
            run_counts = emit_selected_runs(
                lineage_descriptor, aliases, selected, spool, scratch_budget, deadline, clock
            )
            spool.flush()
            os.fsync(spool.fileno())
        raw_run_bytes = scratch_budget.used
        if compact_output_lower_bound(raw_run_bytes, len(selected)) > limits.output_bytes:
            raise ValueError("Pilot compact output cannot fit the exact 64 MiB cap.")
        sort_spool_in_place(spool_descriptor, raw_run_bytes, limits, deadline, clock)
        if os.fstat(spool_descriptor).st_size != raw_run_bytes:
            raise ValueError("In-place sort changed the exact 20-byte run representation.")
        os.fsync(scratch_descriptor)
        partial_descriptor = open_exclusive_at(parent_descriptor, partial_name)
        telemetry = write_output(
            partial_descriptor, spool_runs(spool_descriptor), selected, run_counts, limits, started, cpu_started, deadline, clock
        )
        partial_before_readback = os.fstat(partial_descriptor)
        candidate_readback = readback_output(partial_descriptor, selected, limits)
        for key in ("bodySha256", "payloadSha256", "payloadByteLength", "componentCount", "runCount", "lossCellCount"):
            if telemetry.get(key) != candidate_readback.get(key):
                raise ValueError("Pilot writer telemetry and same-descriptor readback do not reconcile.")
        if telemetry.get("byteLength") != candidate_readback.get("byteLength"):
            raise ValueError("Pilot writer and same-descriptor readback byte lengths differ.")
        partial_after_readback = os.fstat(partial_descriptor)
        before_identity = (
            partial_before_readback.st_dev,
            partial_before_readback.st_ino,
            partial_before_readback.st_size,
            partial_before_readback.st_ctime_ns,
            partial_before_readback.st_nlink,
        )
        after_identity = (
            partial_after_readback.st_dev,
            partial_after_readback.st_ino,
            partial_after_readback.st_size,
            partial_after_readback.st_ctime_ns,
            partial_after_readback.st_nlink,
        )
        if before_identity != after_identity or partial_after_readback.st_nlink != 1:
            raise ValueError("Pilot partial inode changed during same-descriptor readback.")
        verify_descriptor(loss_descriptor, loss_identity, expected_loss_sha256, deadline, clock)
        verify_descriptor(lineage_descriptor, lineage_identity, expected_lineage_sha256, deadline, clock)
        verify_path(loss_path, loss_identity)
        verify_path(lineage_path, lineage_identity)
        operation_telemetry = append_operation_telemetry(
            partial_descriptor, telemetry, candidate_readback, started, cpu_started, limits, clock
        )
        partial_before_final_readback = os.fstat(partial_descriptor)
        readback = readback_output(partial_descriptor, selected, limits)
        if readback.get("operationTelemetry") is None or readback.get("telemetryBoundSha256") != operation_telemetry.get("telemetryBoundSha256"):
            raise ValueError("Persisted whole-operation telemetry did not survive exact same-fd readback.")
        partial_after_readback = os.fstat(partial_descriptor)
        if exact_inode_identity(partial_before_final_readback) != exact_inode_identity(partial_after_readback):
            raise ValueError("Pilot partial inode changed during final same-descriptor readback.")
        check_deadline(deadline, clock)
        spool_stat = os.fstat(spool_descriptor)
        if not stat.S_ISREG(spool_stat.st_mode) or spool_stat.st_nlink != 1:
            raise ValueError("Pilot scratch spool identity changed before cleanup.")
        verify_name_binds_descriptor(scratch_descriptor, "runs.unsorted.bin", spool_descriptor)
        os.unlink("runs.unsorted.bin", dir_fd=scratch_descriptor)
        if os.fstat(spool_descriptor).st_nlink != 0:
            raise ValueError("Pilot scratch spool unlink did not affect its bound inode.")
        os.fsync(scratch_descriptor)
        os.close(spool_descriptor)
        spool_descriptor = None
        verify_name_binds_descriptor(parent_descriptor, scratch_name, scratch_descriptor)
        os.close(scratch_descriptor)
        scratch_descriptor = None
        os.rmdir(scratch_name, dir_fd=parent_descriptor)
        os.fsync(parent_descriptor)
        verify_directory_descriptor(parent_descriptor, parent_identity)
        verify_name_binds_descriptor(parent_descriptor, partial_name, partial_descriptor)
        check_deadline(deadline, clock)
        try:
            os.link(
                partial_name,
                final_name,
                src_dir_fd=parent_descriptor,
                dst_dir_fd=parent_descriptor,
                follow_symlinks=False,
            )
        except FileExistsError as error:
            raise ValueError("Pilot final path appeared during execution.") from error
        os.fsync(parent_descriptor)
        linked_stat = os.fstat(partial_descriptor)
        if (
            linked_stat.st_dev != partial_after_readback.st_dev
            or linked_stat.st_ino != partial_after_readback.st_ino
            or linked_stat.st_size != partial_after_readback.st_size
            or linked_stat.st_nlink != 2
        ):
            os.unlink(final_name, dir_fd=parent_descriptor)
            os.fsync(parent_descriptor)
            raise ValueError("Pilot no-copy publication did not preserve its bound inode.")
        if clock() >= deadline:
            os.unlink(final_name, dir_fd=parent_descriptor)
            os.fsync(parent_descriptor)
            raise TimeoutError("Pilot exceeded its exact 1,800-second cap during finalization.")
        if not defer_partial_unlink:
            os.unlink(partial_name, dir_fd=parent_descriptor)
            os.fsync(parent_descriptor)
        whole_operation_elapsed = clock() - started
        if whole_operation_elapsed > limits.seconds:
            if not name_exists(parent_descriptor, partial_name):
                os.link(final_name, partial_name, src_dir_fd=parent_descriptor, dst_dir_fd=parent_descriptor, follow_symlinks=False)
                os.fsync(parent_descriptor)
            os.unlink(final_name, dir_fd=parent_descriptor)
            os.fsync(parent_descriptor)
            raise TimeoutError("Pilot exceeded its exact 1,800-second cap during finalization.")
        final_resources = resource_snapshot(started, clock, cpu_started)
        if (
            exact_integer(final_resources["observedPeakRssBytes"], "observed peak RSS") > limits.memory_bytes
            or (
                final_resources["affinityCpuCount"] is not None
                and exact_integer(final_resources["affinityCpuCount"], "observed affinity CPU count") > limits.vcpu
            )
        ):
            if not name_exists(parent_descriptor, partial_name):
                os.link(final_name, partial_name, src_dir_fd=parent_descriptor, dst_dir_fd=parent_descriptor, follow_symlinks=False)
                os.fsync(parent_descriptor)
            os.unlink(final_name, dir_fd=parent_descriptor)
            os.fsync(parent_descriptor)
            raise MemoryError("Pilot exceeded its exact RSS or vCPU cap.")
        return {
            "schemaVersion": "witness-tree/phase2-real-patch-event-pilot-result/1",
            "status": "completed",
            "pair": list(PAIR),
            "telemetry": telemetry | {
                "wholeOperationElapsedSeconds": f"{whole_operation_elapsed:.6f}",
                "scratchPeakBytes": raw_run_bytes,
                "wholeRunCopiesPeak": 2,
                "partialDevice": linked_stat.st_dev,
                "partialInode": linked_stat.st_ino,
                "partialLinkCountAtPublication": linked_stat.st_nlink,
                "partialCtimeNsAtPublication": linked_stat.st_ctime_ns,
            } | operation_telemetry | final_resources,
            "readback": readback,
            "released": False,
            "productionEligible": False,
        }
    finally:
        if partial_descriptor is not None:
            os.close(partial_descriptor)
        if spool_descriptor is not None:
            os.close(spool_descriptor)
        if scratch_descriptor is not None:
            os.close(scratch_descriptor)
        os.close(parent_descriptor)
        os.close(lineage_descriptor)
        os.close(loss_descriptor)


def _pilot_child(
    connection: multiprocessing.connection.Connection,
    loss_path: Path,
    lineage_path: Path,
    final_path: Path,
    expected_loss_sha256: str,
    expected_lineage_sha256: str,
    limits: PilotLimits,
) -> None:
    try:
        os.setsid()
        result = run_pilot(
            loss_path,
            lineage_path,
            final_path,
            expected_loss_sha256=expected_loss_sha256,
            expected_lineage_sha256=expected_lineage_sha256,
            limits=limits,
            enforce_resources=True,
            defer_partial_unlink=True,
        )
        connection.send(("ok", result))
    except BaseException as error:
        connection.send(("error", type(error).__name__, str(error)))
    finally:
        connection.close()


def same_regular_inode_at(
    directory_descriptor: int,
    left: str,
    right: str,
    expected_link_count: int | None = 2,
) -> bool:
    try:
        left_stat = os.stat(left, dir_fd=directory_descriptor, follow_symlinks=False)
        right_stat = os.stat(right, dir_fd=directory_descriptor, follow_symlinks=False)
    except FileNotFoundError:
        return False
    return (
        stat.S_ISREG(left_stat.st_mode)
        and stat.S_ISREG(right_stat.st_mode)
        and left_stat.st_uid == right_stat.st_uid == os.getuid()
        and stat.S_IMODE(left_stat.st_mode) == stat.S_IMODE(right_stat.st_mode) == 0o600
        and left_stat.st_nlink == right_stat.st_nlink
        and (expected_link_count is None or left_stat.st_nlink == expected_link_count)
        and (left_stat.st_dev, left_stat.st_ino) == (right_stat.st_dev, right_stat.st_ino)
    )


def rollback_published_at(directory_descriptor: int, final_name: str, partial_name: str) -> None:
    if same_regular_inode_at(directory_descriptor, final_name, partial_name, expected_link_count=None):
        os.unlink(final_name, dir_fd=directory_descriptor)
        os.fsync(directory_descriptor)


def supervise_pilot(
    loss_path: Path,
    lineage_path: Path,
    final_path: Path,
    *,
    expected_loss_sha256: str = LOSS_SHA256,
    expected_lineage_sha256: str = LINEAGE_SHA256,
    limits: PilotLimits = EXACT_LIMITS,
) -> dict[str, object]:
    validate_limits(limits)
    partial = final_path.with_name(f"{final_path.name}.partial")
    parent_descriptor, parent_identity = open_owner_directory(final_path.parent)
    context = multiprocessing.get_context("fork")
    receiving, sending = context.Pipe(duplex=False)
    process = context.Process(
        target=_pilot_child,
        args=(sending, loss_path, lineage_path, final_path, expected_loss_sha256, expected_lineage_sha256, limits),
    )
    started = time.monotonic()
    process.start()
    sending.close()
    watchdog_deadline = started + limits.seconds
    watchdog_peak_rss = 0
    watchdog_reason: str | None = None
    while process.is_alive() and time.monotonic() < watchdog_deadline:
        process.join(min(0.1, max(0.0, watchdog_deadline - time.monotonic())))
        watchdog_peak_rss = max(watchdog_peak_rss, process_rss_bytes(process.pid))
        if watchdog_peak_rss > limits.memory_bytes:
            watchdog_reason = "RSS cap"
            break
    if process.is_alive():
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            process.kill()
        process.join()
        verify_directory_descriptor(parent_descriptor, parent_identity)
        rollback_published_at(parent_descriptor, final_path.name, partial.name)
        os.close(parent_descriptor)
        if watchdog_reason is not None:
            raise MemoryError("Parent watchdog killed the pilot at the exact RSS cap.")
        raise TimeoutError("Parent watchdog killed the pilot at the exact wall-time boundary.")
    elapsed = time.monotonic() - started
    if not receiving.poll() or elapsed > limits.seconds:
        verify_directory_descriptor(parent_descriptor, parent_identity)
        rollback_published_at(parent_descriptor, final_path.name, partial.name)
        os.close(parent_descriptor)
        raise RuntimeError("Pilot worker exited without a timely exact result.")
    message = receiving.recv()
    receiving.close()
    if message[0] != "ok":
        verify_directory_descriptor(parent_descriptor, parent_identity)
        rollback_published_at(parent_descriptor, final_path.name, partial.name)
        os.close(parent_descriptor)
        raise RuntimeError(f"Pilot worker stopped fail-closed: {message[1]}: {message[2]}")
    verify_directory_descriptor(parent_descriptor, parent_identity)
    if not same_regular_inode_at(parent_descriptor, final_path.name, partial.name):
        os.close(parent_descriptor)
        raise RuntimeError("Pilot publication inode does not match its verified partial inode.")
    os.unlink(partial.name, dir_fd=parent_descriptor)
    os.fsync(parent_descriptor)
    os.close(parent_descriptor)
    result = message[1]
    result["telemetry"]["parentWatchdogElapsedSeconds"] = f"{elapsed:.6f}"
    result["telemetry"]["parentWatchdogLimitSeconds"] = limits.seconds
    result["telemetry"]["parentObservedPeakRssBytes"] = watchdog_peak_rss
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--loss", required=True, type=Path)
    parser.add_argument("--lineage", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = supervise_pilot(args.loss, args.lineage, args.output)
    print(json.dumps(result, separators=(",", ":"), sort_keys=True))


if __name__ == "__main__":
    main()
