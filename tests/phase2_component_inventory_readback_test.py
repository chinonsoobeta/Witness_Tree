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
        ordered_digest = hashlib.sha256(b"0:0:0\n0:2:2\n1:0:2\n").hexdigest()
        inventory = {"lossCellCount": 5, "connectedComponentCount": 1, "orderedLossRunSha256": ordered_digest}
        return [
            {"record": "header", "schemaVersion": "witness-tree/phase2-real-loss-component-lineage/1", "pair": [1984, 1985], "sourceLossSha256": "a" * 64, "grid": checker.GRID, "connectivity": 4, "encoding": "inclusive-x-runs", "released": False, "productionEligible": False},
            {"record": "run", "componentId": 0, "row": 0, "x0": 0, "x1": 0},
            {"record": "run", "componentId": 2, "row": 0, "x0": 2, "x1": 2},
            {"record": "alias", "fromComponentId": 2, "toComponentId": 0},
            {"record": "run", "componentId": 0, "row": 1, "x0": 0, "x1": 2},
            {"record": "component", "componentId": 0, "firstCell": 0, "cellCount": 5},
            {"record": "footer", "lossCellCount": 5, "connectedComponentCount": 1, "orderedLossRunSha256": ordered_digest, "released": False, "productionEligible": False},
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
        self.assertEqual(result["runRecordCount"], 3)
        self.assertEqual(result["aliasRecordCount"], 1)
        self.assertEqual(result["componentRecordCount"], 1)

    def test_noncanonical_bytes_fail_closed(self) -> None:
        records, inventory = self.records()
        with tempfile.TemporaryDirectory(prefix="witness-phase2-readback-bytes-") as directory:
            root = Path(directory)
            path = self.write(root, records)
            path.write_bytes(path.read_bytes().replace(b'"record":"run"', b'"record": "run"', 1))
            with self.assertRaisesRegex(ValueError, "non-canonical"):
                checker.readback_lineage(path, 1984, 1985, "a" * 64, inventory)

    def assert_rejected(self, records: list[dict[str, object]], inventory: dict[str, object], pattern: str) -> None:
        with tempfile.TemporaryDirectory(prefix="witness-phase2-readback-adversarial-") as directory:
            with self.assertRaisesRegex(ValueError, pattern):
                checker.readback_lineage(self.write(Path(directory), records), 1984, 1985, "a" * 64, inventory)

    def test_missing_dangling_and_duplicate_aliases_fail_closed(self) -> None:
        records, inventory = self.records()
        self.assert_rejected([*records[:3], *records[4:]], inventory, "exactly match")
        records, inventory = self.records()
        records[3]["fromComponentId"] = 3
        self.assert_rejected(records, inventory, "exactly match")
        records, inventory = self.records()
        records.insert(4, {"record": "alias", "fromComponentId": 2, "toComponentId": 0})
        self.assert_rejected(records, inventory, "exactly match")

    def test_cross_component_alias_cannot_merge_disconnected_groups(self) -> None:
        digest = hashlib.sha256(b"0:0:0\n0:4:4\n1:4:4\n").hexdigest()
        inventory = {"lossCellCount": 3, "connectedComponentCount": 2, "orderedLossRunSha256": digest}
        records, _ = self.records()
        records = [
            records[0],
            {"record": "run", "componentId": 0, "row": 0, "x0": 0, "x1": 0},
            {"record": "run", "componentId": 4, "row": 0, "x0": 4, "x1": 4},
            {"record": "alias", "fromComponentId": 4, "toComponentId": 0},
            {"record": "run", "componentId": 0, "row": 1, "x0": 4, "x1": 4},
            {"record": "component", "componentId": 0, "firstCell": 0, "cellCount": 3},
            {"record": "footer", "lossCellCount": 3, "connectedComponentCount": 2, "orderedLossRunSha256": digest, "released": False, "productionEligible": False},
        ]
        self.assert_rejected(records, inventory, "overlap groups|canonical root")

    def test_two_disconnected_overlap_groups_require_exact_aliases(self) -> None:
        digest = hashlib.sha256(b"0:0:0\n0:2:2\n0:4:4\n0:6:6\n1:0:2\n1:4:6\n").hexdigest()
        inventory = {"lossCellCount": 10, "connectedComponentCount": 2, "orderedLossRunSha256": digest}
        header = self.records()[0][0]
        records = [
            header,
            {"record": "run", "componentId": 0, "row": 0, "x0": 0, "x1": 0},
            {"record": "run", "componentId": 2, "row": 0, "x0": 2, "x1": 2},
            {"record": "run", "componentId": 4, "row": 0, "x0": 4, "x1": 4},
            {"record": "run", "componentId": 6, "row": 0, "x0": 6, "x1": 6},
            {"record": "alias", "fromComponentId": 2, "toComponentId": 0},
            {"record": "run", "componentId": 0, "row": 1, "x0": 0, "x1": 2},
            {"record": "alias", "fromComponentId": 6, "toComponentId": 4},
            {"record": "run", "componentId": 4, "row": 1, "x0": 4, "x1": 6},
            {"record": "component", "componentId": 0, "firstCell": 0, "cellCount": 5},
            {"record": "component", "componentId": 4, "firstCell": 4, "cellCount": 5},
            {"record": "footer", "lossCellCount": 10, "connectedComponentCount": 2, "orderedLossRunSha256": digest, "released": False, "productionEligible": False},
        ]
        with tempfile.TemporaryDirectory(prefix="witness-phase2-readback-two-groups-") as directory:
            result = checker.readback_lineage(self.write(Path(directory), records), 1984, 1985, "a" * 64, inventory)
        self.assertEqual(result["componentRecordCount"], 2)
        self.assert_rejected([*records[:5], *records[6:]], inventory, "exactly match")
        extra = [dict(record) for record in records]
        extra.insert(6, {"record": "alias", "fromComponentId": 4, "toComponentId": 0})
        self.assert_rejected(extra, inventory, "exactly match")
        wrong = [dict(record) for record in records]
        wrong[7] = {"record": "alias", "fromComponentId": 6, "toComponentId": 0}
        self.assert_rejected(wrong, inventory, "exactly match")

    def test_alias_endpoint_reversal_fail_closed(self) -> None:
        records, inventory = self.records()
        records[3] = {"record": "alias", "fromComponentId": 0, "toComponentId": 2}
        self.assert_rejected(records, inventory, "strictly descending")
        records, inventory = self.records()
        records[3] = {"record": "alias", "fromComponentId": 2, "toComponentId": 2}
        self.assert_rejected(records, inventory, "strictly descending")

    def test_duplicate_and_cross_component_summary_drift_fail_closed(self) -> None:
        records, inventory = self.records()
        records[5]["cellCount"] = 4
        self.assert_rejected(records, inventory, "differs from.*runs")
        records, inventory = self.records()
        self.assert_rejected([*records[:5], records[6]], inventory, "unfinalized")
        records, inventory = self.records()
        records.insert(6, dict(records[5]))
        self.assert_rejected(records, inventory, "duplicate|finalized")
        records, inventory = self.records()
        records[5].update({"componentId": 2, "firstCell": 2})
        self.assert_rejected(records, inventory, "dangling|finalized")


if __name__ == "__main__":
    unittest.main()
