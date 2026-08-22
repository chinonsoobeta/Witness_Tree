#!/usr/bin/env python3
"""Focused tests for exact component-lineage readback."""

from __future__ import annotations

import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parent.parent / "scripts" / "check_phase2_real_loss_component_inventory.py"
SPEC = importlib.util.spec_from_file_location("phase2_component_readback", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
checker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(checker)


class ComponentReadbackTest(unittest.TestCase):
    def records(self) -> tuple[list[dict[str, object]], dict[str, object]]:
        ordered_digest = hashlib.sha256(b"0:0:0\n1:0:1\n").hexdigest()
        inventory = {"lossCellCount": 3, "connectedComponentCount": 2, "orderedLossRunSha256": ordered_digest}
        return [
            {"record": "header", "schemaVersion": "witness-tree/phase2-real-loss-component-lineage/1", "pair": [1984, 1985], "sourceLossSha256": "a" * 64, "grid": checker.GRID, "connectivity": 4, "encoding": "inclusive-x-runs", "released": False, "productionEligible": False},
            {"record": "run", "componentId": 0, "row": 0, "x0": 0, "x1": 0},
            {"record": "component", "componentId": 5, "firstCell": 5, "cellCount": 1},
            {"record": "run", "componentId": 0, "row": 1, "x0": 0, "x1": 1},
            {"record": "alias", "fromComponentId": 1, "toComponentId": 0},
            {"record": "component", "componentId": 0, "firstCell": 0, "cellCount": 2},
            {"record": "footer", "lossCellCount": 3, "connectedComponentCount": 2, "orderedLossRunSha256": ordered_digest, "released": False, "productionEligible": False},
        ], inventory

    def write(self, root: Path, records: list[dict[str, object]]) -> Path:
        path = root / "lineage.jsonl"
        path.write_bytes(b"".join(checker.canonical_json(record) for record in records))
        return path

    def test_exact_stream_reconciles_runs_components_aliases_and_digest(self) -> None:
        records, inventory = self.records()
        with tempfile.TemporaryDirectory(prefix="witness-phase2-readback-") as directory:
            result = checker.readback_lineage(self.write(Path(directory), records), 1984, 1985, "a" * 64, inventory)
        self.assertEqual(result["recordCount"], 7)
        self.assertEqual(result["runRecordCount"], 2)
        self.assertEqual(result["aliasRecordCount"], 1)
        self.assertEqual(result["componentRecordCount"], 2)

    def test_component_grouped_runs_replay_in_bounded_raster_order(self) -> None:
        records, inventory = self.records()
        records[1].update({"row": 0, "x0": 2, "x1": 3})
        records[3].update({"row": 0, "x0": 0, "x1": 0})
        ordered_digest = hashlib.sha256(b"0:0:0\n0:2:3\n").hexdigest()
        records[-1]["orderedLossRunSha256"] = ordered_digest
        inventory["orderedLossRunSha256"] = ordered_digest
        with tempfile.TemporaryDirectory(prefix="witness-phase2-readback-order-") as directory:
            result = checker.readback_lineage(self.write(Path(directory), records), 1984, 1985, "a" * 64, inventory)
        self.assertEqual(result["runRecordCount"], 2)

    def test_noncanonical_bytes_and_semantic_drift_fail_closed(self) -> None:
        records, inventory = self.records()
        with tempfile.TemporaryDirectory(prefix="witness-phase2-readback-negative-") as directory:
            root = Path(directory)
            path = self.write(root, records)
            path.write_bytes(path.read_bytes().replace(b'"record":"run"', b'"record": "run"', 1))
            with self.assertRaisesRegex(ValueError, "non-canonical"):
                checker.readback_lineage(path, 1984, 1985, "a" * 64, inventory)
            path.unlink()
            records[4]["toComponentId"] = 2
            path = self.write(root, records)
            with self.assertRaisesRegex(ValueError, "strictly descending"):
                checker.readback_lineage(path, 1984, 1985, "a" * 64, inventory)


if __name__ == "__main__":
    unittest.main()
