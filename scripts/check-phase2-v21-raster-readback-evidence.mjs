import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const hash = (path) => createHash("sha256").update(readFileSync(new URL(path, root))).digest("hex");
const SHA = /^[a-f0-9]{64}$/;
// This is the exact runner recorded by the completed readback. The active
// runner now has a separate resume-capable method revision; historical
// evidence remains bound to the implementation that actually produced it.
const HISTORICAL_RUNNER_SHA256 = "c0c69cb071b998907737d3c8dceed74cde309398b34034fde556e4ba28e8660e";
const snapshots = [1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2022];
const intervals = snapshots.slice(0, -1).map((fromYear, index) => ({ fromYear, toYear: snapshots[index + 1] }));

export function validatePhase2V21RasterReadbackEvidence(evidence = read("data/phase2-v21-raster-readback-evidence.json")) {
  assert.equal(evidence.schemaVersion, "witness-tree/phase2-v21-raster-readback-evidence/1");
  assert.equal(evidence.status, "local-readback-passed-nonproduction");
  assert.equal(evidence.batchId, "phase2-v21-raster-first-1984-2022-v1");
  assert.deepEqual(evidence.counts, { snapshots: 11, intervals: 10, outputs: 21 });
  assert.deepEqual(evidence.claims, { admitted: false, productionEligible: false, released: false, boundaryAggregationPerformed: false, externalAction: false, vectorsCreated: false });
  assert.deepEqual(evidence.codeProvenance, { runnerSha256: HISTORICAL_RUNNER_SHA256, workerSha256: hash("scripts/phase2_v21_raster_window.py") });
  assert.equal(evidence.lineage.path, "lineage.json");
  assert.ok(SHA.test(evidence.lineage.sha256) && Number.isSafeInteger(evidence.lineage.byteLength) && evidence.lineage.byteLength > 0);
  assert.equal(evidence.outputs.length, 21);
  const snapshotRows = evidence.outputs.filter(({ kind }) => kind === "forest-mask-snapshot");
  const intervalRows = evidence.outputs.filter(({ kind }) => kind === "whole-interval-loss");
  assert.deepEqual(snapshotRows.map(({ year }) => year), snapshots);
  assert.deepEqual(intervalRows.map(({ fromYear, toYear }) => ({ fromYear, toYear })), intervals);
  const paths = new Set();
  for (const row of evidence.outputs) {
    const stem = row.kind === "forest-mask-snapshot" ? `forest-mask-snapshot-${row.year}` : `whole-interval-loss-${row.fromYear}-${row.toYear}`;
    assert.equal(row.raster.path, `${stem}.tif`);
    assert.equal(row.sidecar.path, row.kind === "forest-mask-snapshot" ? `sidecars/${stem}-snapshot.json` : `sidecars/${stem}.json`);
    assert.equal(row.inputCount, row.kind === "forest-mask-snapshot" ? 1 : row.toYear - row.fromYear);
    for (const artifact of [row.raster, row.sidecar]) {
      assert.ok(!artifact.path.startsWith("/") && !artifact.path.includes(".."));
      assert.ok(!paths.has(artifact.path)); paths.add(artifact.path);
      assert.ok(Number.isSafeInteger(artifact.byteLength) && artifact.byteLength > 0 && SHA.test(artifact.sha256));
    }
    assert.ok(Number.isFinite(row.telemetry.elapsedSeconds) && row.telemetry.elapsedSeconds > 0);
    assert.ok(Number.isSafeInteger(row.telemetry.peakRssBytes) && row.telemetry.peakRssBytes > 0);
    assert.ok(Number.isSafeInteger(row.telemetry.scratchDiskPeakBytes) && row.telemetry.scratchDiskPeakBytes >= 0);
  }
  assert.equal(paths.size, 42);
  assert.match(evidence.redaction, /Absolute local paths.*input paths.*omitted/i);
  return evidence;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validatePhase2V21RasterReadbackEvidence();
  console.log("Phase 2 V2.1 local readback evidence passes; 21/21 outputs remain non-admitted and nonproduction.");
}
