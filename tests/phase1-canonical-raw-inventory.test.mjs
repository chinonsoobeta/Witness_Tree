import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CORE_ROW_IDS,
  INVENTORY_SCHEMA,
  observeArtifact,
  validateCanonicalRawInventory,
} from "../scripts/check-phase1-canonical-raw-inventory.mjs";

const DATA_ROOT = "/Volumes/Extended_SSD/Witness_Tree-data";
const SOURCE_REF = [{ path: "data/phase1-source-inventory.json" }];
const CONTENT = Buffer.from("canonical raw bytes\n");
const SHA256 = createHash("sha256").update(CONTENT).digest("hex");
const LEDGER_SHA256 = createHash("sha256").update(readFileSync(new URL("../data/phase1-production-source-ledger.json", import.meta.url))).digest("hex");

function spec(id, rowIds, relativePath = `raw/test/${id}.bin`, canonicalPayload = true) {
  return {
    id,
    rowIds,
    relativePath,
    expectedByteLength: CONTENT.length,
    expectedSha256: SHA256,
    kind: "raw-payload",
    canonicalPayload,
    sourceRefs: SOURCE_REF,
  };
}

function documentFor({ artifactSpecs = [], observations = [] } = {}) {
  const artifacts = artifactSpecs.map((artifact) => ({
    ...artifact,
    ...(observations.find(({ id }) => id === artifact.id) ?? {
      status: "missing",
      exists: false,
    }),
  }));
  const rows = CORE_ROW_IDS.map((id) => {
    const rowArtifacts = artifacts.filter((artifact) => artifact.rowIds.includes(id));
    const canonical = rowArtifacts.filter((artifact) => artifact.canonicalPayload);
    const status = canonical.length === 0
      ? "not-staged"
      : canonical.every((artifact) => artifact.status === "matched")
        ? id === "provincial-electoral-boundaries" ? "partial-local-components" : "matched-local-bytes"
        : canonical.some((artifact) => artifact.status === "mismatch" || artifact.status === "unreadable")
          ? "local-byte-mismatch-or-unreadable"
          : "missing-local-bytes";
    return {
      id,
      status,
      physicalArtifactCount: rowArtifacts.length,
      canonicalPayloadCount: canonical.length,
      matchedCanonicalPayloadCount: canonical.filter((artifact) => artifact.status === "matched").length,
      artifactIds: rowArtifacts.map((artifact) => artifact.id),
    };
  });
  return {
    schemaVersion: INVENTORY_SCHEMA,
    status: "local-read-only-reconciled",
    observedAt: "2026-08-27T00:00:00.000Z",
    notice: "Local filesystem evidence only; archive, recovery and admission are not inferred.",
    dataRoot: { canonicalPath: DATA_ROOT, resolvedPath: process.env.TEST_CANONICAL_ROOT ?? path.join(os.tmpdir(), "Witness_Tree-data"), externalOnly: true },
    claims: {
      localBytesOnly: true,
      immutableArchive: false,
      recoveryReplica: false,
      sourceLedgerAdmission: false,
      transformationAdmission: false,
      ingestion: false,
      release: false,
      productionAdmission: false,
      productionEligible: false,
    },
    ledger: { path: "data/phase1-production-source-ledger.json", sha256: LEDGER_SHA256, coreRowCount: 22, rowIds: CORE_ROW_IDS },
    rows,
    artifacts,
    summary: {
      coreRowCount: 22,
      matchedRowCount: rows.filter(({ status }) => status === "matched-local-bytes").length,
      partialRowCount: rows.filter(({ status }) => status === "partial-local-components" || status === "missing-local-bytes" || status === "local-byte-mismatch-or-unreadable").length,
      notStagedRowCount: rows.filter(({ status }) => status === "not-staged").length,
      physicalArtifactCount: artifacts.length,
      matchedArtifactCount: artifacts.filter(({ status }) => status === "matched").length,
      missingArtifactCount: artifacts.filter(({ status }) => status === "missing").length,
      mismatchedOrUnreadableArtifactCount: artifacts.filter(({ status }) => status === "mismatch" || status === "unreadable").length,
      canonicalPayloadCount: artifacts.filter(({ canonicalPayload }) => canonicalPayload).length,
    },
  };
}

test("the canonical inventory contract preserves all 22 rows and deduplicates shared federal bytes", () => {
  const shared = spec("elections-canada-2025-shared", ["fed-2023-ridings", "elections-canada-45th-files"]);
  const document = documentFor({
    artifactSpecs: [shared],
    observations: [{ id: shared.id, status: "matched", exists: true, byteLength: CONTENT.length, sha256: SHA256 }],
  });
  mkdirSync(document.dataRoot.resolvedPath, { recursive: true });
  try {
    validateCanonicalRawInventory(document, { expectedArtifacts: [shared] });
    assert.equal(document.rows.length, 22);
    assert.deepEqual(document.rows[15].artifactIds, [shared.id]);
    assert.deepEqual(document.rows[16].artifactIds, [shared.id]);
    assert.equal(document.summary.physicalArtifactCount, 1);
    assert.equal(document.summary.matchedArtifactCount, 1);
    assert.equal(document.claims.productionEligible, false);
  } finally {
    rmSync(document.dataRoot.resolvedPath, { recursive: true, force: true });
  }
});

test("missing bytes and a mismatched checksum remain fail-closed without archive claims", () => {
  const missing = spec("missing", ["indian-reserves"]);
  const mismatch = spec("mismatch", ["first-nation-reserves"], "raw/test/mismatch.bin");
  const document = documentFor({
    artifactSpecs: [missing, mismatch],
    observations: [
      { id: missing.id, status: "missing", exists: false },
      { id: mismatch.id, status: "mismatch", exists: true, byteLength: CONTENT.length, sha256: "f".repeat(64) },
    ],
  });
  mkdirSync(document.dataRoot.resolvedPath, { recursive: true });
  try {
    validateCanonicalRawInventory(document, { expectedArtifacts: [missing, mismatch] });
    assert.equal(document.rows[18].status, "missing-local-bytes");
    assert.equal(document.rows[19].status, "local-byte-mismatch-or-unreadable");
    assert.equal(document.claims.immutableArchive, false);
    assert.equal(document.claims.recoveryReplica, false);
  } finally {
    rmSync(document.dataRoot.resolvedPath, { recursive: true, force: true });
  }
});

test("the byte observer reports exact bytes and refuses symlinked artifacts", async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "witness-tree-raw-inventory-"));
  const root = path.join(temp, "Witness_Tree-data");
  const relativePath = "raw/test/payload.bin";
  mkdirSync(path.join(root, "raw/test"), { recursive: true });
  writeFileSync(path.join(root, relativePath), CONTENT);
  const matching = await observeArtifact(spec("payload", ["historic-treaties"], relativePath), root);
  assert.equal(matching.status, "matched");
  assert.equal(matching.byteLength, CONTENT.length);
  assert.equal(matching.sha256, SHA256);

  const symlinkPath = path.join(root, "raw/test/link.bin");
  symlinkSync(path.join(root, relativePath), symlinkPath);
  const symlinked = await observeArtifact(spec("symlink", ["modern-treaties"], "raw/test/link.bin"), root);
  assert.equal(symlinked.status, "unreadable");
  rmSync(temp, { recursive: true, force: true });
});

test("archive or admission claims are rejected even when local bytes match", () => {
  const shared = spec("shared", ["fed-2023-ridings", "elections-canada-45th-files"]);
  const document = documentFor({
    artifactSpecs: [shared],
    observations: [{ id: shared.id, status: "matched", exists: true, byteLength: CONTENT.length, sha256: SHA256 }],
  });
  document.claims.immutableArchive = true;
  mkdirSync(document.dataRoot.resolvedPath, { recursive: true });
  try {
    assert.throws(() => validateCanonicalRawInventory(document), /claims must remain local-only/);
  } finally {
    rmSync(document.dataRoot.resolvedPath, { recursive: true, force: true });
  }
});

test("matched local components do not make the aggregate provincial boundary row complete", () => {
  const bc = spec("bc", ["provincial-electoral-boundaries"]);
  const ontario = spec("ontario", ["provincial-electoral-boundaries"]);
  const observation = (id) => ({ id, status: "matched", exists: true, byteLength: CONTENT.length, sha256: SHA256 });
  const document = documentFor({ artifactSpecs: [bc, ontario], observations: [observation("bc"), observation("ontario")] });
  mkdirSync(document.dataRoot.resolvedPath, { recursive: true });
  try {
    validateCanonicalRawInventory(document, { expectedArtifacts: [bc, ontario] });
    const row = document.rows.find(({ id }) => id === "provincial-electoral-boundaries");
    assert.equal(row.status, "partial-local-components");
    assert.equal(document.summary.matchedRowCount, 0);
    assert.equal(document.summary.partialRowCount, 1);
  } finally {
    rmSync(document.dataRoot.resolvedPath, { recursive: true, force: true });
  }
});

test("the checked-in inventory binds exact artifact metadata and row membership", () => {
  const shared = spec("shared", ["fed-2023-ridings", "elections-canada-45th-files"]);
  const document = documentFor({
    artifactSpecs: [shared],
    observations: [{ id: shared.id, status: "matched", exists: true, byteLength: CONTENT.length, sha256: SHA256 }],
  });
  mkdirSync(document.dataRoot.resolvedPath, { recursive: true });
  try {
    const metadataTamper = structuredClone(document);
    metadataTamper.artifacts[0].expectedSha256 = "f".repeat(64);
    assert.throws(
      () => validateCanonicalRawInventory(metadataTamper, { expectedArtifacts: [shared] }),
      /metadata differs from its canonical specification/i,
    );

    const membershipTamper = structuredClone(document);
    membershipTamper.rows[15].artifactIds = [];
    assert.throws(
      () => validateCanonicalRawInventory(membershipTamper, { expectedArtifacts: [shared] }),
      /must enumerate every artifact/i,
    );
  } finally {
    rmSync(document.dataRoot.resolvedPath, { recursive: true, force: true });
  }
});

test("malformed artifact paths and duplicate row memberships fail closed", () => {
  const malformed = spec("malformed", ["historic-treaties"]);
  const unsafePath = structuredClone(documentFor({ artifactSpecs: [malformed] }));
  unsafePath.artifacts[0].relativePath = "raw/../outside.bin";
  assert.throws(() => validateCanonicalRawInventory(unsafePath), /unsafe relative path|invalid data-root-relative path/i);

  const duplicateRows = structuredClone(documentFor({ artifactSpecs: [spec("duplicate", ["historic-treaties", "historic-treaties"])] }));
  assert.throws(() => validateCanonicalRawInventory(duplicateRows), /must not repeat a core row id/i);
});

test("the inventory cannot carry a stale production-ledger digest", () => {
  const document = documentFor();
  document.ledger.sha256 = "0".repeat(64);
  assert.throws(() => validateCanonicalRawInventory(document), /ledger SHA-256 does not match/i);
});
