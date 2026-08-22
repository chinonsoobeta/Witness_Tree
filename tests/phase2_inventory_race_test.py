#!/usr/bin/env python3
"""Focused source-identity race tests for the Phase 2 inventory writer."""

from __future__ import annotations

import importlib.util
import os
import tempfile
import time
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parent.parent / "scripts" / "inventory_phase2_real_loss_components.py"
SPEC = importlib.util.spec_from_file_location("phase2_inventory", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
inventory = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(inventory)


class SourceRaceTest(unittest.TestCase):
    def prepare(self, root: Path):
        source = root / "source.tif"
        source.write_bytes(b"canonical")
        expected_sha256, expected_identity = inventory.sha256_file_with_identity(source)
        final = root / "component-lineage.jsonl"
        writer = inventory.ComponentLineageWriter(
            final,
            0,
            1,
            expected_sha256,
            1,
            1,
            inventory.LineageByteBudget(1024 * 1024),
        )
        writer.run(0, 0, 0, 0)
        return source, expected_sha256, expected_identity, final, writer

    def assert_partial_only(self, final: Path) -> None:
        self.assertFalse(final.exists())
        self.assertTrue(inventory.partial_lineage_path(final).is_file())

    def test_same_path_mutation_cannot_publish_final_lineage(self) -> None:
        with tempfile.TemporaryDirectory(prefix="witness-phase2-mutation-") as directory:
            source, expected_sha256, expected_identity, final, writer = self.prepare(Path(directory))
            source.write_bytes(b"mutated!!")
            with self.assertRaisesRegex(ValueError, "identity changed|bytes changed"):
                inventory.verify_source_unchanged(source, expected_sha256, expected_identity, time.monotonic() + 60)
            writer.close()
            self.assert_partial_only(final)

    def test_same_bytes_replacement_inode_cannot_publish_final_lineage(self) -> None:
        with tempfile.TemporaryDirectory(prefix="witness-phase2-replacement-") as directory:
            root = Path(directory)
            source, expected_sha256, expected_identity, final, writer = self.prepare(root)
            replacement = root / "replacement.tif"
            replacement.write_bytes(b"canonical")
            os.replace(replacement, source)
            with self.assertRaisesRegex(ValueError, "identity changed"):
                inventory.verify_source_unchanged(source, expected_sha256, expected_identity, time.monotonic() + 60)
            writer.close()
            self.assert_partial_only(final)


if __name__ == "__main__":
    unittest.main()
