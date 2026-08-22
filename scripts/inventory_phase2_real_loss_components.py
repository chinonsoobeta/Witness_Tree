#!/usr/bin/env python3
"""Read-only, bounded-memory inventory of four-connected loss components."""

from __future__ import annotations

import argparse
import hashlib
import json
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


def row_runs(row: np.ndarray) -> list[tuple[int, int]]:
    """Return inclusive loss runs in increasing column order."""
    columns = np.flatnonzero(row == 1)
    if columns.size == 0:
        return []
    cuts = np.flatnonzero(np.diff(columns) > 1) + 1
    groups = np.split(columns, cuts)
    return [(int(group[0]), int(group[-1])) for group in groups]


class StitchInventory:
    """Keep only components touching the previous row; finalize everything else."""

    def __init__(self, width: int) -> None:
        self.width = width
        self.previous_runs: list[tuple[int, int, int]] = []
        self.active: dict[int, tuple[int, int]] = {}
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
        ordered: list[tuple[int, dict[str, object]]] = []
        for group in surviving:
            prior = group["prior"]
            runs = group["runs"]
            first_cells = [self.active[label][0] for label in prior]  # type: ignore[arg-type]
            first_cells.extend(row_index * self.width + run[0] for _, run in runs)  # type: ignore[union-attr]
            ordered.append((min(first_cells), group))
        ordered.sort(key=lambda item: item[0])

        next_active: dict[int, tuple[int, int]] = {}
        run_labels: dict[int, int] = {}
        for next_label, (first_cell, group) in enumerate(ordered):
            prior = group["prior"]
            runs = group["runs"]
            cell_count = sum(self.active[label][1] for label in prior)  # type: ignore[arg-type]
            cell_count += sum(run[1] - run[0] + 1 for _, run in runs)  # type: ignore[union-attr]
            next_active[next_label] = (first_cell, cell_count)
            for index, _ in runs:  # type: ignore[union-attr]
                run_labels[index] = next_label
        self.active = next_active
        self.previous_runs = [(x0, x1, run_labels[index]) for index, (x0, x1) in enumerate(current)]
        self.max_active_components = max(self.max_active_components, len(self.active))

    def finish(self) -> dict[str, int | str]:
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


def sha256_file(path: Path, deadline: float | None = None) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            if deadline is not None and time.monotonic() >= deadline:
                raise TimeoutError("Inventory exceeded its approved wall-time cap while hashing input.")
            digest.update(chunk)
    return digest.hexdigest()


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


def inventory_raster(path: Path, from_year: int, to_year: int, block_rows: int, deadline: float) -> dict[str, object]:
    if time.monotonic() >= deadline:
        raise TimeoutError("Inventory exceeded its approved wall-time cap before hashing input.")
    expected_sha = canonical_loss_sha(from_year, to_year)
    if sha256_file(path, deadline) != expected_sha:
        raise ValueError("Loss raster SHA-256 does not match its canonical year pair.")
    gdal.SetCacheMax(64 * 1024 * 1024)
    dataset = gdal.Open(str(path), gdal.GA_ReadOnly)
    if dataset.RasterXSize != GRID_WIDTH or dataset.RasterYSize != GRID_HEIGHT:
        raise ValueError("Loss raster grid changed.")
    band = dataset.GetRasterBand(1)
    if band.DataType != gdal.GDT_Byte or band.GetNoDataValue() != 255:
        raise ValueError("Loss raster type or nodata changed.")
    inventory = StitchInventory(GRID_WIDTH)
    for y_offset in range(0, GRID_HEIGHT, block_rows):
        if time.monotonic() >= deadline:
            raise TimeoutError("Inventory exceeded its approved 96-hour wall-time cap.")
        height = min(block_rows, GRID_HEIGHT - y_offset)
        block = band.ReadAsArray(0, y_offset, GRID_WIDTH, height)
        for local_row, row in enumerate(block):
            inventory.add_row(y_offset + local_row, row)
    return {
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
        "inventory": inventory.finish(),
        "released": False,
        "productionEligible": False,
    }


def inventory_all_pairs(input_root: Path, block_rows: int, max_seconds: int) -> dict[str, object]:
    """Inventory every canonical pair sequentially under one aggregate deadline."""
    if input_root.is_symlink() or not input_root.is_dir():
        raise ValueError("Loss input root must be a non-symlink directory.")
    deadline = time.monotonic() + max_seconds
    completed: list[dict[str, object]] = []
    stopped = False
    stop_reason: str | None = None
    for from_year, to_year, _ in canonical_loss_pairs():
        if time.monotonic() >= deadline:
            stopped = True
            stop_reason = "aggregate-deadline-reached"
            break
        path = input_root / f"detected-forest-loss-{from_year}-{to_year}.tif"
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"Canonical loss raster is missing or symlinked: {path.name}")
        try:
            completed.append(inventory_raster(path, from_year, to_year, block_rows, deadline))
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
    if stop_reason is not None:
        result["stopReason"] = stop_reason
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture-json")
    parser.add_argument("--input", type=Path)
    parser.add_argument("--all-pairs", action="store_true")
    parser.add_argument("--input-root", type=Path)
    parser.add_argument("--from-year", type=int)
    parser.add_argument("--to-year", type=int)
    parser.add_argument("--block-rows", type=int, default=32)
    parser.add_argument("--max-seconds", type=int, default=MAX_SECONDS)
    args = parser.parse_args()
    if not 1 <= args.block_rows <= 64 or not 1 <= args.max_seconds <= MAX_SECONDS:
        raise ValueError("Inventory block or time cap is outside the approved bound.")
    if args.all_pairs:
        if args.fixture_json is not None or args.input is not None or args.input_root is None:
            parser.error("all-pairs mode requires --input-root and no single-pair or fixture input")
        result = inventory_all_pairs(args.input_root, args.block_rows, args.max_seconds)
    elif args.fixture_json is not None:
        rows = np.asarray(json.loads(args.fixture_json), dtype=np.uint8)
        if rows.ndim != 2 or rows.shape[1] == 0:
            raise ValueError("Fixture must be a non-empty rectangular matrix.")
        result = {"fixtureOnly": True, "grid": list(rows.shape[::-1]), "inventory": inventory_rows(rows, rows.shape[1])}
    else:
        if args.input is None or args.from_year is None or args.to_year is None:
            parser.error("real inventory requires --input, --from-year, and --to-year")
        if args.to_year != args.from_year + 1 or args.from_year < 1984 or args.to_year > 2022:
            raise ValueError("Inventory requires one canonical adjacent 1984-2022 year pair.")
        result = inventory_raster(args.input, args.from_year, args.to_year, args.block_rows, time.monotonic() + args.max_seconds)
    print(json.dumps(result, separators=(",", ":"), sort_keys=True))


if __name__ == "__main__":
    main()
