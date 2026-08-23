from __future__ import annotations

import hashlib
import json
import os
import stat
import struct
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import scripts.run_phase2_patch_event_pilot as pilot_runner

from scripts.run_phase2_patch_event_pilot import (
    EXACT_LIMITS,
    LINEAGE_SHA256,
    LOSS_SHA256,
    MAX_COMPONENTS,
    MAX_MEMORY_BYTES,
    MAX_OUTPUT_BYTES,
    MAX_SCRATCH_BYTES,
    MAX_SECONDS,
    MAX_VCPU,
    MAX_WHOLE_RUN_COPIES,
    RUN,
    SORT_CHUNK_BYTES,
    PilotLimits,
    canonical_json,
    compact_event,
    patch_checksum,
    readback_output,
    run_pilot,
    supervise_pilot,
    validate_limits,
)

PROJECT_ROOT = Path(__file__).parent.parent


def slow_pilot_child(connection, *args) -> None:
    os.setsid()
    time.sleep(5)


def fixture_lineage() -> bytes:
    records = [
        {
            "record": "header",
            "schemaVersion": "witness-tree/phase2-real-loss-component-lineage/1",
            "pair": [1984, 1985],
            "sourceLossSha256": LOSS_SHA256,
        },
        {"componentId": 4, "record": "run", "row": 0, "x0": 4, "x1": 4},
        {"cellCount": 1, "componentId": 4, "firstCell": 4, "record": "component"},
        {"componentId": 0, "record": "run", "row": 0, "x0": 0, "x1": 0},
        {"fromComponentId": 1, "record": "alias", "toComponentId": 0},
        {"componentId": 1, "record": "run", "row": 0, "x0": 1, "x1": 1},
        {"cellCount": 2, "componentId": 0, "firstCell": 0, "record": "component"},
        {
            "connectedComponentCount": 2,
            "lossCellCount": 3,
            "productionEligible": False,
            "record": "footer",
            "released": False,
        },
    ]
    return b"".join(canonical_json(record) for record in records)


class PilotRunnerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="witness-phase2-pilot-")
        self.root = Path(self.temporary.name)
        os.chmod(self.root, 0o700)
        self.loss = self.root / "loss.tif"
        self.lineage = self.root / "lineage.jsonl"
        self.loss.write_bytes(b"exact fixture loss bytes")
        self.lineage.write_bytes(fixture_lineage())
        self.loss_sha = hashlib.sha256(self.loss.read_bytes()).hexdigest()
        self.lineage_sha = hashlib.sha256(self.lineage.read_bytes()).hexdigest()
        self.limits = PilotLimits(components=2, sort_chunk_bytes=60)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def execute(self, name: str = "pilot.wtpe", limits: PilotLimits | None = None):
        return run_pilot(
            self.loss,
            self.lineage,
            self.root / name,
            expected_loss_sha256=self.loss_sha,
            expected_lineage_sha256=self.lineage_sha,
            limits=limits or self.limits,
        )

    def test_exact_runner_is_atomic_compact_and_read_back(self) -> None:
        result = self.execute()
        output = self.root / "pilot.wtpe"
        self.assertTrue(output.is_file())
        self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
        self.assertFalse((self.root / "pilot.wtpe.partial").exists())
        self.assertFalse((self.root / "pilot.wtpe.scratch.partial").exists())
        self.assertEqual(RUN.size, 20)
        self.assertEqual(result["readback"]["componentCount"], 2)
        self.assertEqual(result["readback"]["runCount"], 3)
        self.assertEqual(result["readback"]["lossCellCount"], 3)
        self.assertLessEqual(result["readback"]["byteLength"], MAX_OUTPUT_BYTES)
        self.assertEqual(result["telemetry"]["maximumWholeRunCopies"], 2)
        self.assertEqual(result["readback"]["operationTelemetry"]["record"], "whole-operation-telemetry")
        self.assertEqual(
            result["readback"]["operationTelemetry"]["candidateFileSha256"],
            result["telemetry"]["candidateFileSha256"],
        )
        self.assertEqual(result["readback"]["telemetryBoundSha256"], result["telemetry"]["telemetryBoundSha256"])
        self.assertFalse(result["released"])
        self.assertFalse(result["productionEligible"])

    def test_compact_events_are_exact_real_detected_change_events(self) -> None:
        fixtures = [
            (0, [(0, 0, 0, 1)], 2, "7416e07869647bb0f79b91d0857e8270ce9e1fee52fbd2b40f712db166ba54c9"),
            (4, [(4, 0, 4, 4)], 1, "4e430ae3fdce85c88bd7bb61cc9460a9a09f9c8bf52c9a8658d6e4a579677cb1"),
            (193936 * 128340 - 2, [(193936 * 128340 - 2, 128339, 193934, 193935)], 2, "68d763ee511088d2fa18a7357e9d7b7e58437e2c7129c9889baa9ce753c7fd79"),
            (0, [(0, 0, 0, 0), (0, 1, 0, 0)], 2, "bd9ae7fa9bff1dc45790818ac479c4f79c2a8264afee9ce7e0abeca968aa316f"),
        ]
        for root, runs, cells, test_owned_node_contract_digest in fixtures:
            with self.subTest(root=root):
                self.assertEqual(patch_checksum(runs), test_owned_node_contract_digest)
                event = compact_event(root, root, cells, runs)
                self.assertEqual(event["patchChecksumSha256"], test_owned_node_contract_digest)
                self.assertEqual(event["eventId"], f"detected-change-1985-{test_owned_node_contract_digest[:24]}")
                self.assertEqual(event["cellIndices"]["cellCount"], cells)
                self.assertEqual(event["geometry"]["type"], "MultiPolygon")
                self.assertEqual(event["areaHectares"], cells * 0.09)
                self.assertEqual(event["eventStart"], "1985-01-01")
                self.assertEqual(event["eventEnd"], "1985-12-31")
                self.assertEqual(event["evidence"], "satellite-observation")
                self.assertEqual(event["lineage"]["sourceLossSha256"], LOSS_SHA256)

    def test_output_scratch_and_copy_caps_leave_no_final_name(self) -> None:
        cases = [
            ("output.wtpe", PilotLimits(components=2, output_bytes=1, sort_chunk_bytes=60)),
            ("scratch.wtpe", PilotLimits(components=2, scratch_bytes=39, sort_chunk_bytes=60)),
            ("copies.wtpe", PilotLimits(components=2, sort_chunk_bytes=60, whole_run_copies=1)),
        ]
        for name, limits in cases:
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.execute(name, limits)
            self.assertFalse((self.root / name).exists())
            self.assertTrue(
                (self.root / f"{name}.partial").exists()
                or (self.root / f"{name}.scratch.partial").exists()
            )

    def test_encoding_and_exact_integer_drift_fail_closed(self) -> None:
        for changed in [
            fixture_lineage().replace(b'"row":0', b'"row":0.0', 1),
            fixture_lineage().replace(b'"x0":1', b'"x0":true', 1),
            fixture_lineage() + b"not-json\n",
        ]:
            with self.subTest(changed=changed[-20:]):
                self.lineage.write_bytes(changed)
                changed_sha = hashlib.sha256(changed).hexdigest()
                with self.assertRaises(ValueError):
                    run_pilot(
                        self.loss,
                        self.lineage,
                        self.root / f"bad-{changed_sha[:8]}.wtpe",
                        expected_loss_sha256=self.loss_sha,
                        expected_lineage_sha256=changed_sha,
                        limits=self.limits,
                    )
        self.assertEqual(RUN.format, "<QIII")

    def test_path_permissions_symlinks_and_occupied_names_are_rejected_before_write(self) -> None:
        open_parent = self.root / "open"
        open_parent.mkdir(mode=0o755)
        os.chmod(open_parent, 0o755)
        with self.assertRaisesRegex(ValueError, "mode 700"):
            run_pilot(
                self.loss,
                self.lineage,
                open_parent / "pilot.wtpe",
                expected_loss_sha256=self.loss_sha,
                expected_lineage_sha256=self.lineage_sha,
                limits=self.limits,
            )
        occupied = self.root / "occupied.wtpe.partial"
        occupied.write_bytes(b"owner checkpoint")
        with self.assertRaisesRegex(ValueError, "unused"):
            self.execute("occupied.wtpe")
        target = self.root / "target"
        target.write_bytes(b"not an output")
        symlink = self.root / "linked.wtpe"
        symlink.symlink_to(target)
        with self.assertRaisesRegex(ValueError, "unused"):
            self.execute("linked.wtpe")

    def test_readback_rejects_one_byte_run_corruption(self) -> None:
        self.execute("corrupt.wtpe")
        output = self.root / "corrupt.wtpe"
        payload = bytearray(output.read_bytes())
        header_size = struct.unpack("<I", payload[9:13])[0]
        component_offset = 13 + header_size
        self.assertEqual(payload[component_offset], ord("E"))
        event_size = struct.unpack("<I", payload[component_offset + 1:component_offset + 5])[0]
        run_offset = component_offset + 5 + event_size
        self.assertEqual(payload[run_offset], ord("R"))
        payload[run_offset + 1] ^= 1
        output.write_bytes(payload)
        descriptor = os.open(output, os.O_RDONLY)
        try:
            with self.assertRaises(ValueError):
                readback_output(descriptor, {4: (4, 1), 0: (0, 2)})
        finally:
            os.close(descriptor)

    def test_checksum_bound_whole_operation_telemetry_rejects_tampering(self) -> None:
        self.execute("telemetry.wtpe")
        output = self.root / "telemetry.wtpe"
        payload = output.read_bytes()
        marker = b'"wholeOperationElapsedSeconds":"'
        offset = payload.index(marker) + len(marker)
        changed = bytearray(payload)
        changed[offset] = ord("9") if changed[offset] != ord("9") else ord("8")
        output.write_bytes(changed)
        descriptor = os.open(output, os.O_RDONLY)
        try:
            with self.assertRaises(ValueError):
                readback_output(descriptor, {4: (4, 1), 0: (0, 2)}, self.limits)
        finally:
            os.close(descriptor)

    def test_final_name_race_is_not_overwritten_and_leaves_partial_output(self) -> None:
        output = self.root / "race.wtpe"
        real_link = os.link

        def raced_link(source, destination, **kwargs):
            descriptor = os.open(
                destination,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o600,
                dir_fd=kwargs.get("dst_dir_fd"),
            )
            os.write(descriptor, b"racer")
            os.close(descriptor)
            return real_link(source, destination, **kwargs)

        with patch("scripts.run_phase2_patch_event_pilot.os.link", side_effect=raced_link):
            with self.assertRaises(ValueError):
                self.execute("race.wtpe")
        self.assertEqual(output.read_bytes(), b"racer")
        self.assertTrue((self.root / "race.wtpe.partial").is_file())

    def test_partial_path_replacement_cannot_redirect_same_fd_readback_or_publication(self) -> None:
        output = self.root / "replacement.wtpe"
        partial = self.root / "replacement.wtpe.partial"
        displaced = self.root / "replacement.wtpe.bound-inode.partial"
        real_append = pilot_runner.append_operation_telemetry

        def replace_then_append(*args, **kwargs):
            partial.rename(displaced)
            partial.write_bytes(b"replacement inode")
            os.chmod(partial, 0o600)
            return real_append(*args, **kwargs)

        with patch("scripts.run_phase2_patch_event_pilot.append_operation_telemetry", side_effect=replace_then_append):
            with self.assertRaises(ValueError):
                self.execute("replacement.wtpe")
        self.assertFalse(output.exists())
        self.assertEqual(partial.read_bytes(), b"replacement inode")
        self.assertTrue(displaced.is_file())

    def test_scratch_directory_symlink_replacement_is_rejected_before_spool_creation(self) -> None:
        attacker = self.root / "attacker"
        attacker.mkdir(mode=0o700)
        output = self.root / "scratch-race.wtpe"
        real_mkdir = os.mkdir

        def replace_scratch(name, *args, **kwargs):
            result = real_mkdir(name, *args, **kwargs)
            directory_descriptor = kwargs.get("dir_fd")
            os.rename(name, f"{name}.bound.partial", src_dir_fd=directory_descriptor, dst_dir_fd=directory_descriptor)
            os.symlink("attacker", name, dir_fd=directory_descriptor)
            return result

        with patch("scripts.run_phase2_patch_event_pilot.os.mkdir", side_effect=replace_scratch):
            with self.assertRaises(OSError):
                self.execute("scratch-race.wtpe")
        self.assertFalse(output.exists())

    def test_deadline_crossing_during_link_rolls_back_to_partial_only(self) -> None:
        output = self.root / "late.wtpe"
        current = [0.0]
        real_link = os.link

        def late_link(source, destination, **kwargs):
            result = real_link(source, destination, **kwargs)
            current[0] = 2000.0
            return result

        def ticking_clock():
            if current[0] < 1000:
                current[0] += 0.01
            return current[0]

        with patch("scripts.run_phase2_patch_event_pilot.os.link", side_effect=late_link):
            with self.assertRaises(TimeoutError):
                run_pilot(
                    self.loss,
                    self.lineage,
                    output,
                    expected_loss_sha256=self.loss_sha,
                    expected_lineage_sha256=self.lineage_sha,
                    limits=self.limits,
                    clock=ticking_clock,
                )
        self.assertFalse(output.exists())
        self.assertTrue((self.root / "late.wtpe.partial").is_file())

    def test_parent_watchdog_enforces_worker_resources_and_cleans_verified_partial_link(self) -> None:
        output = self.root / "supervised.wtpe"
        result = supervise_pilot(
            self.loss,
            self.lineage,
            output,
            expected_loss_sha256=self.loss_sha,
            expected_lineage_sha256=self.lineage_sha,
            limits=PilotLimits(components=2, seconds=10, sort_chunk_bytes=60),
        )
        self.assertTrue(output.is_file())
        self.assertFalse((self.root / "supervised.wtpe.partial").exists())
        self.assertLessEqual(result["telemetry"]["observedPeakRssBytes"], MAX_MEMORY_BYTES)
        if result["telemetry"]["affinityCpuCount"] is None:
            self.assertFalse(result["telemetry"]["affinityEnforced"])
        else:
            self.assertLessEqual(result["telemetry"]["affinityCpuCount"], MAX_VCPU)
        self.assertLessEqual(float(result["telemetry"]["observedAverageVcpu"]), MAX_VCPU)
        self.assertEqual(result["telemetry"]["threadEnvironmentLimit"], 1)
        self.assertEqual(result["telemetry"]["cpuRlimitSeconds"], 10)
        self.assertLessEqual(float(result["telemetry"]["parentWatchdogElapsedSeconds"]), 10)

    def test_parent_watchdog_kills_stalled_worker_at_boundary(self) -> None:
        output = self.root / "watchdog.wtpe"
        with patch("scripts.run_phase2_patch_event_pilot._pilot_child", slow_pilot_child):
            with self.assertRaises(TimeoutError):
                supervise_pilot(
                    self.loss,
                    self.lineage,
                    output,
                    expected_loss_sha256=self.loss_sha,
                    expected_lineage_sha256=self.lineage_sha,
                    limits=PilotLimits(components=2, seconds=1, sort_chunk_bytes=60),
                )
        self.assertFalse(output.exists())

    def test_parent_watchdog_kills_worker_when_polled_rss_exceeds_cap(self) -> None:
        output = self.root / "rss-watchdog.wtpe"
        with (
            patch("scripts.run_phase2_patch_event_pilot._pilot_child", slow_pilot_child),
            patch("scripts.run_phase2_patch_event_pilot.process_rss_bytes", return_value=MAX_MEMORY_BYTES + 1),
        ):
            with self.assertRaises(MemoryError):
                supervise_pilot(
                    self.loss,
                    self.lineage,
                    output,
                    expected_loss_sha256=self.loss_sha,
                    expected_lineage_sha256=self.lineage_sha,
                    limits=PilotLimits(components=2, seconds=10, sort_chunk_bytes=60),
                )
        self.assertFalse(output.exists())

    def test_production_entrypoint_pins_every_authorized_limit(self) -> None:
        self.assertEqual(EXACT_LIMITS.components, MAX_COMPONENTS)
        self.assertEqual(EXACT_LIMITS.output_bytes, MAX_OUTPUT_BYTES)
        self.assertEqual(EXACT_LIMITS.scratch_bytes, MAX_SCRATCH_BYTES)
        self.assertEqual(EXACT_LIMITS.seconds, MAX_SECONDS)
        self.assertEqual(EXACT_LIMITS.vcpu, MAX_VCPU)
        self.assertEqual(EXACT_LIMITS.memory_bytes, MAX_MEMORY_BYTES)
        self.assertEqual(EXACT_LIMITS.sort_chunk_bytes, SORT_CHUNK_BYTES)
        self.assertEqual(EXACT_LIMITS.whole_run_copies, MAX_WHOLE_RUN_COPIES)
        self.assertEqual((MAX_COMPONENTS, MAX_OUTPUT_BYTES, MAX_SCRATCH_BYTES), (10_000, 64 * 1024**2, 2 * 1024**3))
        self.assertEqual((MAX_SECONDS, MAX_VCPU, MAX_MEMORY_BYTES), (1800, 8, 16 * 1024**3))
        self.assertEqual(SORT_CHUNK_BYTES, 1024**3)
        self.assertEqual(len(LOSS_SHA256), 64)
        self.assertEqual(len(LINEAGE_SHA256), 64)
        evidence = json.loads((PROJECT_ROOT / "data/phase2-real-loss-component-inventory-readback.json").read_text())
        first_pair = evidence["pairs"][0]
        self.assertEqual(first_pair["pair"], [1984, 1985])
        self.assertEqual(first_pair["sourceLoss"]["sha256"], LOSS_SHA256)
        self.assertEqual(first_pair["lineage"]["sha256"], LINEAGE_SHA256)
        preflight = json.loads((PROJECT_ROOT / "data/phase2-real-patch-event-execution-preflight.json").read_text())
        self.assertEqual(preflight["boundedPilot"]["pair"], [1984, 1985])
        self.assertEqual(preflight["boundedPilot"]["maximumFinalizedComponents"], MAX_COMPONENTS)
        self.assertEqual(preflight["boundedPilot"]["maximumOutputBytes"], MAX_OUTPUT_BYTES)
        self.assertEqual(preflight["boundedPilot"]["maximumScratchBytes"], MAX_SCRATCH_BYTES)
        self.assertEqual(preflight["boundedPilot"]["maximumSeconds"], MAX_SECONDS)
        for changed in [
            PilotLimits(components=MAX_COMPONENTS + 1),
            PilotLimits(output_bytes=MAX_OUTPUT_BYTES + 1),
            PilotLimits(scratch_bytes=MAX_SCRATCH_BYTES + 1),
            PilotLimits(seconds=MAX_SECONDS + 1),
            PilotLimits(vcpu=MAX_VCPU + 1),
            PilotLimits(memory_bytes=MAX_MEMORY_BYTES + 1),
            PilotLimits(sort_chunk_bytes=SORT_CHUNK_BYTES + 1),
            PilotLimits(whole_run_copies=MAX_WHOLE_RUN_COPIES + 1),
            PilotLimits(sort_chunk_bytes=19),
        ]:
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                validate_limits(changed)


if __name__ == "__main__":
    unittest.main()
