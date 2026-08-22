#!/usr/bin/env python3
"""Read-only, bounded-memory inventory of four-connected loss components."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import time
from pathlib import Path

import numpy as np
from osgeo import gdal

gdal.UseExceptions()

GRID_WIDTH = 193936
GRID_HEIGHT = 128340
LOSS_MAP_SHA256 = "c962180952e11af0766c5b929d97d4bb635181f93c04e93bbfa7d808e1561430"
MAX_SECONDS = 96 * 60 * 60
CANONICAL_PAIR_COUNT = 38
LINEAGE_BYTE_CAP = 2 * 1024**4
FileIdentity = tuple[int, int, int, int]


def row_runs(row: np.ndarray) -> list[tuple[int, int]]:
    """Return inclusive loss runs in increasing column order."""
    columns = np.flatnonzero(row == 1)
    if columns.size == 0:
        return []
    cuts = np.flatnonzero(np.diff(columns) > 1) + 1
    groups = np.split(columns, cuts)
    return [(int(group[0]), int(group[-1])) for group in groups]


class LineageByteBudget:
    """Share one retained-output budget across all pair lineage streams."""

    def __init__(self, maximum: int) -> None:
        self.maximum = maximum
        self.used = 0

    def reserve(self, amount: int) -> None:
        if amount < 0 or self.used + amount > self.maximum:
            raise ValueError("Component lineage would exceed the approved 2 TiB retained-output cap.")
        self.used += amount


def partial_lineage_path(path: Path) -> Path:
    return path.with_name(f"{path.name}.partial")


def validate_lineage_target(path: Path) -> Path:
    """Require both the final and partial lineage names to be unused."""
    if path.parent.is_symlink() or not path.parent.is_dir():
        raise ValueError("Component lineage parent must be an existing non-symlink directory.")
    if path.exists() or path.is_symlink():
        raise ValueError(f"Component lineage output already exists: {path.name}")
    partial_path = partial_lineage_path(path)
    if partial_path.exists() or partial_path.is_symlink():
        raise ValueError(f"Component lineage partial output already exists: {partial_path.name}")
    return partial_path


def fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


class ComponentLineageWriter:
    """Write exact row-run lineage without retaining completed components in memory."""

    def __init__(
        self,
        path: Path,
        from_year: int,
        to_year: int,
        source_loss_sha256: str,
        width: int,
        height: int,
        budget: LineageByteBudget,
    ) -> None:
        self.path = path
        self.partial_path = validate_lineage_target(path)
        self.budget = budget
        self.bytes_written = 0
        self.digest = hashlib.sha256()
        self.stream = self.partial_path.open("xb")
        try:
            fsync_directory(self.partial_path.parent)
            self._write(
                {
                    "record": "header",
                    "schemaVersion": "witness-tree/phase2-real-loss-component-lineage/1",
                    "pair": [from_year, to_year],
                    "sourceLossSha256": source_loss_sha256,
                    "grid": [width, height],
                    "connectivity": 4,
                    "encoding": "inclusive-x-runs",
                    "released": False,
                    "productionEligible": False,
                }
            )
        except Exception:
            self.stream.close()
            raise

    def _write(self, record: dict[str, object]) -> None:
        payload = (json.dumps(record, separators=(",", ":"), sort_keys=True) + "\n").encode("utf-8")
        self.budget.reserve(len(payload))
        self.stream.write(payload)
        self.digest.update(payload)
        self.bytes_written += len(payload)

    def alias(self, from_component_id: int, to_component_id: int) -> None:
        if from_component_id == to_component_id:
            return
        self._write(
            {
                "record": "alias",
                "fromComponentId": from_component_id,
                "toComponentId": to_component_id,
            }
        )

    def run(self, component_id: int, row_index: int, x0: int, x1: int) -> None:
        self._write(
            {
                "record": "run",
                "componentId": component_id,
                "row": row_index,
                "x0": x0,
                "x1": x1,
            }
        )

    def component(self, component_id: int, first_cell: int, cell_count: int) -> None:
        self._write(
            {
                "record": "component",
                "componentId": component_id,
                "firstCell": first_cell,
                "cellCount": cell_count,
            }
        )

    def finish(self, inventory: dict[str, int | str]) -> dict[str, int | str]:
        self._write(
            {
                "record": "footer",
                "lossCellCount": inventory["lossCellCount"],
                "connectedComponentCount": inventory["connectedComponentCount"],
                "orderedLossRunSha256": inventory["orderedLossRunSha256"],
                "released": False,
                "productionEligible": False,
            }
        )
        self.stream.flush()
        os.fsync(self.stream.fileno())
        self.stream.close()
        try:
            os.link(self.partial_path, self.path, follow_symlinks=False)
        except FileExistsError as error:
            raise ValueError(f"Component lineage output appeared during execution: {self.path.name}") from error
        fsync_directory(self.path.parent)
        os.unlink(self.partial_path)
        fsync_directory(self.path.parent)
        return {
            "fileName": self.path.name,
            "byteLength": self.bytes_written,
            "sha256": self.digest.hexdigest(),
        }

    def close(self) -> None:
        if not self.stream.closed:
            self.stream.close()


class StitchInventory:
    """Keep only components touching the previous row; finalize everything else."""

    def __init__(self, width: int, lineage_writer: ComponentLineageWriter | None = None) -> None:
        self.width = width
        self.lineage_writer = lineage_writer
        self.previous_runs: list[tuple[int, int, int]] = []
        self.active: dict[int, tuple[int, int]] = {}
        self.active_component_ids: dict[int, int] = {}
        self.loss_cells = 0
        self.valid_non_loss_cells = 0
        self.nodata_cells = 0
        self.component_count = 0
        self.max_active_components = 0
        self.max_runs_in_row = 0
        self.run_digest = hashlib.sha256()

    def add_row(self, row_index: int, row: np.ndarray) -> None:
        values = set(map(int, np.unique(row)))
        if not values.issubset({0, 1, 255}):
            raise ValueError(f"Unexpected loss values: {sorted(values)}")
        self.valid_non_loss_cells += int(np.count_nonzero(row == 0))
        self.nodata_cells += int(np.count_nonzero(row == 255))
        current = row_runs(row)
        self.max_runs_in_row = max(self.max_runs_in_row, len(current))
        for x0, x1 in current:
            self.loss_cells += x1 - x0 + 1
            self.run_digest.update(f"{row_index}:{x0}:{x1}\n".encode())

        previous_count = len(self.active)
        current_count = len(current)
        parent = list(range(previous_count + current_count))

        def find(node: int) -> int:
            while parent[node] != node:
                parent[node] = parent[parent[node]]
                node = parent[node]
            return node

        def union(left: int, right: int) -> None:
            left_root, right_root = find(left), find(right)
            if left_root != right_root:
                parent[max(left_root, right_root)] = min(left_root, right_root)

        previous_labels = sorted(self.active)
        previous_node = {label: index for index, label in enumerate(previous_labels)}
        cursor = 0
        for current_index, (x0, x1) in enumerate(current):
            while cursor < len(self.previous_runs) and self.previous_runs[cursor][1] < x0:
                cursor += 1
            match = cursor
            while match < len(self.previous_runs) and self.previous_runs[match][0] <= x1:
                union(previous_node[self.previous_runs[match][2]], previous_count + current_index)
                match += 1

        groups: dict[int, dict[str, object]] = {}
        for label in previous_labels:
            root = find(previous_node[label])
            group = groups.setdefault(root, {"prior": [], "runs": []})
            group["prior"].append(label)  # type: ignore[union-attr]
        for index, run in enumerate(current):
            root = find(previous_count + index)
            group = groups.setdefault(root, {"prior": [], "runs": []})
            group["runs"].append((index, run))  # type: ignore[union-attr]

        surviving = [group for group in groups.values() if group["runs"]]
        self.component_count += sum(1 for group in groups.values() if not group["runs"])
        for group in groups.values():
            if group["runs"]:
                continue
            prior = group["prior"]
            for label in prior:  # A previous-row component cannot merge without a current run.
                component_id = self.active_component_ids[label]
                first_cell, cell_count = self.active[label]
                if self.lineage_writer is not None:
                    self.lineage_writer.component(component_id, first_cell, cell_count)
        ordered: list[tuple[int, dict[str, object]]] = []
        for group in surviving:
            prior = group["prior"]
            runs = group["runs"]
            first_cells = [self.active[label][0] for label in prior]  # type: ignore[arg-type]
            first_cells.extend(row_index * self.width + run[0] for _, run in runs)  # type: ignore[union-attr]
            prior_component_ids = [self.active_component_ids[label] for label in prior]  # type: ignore[arg-type]
            current_component_ids = [row_index * self.width + run[1][0] for run in runs]  # type: ignore[union-attr]
            component_id = min([*prior_component_ids, *current_component_ids])
            if self.lineage_writer is not None:
                for prior_component_id in sorted(prior_component_ids):
                    self.lineage_writer.alias(prior_component_id, component_id)
                for _, run in runs:  # type: ignore[union-attr]
                    self.lineage_writer.run(component_id, row_index, run[0], run[1])
            ordered.append((min(first_cells), group, component_id))
        ordered.sort(key=lambda item: item[0])

        next_active: dict[int, tuple[int, int]] = {}
        next_component_ids: dict[int, int] = {}
        run_labels: dict[int, int] = {}
        for next_label, (first_cell, group, component_id) in enumerate(ordered):
            prior = group["prior"]
            runs = group["runs"]
            cell_count = sum(self.active[label][1] for label in prior)  # type: ignore[arg-type]
            cell_count += sum(run[1] - run[0] + 1 for _, run in runs)  # type: ignore[union-attr]
            next_active[next_label] = (first_cell, cell_count)
            next_component_ids[next_label] = component_id
            for index, _ in runs:  # type: ignore[union-attr]
                run_labels[index] = next_label
        self.active = next_active
        self.active_component_ids = next_component_ids
        self.previous_runs = [(x0, x1, run_labels[index]) for index, (x0, x1) in enumerate(current)]
        self.max_active_components = max(self.max_active_components, len(self.active))

    def finish(self) -> dict[str, int | str]:
        if self.lineage_writer is not None:
            for label in sorted(self.active, key=lambda key: self.active[key][0]):
                component_id = self.active_component_ids[label]
                first_cell, cell_count = self.active[label]
                self.lineage_writer.component(component_id, first_cell, cell_count)
        return {
            "lossCellCount": self.loss_cells,
            "connectedComponentCount": self.component_count + len(self.active),
            "validNonLossCellCount": self.valid_non_loss_cells,
            "nodataCellCount": self.nodata_cells,
            "orderedLossRunSha256": self.run_digest.hexdigest(),
            "maxActiveComponents": self.max_active_components,
            "maxRunsInOneRow": self.max_runs_in_row,
        }


def inventory_rows(rows: np.ndarray, width: int) -> dict[str, int | str]:
    inventory = StitchInventory(width)
    for row_index, row in enumerate(rows):
        inventory.add_row(row_index, row)
    return inventory.finish()


def identity_from_stat(result: os.stat_result) -> FileIdentity:
    if not stat.S_ISREG(result.st_mode):
        raise ValueError("Loss raster must remain a regular file.")
    return (result.st_dev, result.st_ino, result.st_size, result.st_mtime_ns)


def file_identity(path: Path) -> FileIdentity:
    if path.is_symlink():
        raise ValueError("Loss raster must remain a non-symlink file.")
    return identity_from_stat(os.stat(path, follow_symlinks=False))


def sha256_file_with_identity(path: Path, deadline: float | None = None) -> tuple[str, FileIdentity]:
    before = file_identity(path)
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        opened = identity_from_stat(os.fstat(stream.fileno()))
        if opened != before:
            raise ValueError("Loss raster identity changed while opening for hashing.")
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            if deadline is not None and time.monotonic() >= deadline:
                raise TimeoutError("Inventory exceeded its approved wall-time cap while hashing input.")
            digest.update(chunk)
        after_read = identity_from_stat(os.fstat(stream.fileno()))
    after = file_identity(path)
    if before != opened or opened != after_read or after_read != after:
        raise ValueError("Loss raster identity changed during hashing.")
    return digest.hexdigest(), before


def sha256_file(path: Path, deadline: float | None = None) -> str:
    return sha256_file_with_identity(path, deadline)[0]


def verify_source_unchanged(
    path: Path,
    expected_sha256: str,
    expected_identity: FileIdentity,
    deadline: float,
) -> None:
    observed_sha256, observed_identity = sha256_file_with_identity(path, deadline)
    if observed_identity != expected_identity:
        raise ValueError("Loss raster identity changed during inventory.")
    if observed_sha256 != expected_sha256:
        raise ValueError("Loss raster bytes changed during inventory.")


def canonical_loss_sha(from_year: int, to_year: int) -> str:
    map_path = Path(__file__).parent.parent / "data" / "phase2-real-loss-source-map.json"
    map_bytes = map_path.read_bytes()
    if hashlib.sha256(map_bytes).hexdigest() != LOSS_MAP_SHA256:
        raise ValueError("Canonical loss-source map checksum changed.")
    source_map = json.loads(map_bytes)
    matches = [row[2] for row in source_map["pairs"] if row[:2] == [from_year, to_year]]
    if len(matches) != 1:
        raise ValueError("Year pair is not canonical.")
    return matches[0]


def canonical_loss_pairs() -> list[tuple[int, int, str]]:
    """Return the ordered, checksum-pinned adjacent national loss pairs."""
    map_path = Path(__file__).parent.parent / "data" / "phase2-real-loss-source-map.json"
    map_bytes = map_path.read_bytes()
    if hashlib.sha256(map_bytes).hexdigest() != LOSS_MAP_SHA256:
        raise ValueError("Canonical loss-source map checksum changed.")
    source_map = json.loads(map_bytes)
    pairs = [tuple(row) for row in source_map.get("pairs", [])]
    if len(pairs) != CANONICAL_PAIR_COUNT:
        raise ValueError("Canonical loss-source map pair count changed.")
    expected = [(1984 + index, 1985 + index) for index in range(CANONICAL_PAIR_COUNT)]
    if [(row[0], row[1]) for row in pairs] != expected:
        raise ValueError("Canonical loss-source map order or year range changed.")
    return [(int(from_year), int(to_year), str(sha256)) for from_year, to_year, sha256 in pairs]


def fixture_rows(value: object) -> np.ndarray:
    """Validate fixture cells before any NumPy conversion can coerce them."""
    if not isinstance(value, list) or not value or not isinstance(value[0], list) or not value[0]:
        raise ValueError("Fixture must be a non-empty rectangular matrix.")
    width = len(value[0])
    for row in value:
        if not isinstance(row, list) or len(row) != width:
            raise ValueError("Fixture must be a non-empty rectangular matrix.")
        for cell in row:
            if type(cell) is not int or cell not in {0, 1, 255}:
                raise ValueError("Fixture cells must be exact integers 0, 1, or 255.")
    return np.asarray(value, dtype=np.uint8)


def preflight_all_pair_paths(
    input_root: Path,
    components_root: Path | None,
    deadline: float,
) -> list[tuple[int, int, str, Path, Path | None]]:
    """Validate every canonical input checksum and every output name before writing."""
    prepared = [
        (
            from_year,
            to_year,
            expected_sha,
            input_root / f"detected-forest-loss-{from_year}-{to_year}.tif",
            components_root / f"detected-forest-loss-{from_year}-{to_year}.components.jsonl"
            if components_root is not None
            else None,
        )
        for from_year, to_year, expected_sha in canonical_loss_pairs()
    ]
    for _, _, _, _, lineage_path in prepared:
        if lineage_path is not None:
            validate_lineage_target(lineage_path)
    for _, _, _, path, _ in prepared:
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"Canonical loss raster is missing or symlinked: {path.name}")
    for _, _, expected_sha, path, _ in prepared:
        if sha256_file(path, deadline) != expected_sha:
            raise ValueError(f"Canonical loss raster SHA-256 changed: {path.name}")
    return prepared


def inventory_raster(
    path: Path,
    from_year: int,
    to_year: int,
    block_rows: int,
    deadline: float,
    lineage_path: Path | None = None,
    lineage_budget: LineageByteBudget | None = None,
) -> dict[str, object]:
    if time.monotonic() >= deadline:
        raise TimeoutError("Inventory exceeded its approved wall-time cap before hashing input.")
    if path.is_symlink() or not path.is_file():
        raise ValueError("Loss raster must be an existing non-symlink file.")
    expected_sha = canonical_loss_sha(from_year, to_year)
    observed_sha, source_identity = sha256_file_with_identity(path, deadline)
    if observed_sha != expected_sha:
        raise ValueError("Loss raster SHA-256 does not match its canonical year pair.")
    gdal.SetCacheMax(64 * 1024 * 1024)
    dataset = gdal.Open(str(path), gdal.GA_ReadOnly)
    if dataset.RasterXSize != GRID_WIDTH or dataset.RasterYSize != GRID_HEIGHT:
        raise ValueError("Loss raster grid changed.")
    band = dataset.GetRasterBand(1)
    if band.DataType != gdal.GDT_Byte or band.GetNoDataValue() != 255:
        raise ValueError("Loss raster type or nodata changed.")
    writer = None
    if lineage_path is not None:
        writer = ComponentLineageWriter(
            lineage_path,
            from_year,
            to_year,
            expected_sha,
            GRID_WIDTH,
            GRID_HEIGHT,
            lineage_budget or LineageByteBudget(LINEAGE_BYTE_CAP),
        )
    inventory = StitchInventory(GRID_WIDTH, writer)
    try:
        for y_offset in range(0, GRID_HEIGHT, block_rows):
            if time.monotonic() >= deadline:
                raise TimeoutError("Inventory exceeded its approved 96-hour wall-time cap.")
            height = min(block_rows, GRID_HEIGHT - y_offset)
            block = band.ReadAsArray(0, y_offset, GRID_WIDTH, height)
            for local_row, row in enumerate(block):
                inventory.add_row(y_offset + local_row, row)
        inventory_result = inventory.finish()
        verify_source_unchanged(path, expected_sha, source_identity, deadline)
        lineage_result = writer.finish(inventory_result) if writer is not None else None
    except Exception:
        if writer is not None:
            writer.close()
        raise
    result: dict[str, object] = {
        "schemaVersion": "witness-tree/phase2-real-loss-component-inventory/1",
        "pair": [from_year, to_year],
        "sourceLossSha256": expected_sha,
        "connectivity": 4,
        "grid": [GRID_WIDTH, GRID_HEIGHT],
        "blockRows": block_rows,
        "algorithmicBounds": {
            "gdalCacheBytes": 64 * 1024 * 1024,
            "rowsHeld": block_rows,
            "componentStateScope": "previous-and-current-row-only",
            "scratchBytes": 0,
        },
        "inventory": inventory_result,
        "released": False,
        "productionEligible": False,
    }
    if lineage_result is not None:
        result["componentLineage"] = lineage_result
    return result


def inventory_all_pairs(
    input_root: Path,
    block_rows: int,
    max_seconds: int,
    components_root: Path | None = None,
    max_lineage_bytes: int = LINEAGE_BYTE_CAP,
) -> dict[str, object]:
    """Inventory every canonical pair sequentially under one aggregate deadline."""
    if input_root.is_symlink() or not input_root.is_dir():
        raise ValueError("Loss input root must be a non-symlink directory.")
    if components_root is not None and (components_root.is_symlink() or not components_root.is_dir()):
        raise ValueError("Component lineage root must be an existing non-symlink directory.")
    if not 1 <= max_lineage_bytes <= LINEAGE_BYTE_CAP:
        raise ValueError("Component lineage byte cap is outside the approved 2 TiB bound.")
    deadline = time.monotonic() + max_seconds
    lineage_budget = LineageByteBudget(max_lineage_bytes)
    completed: list[dict[str, object]] = []
    stopped = False
    stop_reason: str | None = None
    try:
        prepared = preflight_all_pair_paths(input_root, components_root, deadline)
    except TimeoutError:
        prepared = []
        stopped = True
        stop_reason = "aggregate-deadline-reached-during-preflight"
    for from_year, to_year, _, path, lineage_path in prepared:
        if time.monotonic() >= deadline:
            stopped = True
            stop_reason = "aggregate-deadline-reached"
            break
        try:
            completed.append(
                inventory_raster(path, from_year, to_year, block_rows, deadline, lineage_path, lineage_budget)
            )
        except TimeoutError:
            stopped = True
            stop_reason = "aggregate-deadline-reached"
            break
    result: dict[str, object] = {
        "schemaVersion": "witness-tree/phase2-real-loss-component-inventory-batch/1",
        "status": "stopped-before-completion" if stopped else "completed",
        "canonicalPairCount": CANONICAL_PAIR_COUNT,
        "completedPairCount": len(completed),
        "pairs": completed,
        "blockRows": block_rows,
        "aggregateMaxSeconds": max_seconds,
        "scratchBytes": 0,
        "released": False,
        "productionEligible": False,
    }
    if components_root is not None:
        result["componentLineage"] = {
            "directoryName": components_root.name,
            "maxBytes": max_lineage_bytes,
            "usedBytes": lineage_budget.used,
        }
    if stop_reason is not None:
        result["stopReason"] = stop_reason
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture-json")
    parser.add_argument("--input", type=Path)
    parser.add_argument("--all-pairs", action="store_true")
    parser.add_argument("--input-root", type=Path)
    parser.add_argument("--components-jsonl", type=Path)
    parser.add_argument("--components-root", type=Path)
    parser.add_argument("--max-lineage-bytes", type=int, default=LINEAGE_BYTE_CAP)
    parser.add_argument("--from-year", type=int)
    parser.add_argument("--to-year", type=int)
    parser.add_argument("--block-rows", type=int, default=32)
    parser.add_argument("--max-seconds", type=int, default=MAX_SECONDS)
    args = parser.parse_args()
    if not 1 <= args.block_rows <= 64 or not 1 <= args.max_seconds <= MAX_SECONDS:
        raise ValueError("Inventory block or time cap is outside the approved bound.")
    if not 1 <= args.max_lineage_bytes <= LINEAGE_BYTE_CAP:
        raise ValueError("Component lineage byte cap is outside the approved 2 TiB bound.")
    if args.all_pairs:
        if (
            args.fixture_json is not None
            or args.input is not None
            or args.components_jsonl is not None
            or args.input_root is None
        ):
            parser.error("all-pairs mode requires --input-root and no single-pair or fixture input")
        result = inventory_all_pairs(
            args.input_root,
            args.block_rows,
            args.max_seconds,
            args.components_root,
            args.max_lineage_bytes,
        )
    elif args.fixture_json is not None:
        rows = fixture_rows(json.loads(args.fixture_json))
        if args.components_root is not None:
            parser.error("fixture mode accepts --components-jsonl, not --components-root")
        if args.components_jsonl is None:
            result = {"fixtureOnly": True, "grid": list(rows.shape[::-1]), "inventory": inventory_rows(rows, rows.shape[1])}
        else:
            writer = ComponentLineageWriter(
                args.components_jsonl,
                0,
                1,
                "fixture-only",
                int(rows.shape[1]),
                int(rows.shape[0]),
                LineageByteBudget(args.max_lineage_bytes),
            )
            inventory = StitchInventory(int(rows.shape[1]), writer)
            try:
                for row_index, row in enumerate(rows):
                    inventory.add_row(row_index, row)
                inventory_result = inventory.finish()
                lineage_result = writer.finish(inventory_result)
            except Exception:
                writer.close()
                raise
            result = {
                "fixtureOnly": True,
                "grid": list(rows.shape[::-1]),
                "inventory": inventory_result,
                "componentLineage": lineage_result,
            }
    else:
        if args.input is None or args.from_year is None or args.to_year is None:
            parser.error("real inventory requires --input, --from-year, and --to-year")
        if args.to_year != args.from_year + 1 or args.from_year < 1984 or args.to_year > 2022:
            raise ValueError("Inventory requires one canonical adjacent 1984-2022 year pair.")
        if args.components_root is not None:
            parser.error("single-pair mode accepts --components-jsonl, not --components-root")
        result = inventory_raster(
            args.input,
            args.from_year,
            args.to_year,
            args.block_rows,
            time.monotonic() + args.max_seconds,
            args.components_jsonl,
            LineageByteBudget(args.max_lineage_bytes),
        )
    print(json.dumps(result, separators=(",", ":"), sort_keys=True))


if __name__ == "__main__":
    main()
