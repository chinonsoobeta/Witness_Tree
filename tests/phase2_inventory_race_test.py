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
        descriptor, expected_identity = inventory.open_source_descriptor(source)
        expected_sha256, hashed_identity = inventory.sha256_descriptor(descriptor)
        self.assertEqual(hashed_identity, expected_identity)
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
        return source, descriptor, expected_sha256, expected_identity, final, writer

    def assert_partial_only(self, final: Path) -> None:
        self.assertFalse(final.exists())
        self.assertTrue(inventory.partial_lineage_path(final).is_file())

    def test_same_path_mutation_cannot_publish_final_lineage(self) -> None:
        with tempfile.TemporaryDirectory(prefix="witness-phase2-mutation-") as directory:
            source, descriptor, expected_sha256, expected_identity, final, writer = self.prepare(Path(directory))
            try:
                source.write_bytes(b"mutated!!")
                with self.assertRaisesRegex(ValueError, "identity changed|bytes changed"):
                    inventory.verify_descriptor_unchanged(
                        descriptor, expected_sha256, expected_identity, time.monotonic() + 60
                    )
                writer.close()
                self.assert_partial_only(final)
            finally:
                writer.close()
                os.close(descriptor)

    def test_transient_replace_process_restore_cannot_publish_final_lineage(self) -> None:
        with tempfile.TemporaryDirectory(prefix="witness-phase2-replacement-") as directory:
            root = Path(directory)
            source = root / "source.tif"
            replacement = root / "replacement.tif"
            driver = inventory.gdal.GetDriverByName("GTiff")
            for path, value in [(source, 1), (replacement, 0)]:
                dataset = driver.Create(str(path), 1, 1, 1, inventory.gdal.GDT_Byte)
                dataset.GetRasterBand(1).WriteArray(inventory.np.asarray([[value]], dtype=inventory.np.uint8))
                dataset.FlushCache()
                dataset = None
            backup = root / "source-backup.tif"
            os.link(source, backup)
            descriptor, expected_identity = inventory.open_source_descriptor(source)
            expected_sha256, hashed_identity = inventory.sha256_descriptor(descriptor)
            self.assertEqual(hashed_identity, expected_identity)
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
            try:
                os.replace(replacement, source)
                dataset = inventory.gdal.Open(f"/dev/fd/{descriptor}", inventory.gdal.GA_ReadOnly)
                self.assertEqual(int(dataset.GetRasterBand(1).ReadAsArray(0, 0, 1, 1)[0, 0]), 1)
                dataset = None
                os.replace(backup, source)
                with self.assertRaisesRegex(ValueError, "identity changed"):
                    inventory.verify_descriptor_unchanged(
                        descriptor, expected_sha256, expected_identity, time.monotonic() + 60
                    )
                writer.close()
                self.assert_partial_only(final)
            finally:
                writer.close()
                os.close(descriptor)


if __name__ == "__main__":
    unittest.main()
