#!/usr/bin/env node
/**
 * Byte-level check of the committed NTEMS readback evidence.
 *
 * The gap this closes: every other runnable NTEMS check confirms that an
 * evidence file exists and is self-consistent. None of them opens the raster
 * it describes. check:phase1-ntems-transform-readback runs against synthetic
 * in-test fixtures, and check:phase1-ntems-production-admission-readiness
 * takes its existence-only branch because the npm script passes no --record.
 * So a forged or drifted evidence record passed CI.
 *
 * scripts/verify-phase1-ntems-transform.mjs already does the real work: it
 * hashes the output, compares byte length, hashes the sidecar, and compares
 * the GDAL pixel checksum of source and output. It was simply never wired
 * into package.json. This does that, and asserts the recomputed evidence
 * equals the committed record exactly.
 *
 * The verifier emits no volatile fields, so the comparison is a plain deep
 * equality with nothing stripped and nothing excused.
 *
 * This check reads the real data root. With the drive detached it fails
 * naming an unreadable path, which is evidence unavailable, not evidence
 * contradicted. It is registered in data/data-root-bound-checks.json.
 *
 * Read-only. It admits, ingests, releases and deploys nothing.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verify } from "./verify-phase1-ntems-transform.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const NTEMS_EVIDENCE = Object.freeze([
  { specId: "ntems-forest-harvest-v1", evidencePath: "data/ntems-forest-harvest-v1-readback-evidence-2026-08-30.json", committedEvidence: true },
  { specId: "ntems-canopy-cover-v1", evidencePath: "data/ntems-canopy-cover-v1-readback-evidence-2026-08-30.json", committedEvidence: true },
  { specId: "ntems-canopy-height-v1", evidencePath: "data/ntems-canopy-height-v1-readback-evidence-2026-08-30.json", committedEvidence: true },
  { specId: "ntems-annual-land-cover-v1", evidencePath: "data/ntems-annual-land-cover-v1-readback-evidence-2026-08-30.json", committedEvidence: true },
]);

export function checkScope({ specId, evidencePath, committedEvidence = false }, root = ROOT, dataRoot = undefined) {
  const evidenceFile = path.join(root, evidencePath);
  if (!existsSync(evidenceFile)) {
    if (committedEvidence) throw new Error(`${specId} is recorded with committed readback evidence at ${evidencePath}, but that evidence file is missing.`);
    return { specId, evidencePath, state: "no-committed-evidence", bytesRead: false };
  }
  const committed = JSON.parse(readFileSync(evidenceFile, "utf8"));
  const recomputed = verify({ specId, ...(dataRoot ? { dataRoot } : {}) }, root);
  assert.deepEqual(
    recomputed,
    committed,
    `${specId} readback evidence does not match the bytes on disk. The committed record and a fresh verification of the artifact disagree; this is a contradiction, not a missing file.`,
  );
  return {
    specId,
    evidencePath,
    state: "verified-against-bytes",
    bytesRead: true,
    outputs: committed.outputs.map(({ output, outputSha256, outputByteLength }) => ({ output, outputSha256, outputByteLength })),
  };
}

export function check(root = ROOT, { specIds = null, dataRoot = undefined } = {}) {
  const selected = specIds ? NTEMS_EVIDENCE.filter(({ specId }) => specIds.includes(specId)) : NTEMS_EVIDENCE;
  if (selected.length === 0) throw new Error("no NTEMS scope matched the requested --spec-id.");
  const scopes = selected.map((scope) => checkScope(scope, root, dataRoot));
  return {
    schemaVersion: "witness-tree/phase1-ntems-readback-bytes-check/1",
    mode: "artifact-byte-verification",
    verifies:
      "Each committed NTEMS readback evidence record is recomputed from the artifact bytes under the data root and must match exactly, including output SHA-256, byte length, sidecar SHA-256, and the GDAL pixel checksum of source against output.",
    scopes,
    verifiedCount: scopes.filter(({ state }) => state === "verified-against-bytes").length,
    notYetEvidencedCount: scopes.filter(({ state }) => state === "no-committed-evidence").length,
    admissionClaim: false,
    productionAdmission: false,
    productionEligible: false,
  };
}

function cli() {
  const argv = process.argv.slice(2);
  const value = (flag) => { const index = argv.indexOf(flag); return index < 0 ? undefined : argv[index + 1]; };
  const specId = value("--spec-id");
  const result = check(ROOT, { specIds: specId ? [specId] : null, dataRoot: value("--data-root") });
  for (const scope of result.scopes) {
    console.log(
      scope.state === "verified-against-bytes"
        ? `${scope.specId}: ${scope.outputs.length} output(s) verified against the bytes on disk.`
        : `${scope.specId}: no committed readback evidence yet; nothing was read.`,
    );
  }
  console.log(`NTEMS readback bytes: ${result.verifiedCount} verified, ${result.notYetEvidencedCount} not yet evidenced. Admission and production remain false.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { cli(); } catch (error) { console.error(`Stopped: ${error.message}`); process.exitCode = 1; }
}
