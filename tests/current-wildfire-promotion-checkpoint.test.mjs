import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertRunnableCheckpoint, completeCheckpoint, initializeCheckpoint, markAmbiguous, markManifestComplete,
  markRetentionStarted, markWriteStarted, recordAcknowledgement, recordHead, recordIdentity, recordRetention
} from "../scripts/check-current-wildfire-promotion-checkpoint.mjs";
import { publishPair, validatePair } from "../scripts/assemble-current-wildfire-promotion-attestation.mjs";

const ids = ["cwfis-current-active-wildfires-2026-08-14T202242Z", "bc-wildfire-current-perimeters-2026-08-14", "alberta-wildfire-locations-2026-08-14", "ontario-in-year-fire-perimeters-2026-08-14"];
const operator = JSON.stringify({ UserId: "private-user-id", Account: "286853118812", Arn: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator" });
const role = JSON.stringify({ UserId: "private-role-id", Account: "286853118812", Arn: "arn:aws:sts::286853118812:assumed-role/WitnessTreeCurrentWildfirePromotionUploader/test" });

function completeFixture(path) {
  initializeCheckpoint(path, "2026-08-23T12:00:00.000Z");
  recordIdentity(path, operator, role);
  for (const [index, artifactId] of ids.entries()) {
    for (const kind of ["payload", "manifest"]) {
      const version = `ExactOwnerVersion_${index}_${kind}`; const checksum = `${String(index + 1).repeat(11)}=`;
      markWriteStarted(path, artifactId, kind);
      recordAcknowledgement(path, artifactId, kind, { VersionId: version, ChecksumCRC64NVME: checksum, rawResponse: JSON.stringify({ VersionId: version, ChecksumCRC64NVME: checksum, ETag: `private-etag-${index}` }) });
      const current = JSON.parse(readFileSync(path)); const object = current.objects.find((item) => item.artifactId === artifactId && item.kind === kind);
      const rawHead = { VersionId: version, ContentLength: object.bytes, ChecksumType: "FULL_OBJECT", ChecksumCRC64NVME: checksum, Metadata: { exact: "private" } };
      recordHead(path, artifactId, kind, { ...rawHead, rawResponse: JSON.stringify(rawHead) });
      if (kind === "payload") {
        markRetentionStarted(path, artifactId);
        const rawRetention = { Retention: { Mode: "COMPLIANCE", RetainUntilDate: "2033-08-12T00:00:00Z" }, RequestCharged: "private-value" };
        recordRetention(path, artifactId, { Mode: "COMPLIANCE", RetainUntilDate: "2033-08-12T00:00:00Z", putResponse: "{}\n", getResponse: JSON.stringify(rawRetention) });
      } else markManifestComplete(path, artifactId);
    }
  }
  completeCheckpoint(path);
}

test("lost write response creates a durable ambiguity boundary that forbids duplicate versions", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-checkpoint-loss-")); const path = join(dir, "checkpoint.json");
  try {
    initializeCheckpoint(path); recordIdentity(path, operator, role);
    markWriteStarted(path, ids[0], "payload"); markAmbiguous(path, ids[0], "payload", "put-object");
    assert.throws(() => assertRunnableCheckpoint(path), /owner review|unresolved write boundary/);
    assert.throws(() => markWriteStarted(path, ids[0], "payload"), /owner review|already started/);
    const value = JSON.parse(readFileSync(path));
    assert.equal(value.status, "owner-review-required");
    assert.equal(value.objects[0].ambiguity.reason, "response-lost-or-provider-failure");
    assert.equal(statSync(path).mode & 0o777, 0o600);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("completed checkpoint publishes an owner-only exact-response pair with digest cross-links", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-attestation-")); const checkpoint = join(dir, "checkpoint.json"); const privatePath = join(dir, "private.json"); const publicPath = join(dir, "public.json");
  try {
    completeFixture(checkpoint); publishPair(checkpoint, privatePath, publicPath);
    const pair = validatePair(privatePath, publicPath);
    assert.equal(pair.privateRecord.checkpoint.objects.length, 8);
    assert.equal(pair.privateRecord.checkpoint.objects[0].ack.rawResponse.includes("private-etag"), true);
    assert.equal(readFileSync(publicPath, "utf8").includes("private-etag"), false);
    assert.equal(pair.publicRecord.claims.exactVersionReadbacksVerified, false);
    assert.equal(pair.privateRecord.claims.recoveryReplicaVerified, false);
    assert.equal(pair.privateRecord.recoveryReplicaProof.externalCallsPerformedByAssembler, false);
    assert.equal(statSync(privatePath).mode & 0o777, 0o600); assert.equal(statSync(publicPath).mode & 0o777, 0o600);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("public-output race rolls back the private publication and preserves the racing target", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-attestation-race-")); const checkpoint = join(dir, "checkpoint.json"); const privatePath = join(dir, "private.json"); const publicPath = join(dir, "public.json");
  try {
    completeFixture(checkpoint);
    assert.throws(() => publishPair(checkpoint, privatePath, publicPath, { public: { beforeOpen: () => writeFileSync(publicPath, "RACING_TARGET", { mode: 0o600, flag: "wx" }) } }), /private output was rolled back/);
    assert.equal(existsSync(privatePath), false);
    assert.equal(readFileSync(publicPath, "utf8"), "RACING_TARGET");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
