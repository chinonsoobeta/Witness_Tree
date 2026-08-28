#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { EXPECTED, RELEASE_ID, retrievePhase8BulkDownloadRelease } from "./check-phase8-bulk-download-independent-retrieval.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const REPO = "chinonsoobeta/Witness_Tree";
const MANIFEST_SHA = "0d43fd90f3f8c522e2885922f838e56b6c28fe4e2d1f8f2ab72a15a0a209789d";
const AUTH_PATH = new URL("../data/phase8-bulk-download-owner-authorization-v2-2026-08-28.json", import.meta.url);
const AUTH_SHA = "a328aa5f2bc604b7c605bac3d0ba5a18883f59639235a18abe387b57c45bce90";
const ADMISSION_SHA = "58147c088d12190f8882d0c493364cd07cf7c176d4fafbc266421bf337ca7d82";

function validateArtifacts(artifacts, { ownerLocal = false } = {}) {
  assert.deepEqual(Object.keys(artifacts).sort(), Object.keys(EXPECTED).sort());
  for (const [name, expected] of Object.entries(EXPECTED)) {
    const artifact = artifacts[name];
    if (!ownerLocal) {
      assert.equal(artifact.id, expected.id);
      assert.equal(artifact.kind, expected.kind);
      assert.deepEqual(artifact.licenceIds, expected.licenceIds);
    }
    assert.equal(artifact.publicUrl, expected.publicUrl);
    assert.equal(artifact.sha256, expected.sha256);
    assert.equal(artifact.byteLength, expected.byteLength);
    assert.equal(artifact.contentType, expected.contentType);
    assert.equal(artifact.publicStatus, 200);
    assert.equal(artifact.retrievedByteLength, expected.byteLength);
    assert.equal(ownerLocal ? artifact.fullPublicReadbackSha256 : artifact.retrievedSha256, expected.sha256);
    if (!ownerLocal) assert.equal(artifact.accessControlAllowOrigin, "*");
  }
}

export function validateIndependentReceipt(receipt) {
  assert.equal(receipt.schemaVersion, "witness-tree/phase8-bulk-download-independent-retrieval/1");
  assert.equal(receipt.status, "independently-retrieved-and-hashed");
  assert.equal(receipt.retrievalContext, "github-hosted-runner-separate-from-producing-machine");
  assert.equal(receipt.releaseId, RELEASE_ID);
  assert.equal(receipt.repository, REPO);
  assert.match(receipt.retrievedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.ok(Number.isSafeInteger(receipt.runId) && receipt.runId > 0);
  assert.ok(Number.isSafeInteger(receipt.runAttempt) && receipt.runAttempt > 0);
  assert.equal(receipt.runUrl, `https://github.com/${REPO}/actions/runs/${receipt.runId}`);
  assert.match(receipt.headSha, /^[a-f0-9]{40}$/);
  assert.equal(receipt.runner?.os, "Linux");
  assert.equal(receipt.runner?.arch, "X64");
  validateArtifacts(receipt.artifacts);
  return receipt;
}

export async function checkPhase8BulkDownloadPublication({ live = false } = {}) {
  const independent = validateIndependentReceipt(JSON.parse(await readFile(new URL("../data/bulk-download-publication.json", import.meta.url), "utf8")));
  const ownerLocal = JSON.parse(await readFile(new URL("../data/bulk-download-publication-v2-owner-local.json", import.meta.url), "utf8"));
  assert.equal(ownerLocal.status, "published-and-owner-local-readback");
  assert.equal(ownerLocal.retrievalContext, "owner-local-producing-machine");
  assert.equal(ownerLocal.releaseId, RELEASE_ID);
  validateArtifacts(ownerLocal.artifacts, { ownerLocal: true });

  const manifestBytes = await readFile(new URL("../data/phase8-bulk-download-public-manifest.json", import.meta.url));
  assert.equal(sha256(manifestBytes), MANIFEST_SHA);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.releaseId, RELEASE_ID);
  assert.equal(manifest.inputs.admissionRecord.sha256, ADMISSION_SHA);
  assert.equal(manifest.authorization.sha256, AUTH_SHA);
  assert.equal(manifest.authorization.supersession.decision, "supersede-for-this-exact-bounded-release");
  assert.equal(manifest.authorization.supersession.priorAdmissionRecord.sha256, ADMISSION_SHA);
  assert.equal(manifest.authorization.supersession.doesNotCompletePhase2FormalGate, true);
  assert.ok(manifest.modificationNotice.en.length > 100 && manifest.modificationNotice.fr.length > 100);
  assert.ok(manifest.citation.en && manifest.citation.fr && manifest.claimLimit && manifest.claimLimitFr);
  for (const [name, expected] of Object.entries(EXPECTED)) {
    if (name === "manifest") continue;
    assert.equal(manifest.artifacts[name].publicUrl, expected.publicUrl);
    assert.equal(manifest.artifacts[name].sha256, expected.sha256);
    assert.equal(manifest.artifacts[name].byteLength, expected.byteLength);
    assert.equal(manifest.artifacts[name].contentType, expected.contentType);
  }
  const authorizationBytes = await readFile(AUTH_PATH);
  assert.equal(sha256(authorizationBytes), AUTH_SHA);
  const authorization = JSON.parse(authorizationBytes);
  assert.equal(authorization.release.releaseId, RELEASE_ID);
  assert.equal(authorization.supersession.decision, "supersede-for-this-exact-bounded-release");
  assert.equal(authorization.decisions.releaseAuthorized, true);
  assert.equal(authorization.decisions.productionAdmissionAuthorizedForThisBoundedRelease, true);
  assert.equal(authorization.claimLimits.phase2FormalGateComplete, false);
  assert.deepEqual(authorization.release.artifacts.map(({ id, kind, licenceIds, sha256: digest, byteLength }) => ({ id, kind, licenceIds, sha256: digest, byteLength })), [EXPECTED.csv, EXPECTED.geopackage].map(({ id, kind, licenceIds, sha256: digest, byteLength }) => ({ id, kind, licenceIds, sha256: digest, byteLength })));
  if (live) await retrievePhase8BulkDownloadRelease();
  return independent;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.some((value, index) => index > 1 && value !== "--live")) throw new Error("Usage: check-phase8-bulk-download-publication.mjs [--live]");
  const receipt = await checkPhase8BulkDownloadPublication({ live: process.argv.includes("--live") });
  console.log(`Phase 8 bulk publication independently verified: ${receipt.releaseId}; GitHub Actions run ${receipt.runId}.`);
}
