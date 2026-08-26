import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const BUCKET = "witness-tree-raw-archive-ca-central-1";
const REGION = "ca-central-1";
const RETAIN_UNTIL = "2033-08-12T00:00:00Z";
const COLLECTION = "394f05f984b164b7524e77b00fc73246a791d6c4112f7cc080c43fb3d8a2c0e0";
const PROFILE = "5450a1beade6f8dbbf73320a8751a3131bede150d95bb8847d9522b10ad985f9";
const MANIFEST = "b3d85d1da40d68d79742c77ec418713f2ef968f74845c43e011df274d559616c";
const SHA256 = /^[a-f0-9]{64}$/;
const SHEET = /^\d{2}[A-P]$/;
const BASE = "raw/qc-fourth-inventory/fourth-inventory-2001-2018/2026-08-14";
const CLAIMS = { remoteObjectsExist: false, retentionApplied: false, immutableObjectStorage: false, transformed: false, ingested: false, productionEligible: false };

export function canonicalManifestForPlan(plan) {
  return {
    schemaVersion: "witness-tree/qc-fourth-inventory-immutable-collection/1",
    status: "promotion-preparation-only",
    dataset: plan.dataset,
    retrievalDate: "2026-08-14",
    archiveSet: {
      count: plan.archiveSet.count,
      byteLength: plan.archiveSet.byteLength,
      digestAlgorithm: "sha256-over-canonical-tab-separated-sheet-byte-sha-member-byte-crc-lines",
      digest: plan.archiveSet.digest,
      zipIntegrity: "passed-all-56",
      payloads: plan.archiveSet.payloads
    },
    evidenceArtifacts: plan.evidenceArtifacts,
    profileSummary: plan.profileSummary,
    excludedSupportingArtifact: plan.exclusionDecision,
    claims: plan.claims
  };
}

export function canonicalManifestBytes(plan) {
  return Buffer.from(`${JSON.stringify(canonicalManifestForPlan(plan), null, 2)}\n`);
}

export function exactPromotionObjects(plan) {
  return [
    ...plan.archiveSet.payloads.map((entry) => ({ id: `sheet-${entry.sheet}`, ...entry })),
    ...plan.evidenceArtifacts,
    { ...plan.canonicalManifest, id: "canonical-collection-manifest", generated: true }
  ];
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function expectedKey(entry) {
  return `${BASE}/${entry.sha256}/payload/${entry.originalFilename.toLowerCase()}`;
}

export function validateQcFourthInventoryPromotionPreparation(plan, iam) {
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.status, "blocked-preparation-only");
  assert.match(plan.notice, /Dry run makes no AWS or IAM call/i);
  assert.match(plan.notice, /exact-artifact, IAM, MFA-session and irreversible COMPLIANCE-retention approvals/i);
  assert.equal(plan.sourceCommit, "43905d0b47b60c005b26d4ad5b65e0f5a020d0da");
  assert.equal(plan.productionRowId, "qc-fourth-inventory");
  assert.equal(plan.bucket, BUCKET);
  assert.equal(plan.region, REGION);
  assert.deepEqual(plan.retention, { mode: "COMPLIANCE", retainUntil: RETAIN_UNTIL });
  assert.deepEqual(plan.requiredApprovals, { exactArtifactSet: false, irreversibleComplianceRetention: false, leastPrivilegeIamPolicy: false, mfaSessionExecution: false });
  assert.deepEqual(plan.claims, CLAIMS);
  assert.equal(plan.dataset.id, "77ec9009-b733-4f09-ade3-99d7b2156ad4");
  assert.equal(plan.dataset.licence.id, "cc-by-4.0");
  assert.equal(plan.dataset.licence.url, "https://www.donneesquebec.ca/licence/#cc-by");
  assert.match(plan.dataset.attribution, /Ministère des Ressources naturelles et des Forêts/);
  assert.match(plan.dataset.edition, /2001–2018.*complete since 2018/i);

  assert.equal(plan.archiveSet.count, 56);
  assert.equal(plan.archiveSet.byteLength, 16177306782);
  assert.equal(plan.archiveSet.digest, COLLECTION);
  assert.equal(plan.archiveSet.payloads.length, 56);
  assert.equal(plan.upload.multipartThresholdBytes, 536870912);
  assert.equal(plan.upload.partSizeBytes, 134217728);
  assert.equal(plan.upload.singlePutMaximumBytes, 5368709120);
  assert.equal(plan.upload.checksumAlgorithm, "SHA256");
  const sheets = new Set(); const keys = new Set(); let bytes = 0;
  for (const entry of plan.archiveSet.payloads) {
    assert.match(entry.sheet, SHEET);
    assert.ok(!sheets.has(entry.sheet)); sheets.add(entry.sheet);
    assert.equal(entry.originalFilename, `PRODUITS_IEQM_4_${entry.sheet}_GPKG.zip`);
    assert.equal(entry.dataRootRelativePath, `raw/qc-fourth-inventory/2026-08-14/sheet-products/${entry.originalFilename}`);
    assert.ok(Number.isSafeInteger(entry.byteLength) && entry.byteLength > 0);
    assert.match(entry.sha256, SHA256);
    assert.equal(entry.objectKey, expectedKey(entry));
    assert.ok(!keys.has(entry.objectKey)); keys.add(entry.objectKey);
    assert.equal(entry.head.status, 200);
    assert.equal(entry.head.contentLength, entry.byteLength);
    assert.equal(entry.head.url, entry.sourceUrl);
    assert.match(entry.head.lastModified, /GMT$/);
    assert.equal(entry.zipIntegrity, "passed");
    assert.equal(entry.member.name, `PRODUITS_IEQM_4_${entry.sheet}.gpkg`);
    assert.ok(Number.isSafeInteger(entry.member.byteLength) && entry.member.byteLength > entry.byteLength);
    assert.match(entry.member.crc32, /^[a-f0-9]{8}$/);
    bytes += entry.byteLength;
  }
  assert.equal(bytes, plan.archiveSet.byteLength);
  const digestLines = [...plan.archiveSet.payloads].sort((a, b) => a.sheet.localeCompare(b.sheet)).map((entry) => `${entry.sheet}\t${entry.byteLength}\t${entry.sha256}\t${entry.member.name}\t${entry.member.byteLength}\t${entry.member.crc32}`).join("\n") + "\n";
  assert.equal(sha256(digestLines), COLLECTION);

  const requiredEvidence = new Map([
    ["publisher-metadata", [26567, "eb78b91cb0c8ec05ad0b25e13a0a2569663e04abc6a6f42432f51b66e1676e60"]],
    ["publisher-documentation", [612203, "ffeacd42c75c27b019f4ea46e2bfd73e9b23a04b55be236259ecf6a2147e456c"]],
    ["publisher-download-index", [29104, "8525f3153f2e4ea30b6be78f0c93019e80fb9f4570db53221badea4c4a4abadd"]],
    ["corrected-url-head-evidence", [12661, "cf8b068eb3164fd3d195ce6c84edd1057ff93dae3e844f50fbea54ceda700539"]],
    ["exhaustive-profile", [1027637, PROFILE]]
  ]);
  assert.equal(plan.evidenceArtifacts.length, requiredEvidence.size);
  for (const entry of plan.evidenceArtifacts) {
    const expected = requiredEvidence.get(entry.id);
    assert.ok(expected, `Unexpected evidence artifact ${entry.id}.`);
    assert.equal(entry.byteLength, expected[0]); assert.equal(entry.sha256, expected[1]);
    assert.match(entry.role, /\S/); assert.match(entry.dataRootRelativePath, /^(raw|work)\/qc-fourth-inventory\//);
    assert.equal(entry.objectKey, `${BASE}/collection-${COLLECTION}/evidence/${entry.sha256}/${entry.originalFilename.toLowerCase()}`);
    assert.ok(!keys.has(entry.objectKey)); keys.add(entry.objectKey);
  }
  assert.deepEqual(plan.profileSummary, { sha256: PROFILE, crs: "EPSG:32198", standFeatureCount: 7489195, standMissing: 0, standEmpty: 0, standInvalid: 0 });

  assert.equal(plan.exclusionDecision.originalFilename, "CARTE_ECO_ORI_4_PROV_gpkg.zip");
  assert.equal(plan.exclusionDecision.byteLength, 8096656664);
  assert.equal(plan.exclusionDecision.sha256, "62f61998be33d1e3d2f23f6c77e90ca946a40bda0d5d86b00c976c339877d25b");
  assert.equal(plan.exclusionDecision.decision, "excluded-map-only-redundant-component");
  assert.match(plan.exclusionDecision.reason, /complete named product.*result tables.*provincial archive contains only the map component.*adds no required raw input/is);

  const manifestBytes = canonicalManifestBytes(plan);
  assert.equal(manifestBytes.length, plan.canonicalManifest.byteLength);
  assert.equal(sha256(manifestBytes), MANIFEST);
  assert.equal(plan.canonicalManifest.sha256, MANIFEST);
  assert.equal(plan.canonicalManifest.objectKey, `${BASE}/collection-${COLLECTION}/manifest/${MANIFEST}/collection-manifest.json`);
  assert.ok(!keys.has(plan.canonicalManifest.objectKey)); keys.add(plan.canonicalManifest.objectKey);
  assert.equal(exactPromotionObjects(plan).length, 62);
  assert.equal(plan.archiveSet.payloads.filter((entry) => entry.byteLength > plan.upload.multipartThresholdBytes).length, 6);

  for (const action of ["DeleteObject", "DeleteObjectVersion", "AbortMultipartUpload", "BypassGovernanceRetention", "PutObjectLegalHold", "PutBucketObjectLockConfiguration", "PutBucketVersioning", "PutLifecycleConfiguration", "any object key not enumerated by this preparation"]) assert.ok(plan.forbiddenActions.includes(action));
  validateIam(iam, [...keys]);
  return plan;
}

function validateIam(iam, keys) {
  assert.equal(iam.Version, "2012-10-17");
  assert.deepEqual(
    new Set(iam.Statement.map((statement) => statement.Sid)),
    new Set(["ExactMfaGatedPromotionObjectsOnly", "DenyObjectAccessOutsideExactObjectSet", "DenyUnscopedBucketListing", "DenyDeletionBypassAndBucketMutation"]),
  );
  assert.equal(iam.Statement.length, 4);
  const allow = iam.Statement.find((statement) => statement.Sid === "ExactMfaGatedPromotionObjectsOnly");
  assert.deepEqual(allow.Action, ["s3:PutObject", "s3:GetObjectVersion", "s3:GetObjectRetention", "s3:PutObjectRetention", "s3:ListMultipartUploadParts"]);
  const resources = keys.map((key) => `arn:aws:s3:::${BUCKET}/${key}`).sort();
  assert.deepEqual([...allow.Resource].sort(), resources);
  assert.deepEqual(allow.Condition, { Bool: { "aws:MultiFactorAuthPresent": "true" }, NumericLessThan: { "aws:MultiFactorAuthAge": "43200" } });
  const outside = iam.Statement.find((statement) => statement.Sid === "DenyObjectAccessOutsideExactObjectSet");
  assert.equal(outside.Effect, "Deny");
  assert.deepEqual(outside.Action, ["s3:GetObject", "s3:GetObjectVersion", "s3:GetObjectRetention", "s3:ListMultipartUploadParts", "s3:PutObject", "s3:PutObjectRetention"]);
  assert.deepEqual([...outside.NotResource].sort(), resources);
  const listing = iam.Statement.find((statement) => statement.Sid === "DenyUnscopedBucketListing");
  assert.deepEqual(listing, {
    Sid: "DenyUnscopedBucketListing",
    Effect: "Deny",
    Action: ["s3:ListBucket", "s3:ListBucketVersions", "s3:ListBucketMultipartUploads"],
    Resource: `arn:aws:s3:::${BUCKET}`,
  });
  const destructive = iam.Statement.find((statement) => statement.Sid === "DenyDeletionBypassAndBucketMutation");
  assert.equal(destructive.Effect, "Deny");
  assert.deepEqual(destructive.Action, ["s3:DeleteObject", "s3:DeleteObjectVersion", "s3:AbortMultipartUpload", "s3:BypassGovernanceRetention", "s3:PutObjectLegalHold", "s3:PutBucketObjectLockConfiguration", "s3:PutBucketVersioning", "s3:PutLifecycleConfiguration", "s3:DeleteBucket", "s3:ReplicateObject", "s3:ReplicateDelete"]);
  assert.deepEqual(destructive.Resource, [`arn:aws:s3:::${BUCKET}`, `arn:aws:s3:::${BUCKET}/*`]);
}

export function qcFourthInventoryIamBatches(plan) {
  const batches = JSON.parse(readFileSync(new URL("../data/qc-fourth-inventory-immutable-promotion-iam-batches.json", import.meta.url), "utf8"));
  const objects = exactPromotionObjects(plan).map((entry) => `arn:aws:s3:::${BUCKET}/${entry.objectKey}`).sort();
  assert.deepEqual(batches, { schemaVersion: 1, roles: [
    { id: "batch-one", roleName: "WitnessTreeQcFourthArchivePromotionUploader", policyName: "WitnessTreeQcFourthArchiveExactObjectsBatchOne", resourceIndexes: [0, 31] },
    { id: "batch-two", roleName: "WitnessTreeQcFourthArchivePromotionUploaderBatchTwo", policyName: "WitnessTreeQcFourthArchiveExactObjectsBatchTwo", resourceIndexes: [31, 62] }
  ], sourcePolicy: "qc-fourth-inventory-immutable-promotion-iam-policy.json" });
  const split = batches.roles.map((batch) => ({ ...batch, resources: objects.slice(...batch.resourceIndexes) }));
  assert.equal(new Set(split.flatMap((batch) => batch.resources)).size, 62);
  assert.deepEqual(split.flatMap((batch) => batch.resources).sort(), objects);
  return split;
}

export function loadQcFourthInventoryPromotionPreparation() {
  const plan = JSON.parse(readFileSync(new URL("../data/qc-fourth-inventory-immutable-promotion-preparation.json", import.meta.url), "utf8"));
  const iam = JSON.parse(readFileSync(new URL("../data/qc-fourth-inventory-immutable-promotion-iam-policy.json", import.meta.url), "utf8"));
  validateQcFourthInventoryPromotionPreparation(plan, iam);
  qcFourthInventoryIamBatches(plan);
  return plan;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const plan = loadQcFourthInventoryPromotionPreparation();
  console.log(`Québec fourth-inventory immutable preparation passed: ${plan.archiveSet.count} payloads, ${plan.evidenceArtifacts.length + 1} locked evidence objects, 6 resumable multipart uploads; AWS not called.`);
}
