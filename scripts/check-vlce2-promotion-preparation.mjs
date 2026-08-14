import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f\d]{64}$/;
const CRC64NVME = /^[a-f\d]{16}$/;
const S3_VERSION_ID = /^[A-Za-z\d._-]{32}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const PROHIBITED_RETENTION_KEYS = new Set(["plannedRetention", "intendedRetention", "targetRetention", "requestedRetention"]);

function providerBase64ToHex(value) { return Buffer.from(value, "base64").toString("hex"); }
function isUtc(value) { return typeof value === "string" && UTC.test(value) && new Date(value).toISOString() === value.replace("Z", ".000Z"); }
function noPlannedRetention(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!PROHIBITED_RETENTION_KEYS.has(key), `${key} is a plan, not retention evidence.`);
    noPlannedRetention(child);
  }
}

/** Validates preparation only; it deliberately has no AWS SDK, upload, lock, or deletion code. */
export function validateVlce2PromotionPreparation(plan, { requireAllRetained = false } = {}) {
  assert.equal(plan.schemaVersion, "witness-tree/vlce2-promotion-preparation/1");
  assert.equal(plan.status, "preparation-only");
  assert.match(plan.nonClaimNotice, /neither uploads nor locks/i);
  assert.equal(plan.source.id, "nrcan-annual-land-cover-v2");
  assert.match(plan.source.catalogueUrl, /^https:\/\//);
  assert.match(plan.source.downloadUrlTemplate, /\{YEAR\}/);
  assert.equal(plan.source.licence.id, "ogl-canada");
  assert.match(plan.source.licence.url, /^https:\/\//);
  assert.match(plan.source.licence.requiredAttribution, /Open Government Licence/i);
  assert.equal(plan.retentionDecision.state, "owner-decision-required");
  assert.equal(plan.retentionDecision.requiredBeforeIrreversibleAction.length, 3);
  assert.match(plan.retentionDecision.prohibitedEvidence, /not evidence/i);
  assert.equal(plan.entries.length, 39);
  noPlannedRetention(plan);
  let retained = 0;
  for (const [index, entry] of plan.entries.entries()) {
    const expectedYear = 1984 + index;
    assert.equal(entry.year, expectedYear, "VLCE2 records must be one complete annual series.");
    assert.ok(isUtc(entry.retrievedAt), `${entry.year} needs a recorded retrieval timestamp.`);
    assert.equal(entry.originalFilename, `CA_forest_VLCE2_${entry.year}.zip`);
    assert.ok(Number.isSafeInteger(entry.byteLength) && entry.byteLength > 0, `${entry.year} needs byte evidence.`);
    assert.match(entry.sha256, SHA256);
    assert.match(entry.crc64nvme, CRC64NVME);
    assert.equal(entry.remote.bucket, "witness-tree-raw-archive-ca-central-1");
    assert.equal(entry.remote.region, "ca-central-1");
    assert.equal(entry.remote.checksumType, "FULL_OBJECT");
    assert.match(entry.remote.versionId, S3_VERSION_ID);
    assert.equal(providerBase64ToHex(entry.remote.checksumCrc64nvmeBase64), entry.crc64nvme, `${entry.year} S3 CRC64 must bind the staged bytes.`);
    const prefix = `raw/nrcan-annual-land-cover-v2/version-2/${entry.retrievedAt.replaceAll(":", "-")}/${entry.sha256}`;
    assert.equal(entry.remote.payloadKey, `${prefix}/payload/${entry.originalFilename.toLowerCase()}`);
    assert.equal(entry.remote.manifestKey, `${prefix}/manifest.json`);
    assert.equal(entry.liveRetention.evidenceClass, "operator-reported-live-state");
    assert.ok(isUtc(entry.liveRetention.observedAt));
    if (entry.year === 1984) {
      assert.equal(entry.liveRetention.state, "retained-compliance");
      assert.equal(entry.liveRetention.mode, "COMPLIANCE");
      assert.ok(isUtc(entry.liveRetention.retainUntil));
      assert.ok(new Date(entry.liveRetention.retainUntil) > new Date(entry.liveRetention.observedAt));
      retained += 1;
    } else {
      assert.equal(entry.liveRetention.state, "not-retained", `${entry.year} must not inherit a planned retention claim.`);
      assert.equal("mode" in entry.liveRetention, false);
      assert.equal("retainUntil" in entry.liveRetention, false);
    }
  }
  assert.equal(retained, 1, "Only the specifically observed 1984 object is retained.");
  if (requireAllRetained) assert.fail("Irreversible promotion is blocked: 1985–2022 are not retained and need a separately approved live S3 read-back.");
  return { annualVersions: plan.entries.length, retained, notRetained: plan.entries.length - retained, publicationReady: false };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const plan = JSON.parse(readFileSync(new URL("../data/vlce2-promotion-preparation.json", import.meta.url), "utf8"));
  const result = validateVlce2PromotionPreparation(plan, { requireAllRetained: process.argv.includes("--require-all-retained") });
  console.log(`PASS preparation only: ${result.annualVersions} annual versions; ${result.retained} retained; ${result.notRetained} not retained; publicationReady=${result.publicationReady}.`);
}
