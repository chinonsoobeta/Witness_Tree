import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKET_PATH = "data/phase1-downstream-admission-packet.json";
const PACKET_SHA256 = "82c55e3bea87d1a3856b233b2e483cd9b5318afd3d998bd753867af944370520";
const APPROVED_BUNDLES = [
  ["ntems-annual-land-cover", ["ntems-annual-land-cover"], "ntems-annual-land-cover-v1"],
  ["ntems-forest-harvest", ["ntems-forest-harvest"], "ntems-forest-harvest-v1"],
  ["ntems-canopy-cover", ["ntems-canopy-cover"], "ntems-canopy-cover-v1"],
  ["ntems-canopy-height", ["ntems-canopy-height"], "ntems-canopy-height-v1"],
  ["federal-electoral", ["fed-2023-ridings", "elections-canada-45th-files"], "federal-electoral-districts-2023-v1"],
  ["qc-current-ecoforest", ["qc-current-ecoforest"], "qc-current-ecoforest-stand-copy-v1"],
  ["qc-original-current-inventory", ["qc-original-current-inventory"], "qc-original-current-inventory-stand-copy-v1"],
];
const CLAIMS = {
  transformationScopeApproved: true,
  transformed: false,
  ingested: false,
  released: false,
  productionAdmission: false,
  productionEligible: false,
  externalMutationPerformed: false,
};
const BOUNDARY = {
  transformationScopeApproved: true,
  executionAuthorized: false,
  ingestionAuthorized: false,
  releaseAuthorized: false,
  productionAdmissionAuthorized: false,
  productionEligibilityGranted: false,
  externalMutationPerformed: false,
};
const sha256 = (root, relativePath) => createHash("sha256").update(readFileSync(path.join(root, relativePath))).digest("hex");
const readJson = (root, relativePath) => JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));

function findSpec(record, specId) {
  if (record.id === specId) return record;
  return record.specifications?.find((specification) => specification.id === specId);
}

export function validatePhase1TransformationScopeOwnerApproval(record, root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  assert.deepEqual(Object.keys(record).sort(), ["approvedScopes", "claims", "decisionBoundary", "notice", "ownerDecision", "recordedOn", "schemaVersion", "status"].sort(), "approval record keys");
  assert.equal(record.schemaVersion, "witness-tree/phase1-transformation-scope-owner-approval/1");
  assert.equal(record.status, "owner-approved-transformation-scope-only");
  assert.equal(record.recordedOn, "2026-08-25");
  assert.match(record.notice, /does not authorize execution, ingestion, release, production admission, production eligibility, or any external mutation/i);
  assert.deepEqual(record.ownerDecision, {
    decisionId: "phase1-seven-transformation-scopes-v1",
    ownerName: "Chinonso Obeta",
    statement: "I approve all seven Phase 1 transformation scopes.",
    decision: "approve",
    packet: { path: PACKET_PATH, sha256: PACKET_SHA256 },
    scope: "Approve only the seven named transformation designs bound by the packet hash and specification hashes below.",
    acknowledgements: [
      "seven-named-scopes-reviewed",
      "exact-packet-and-specification-bindings-reviewed",
      "no-execution-or-external-mutation",
      "no-ingestion-release-or-production-admission",
    ],
  }, "owner decision");
  assert.deepEqual(record.decisionBoundary, BOUNDARY, "decision boundary");
  assert.deepEqual(record.claims, CLAIMS, "claims");

  const packet = readJson(root, PACKET_PATH);
  // Specification checksums moved into their own registry so that correcting one
  // specification no longer changes the packet, whose checksum every scope binds.
  assert.equal(packet.specificationRegistry?.path, "data/phase1-transformation-spec-registry.json", "packet must name the specification registry");
  const specRegistry = readJson(root, packet.specificationRegistry.path);
  assert.equal(sha256(root, PACKET_PATH), PACKET_SHA256, "downstream packet checksum drift");
  assert.equal(packet.schemaVersion, "witness-tree/phase1-downstream-admission-packet/2");
  assert.equal(packet.status, "owner-transformation-scope-decision-preparation-read-only");
  assert.deepEqual(packet.claims, {
    ownerDecisionCreated: false,
    transformed: false,
    ingested: false,
    released: false,
    productionAdmission: false,
    productionEligible: false,
    externalMutationPerformed: false,
  }, "preparation packet claims");

  assert.equal(record.approvedScopes.length, APPROVED_BUNDLES.length, "approved scope count");
  const ready = packet.bundles.filter(({ technicalReadiness }) => technicalReadiness === "ready-for-owner-approve-reject-defer-transformation-scope");
  assert.deepEqual(ready.map(({ id }) => id), APPROVED_BUNDLES.map(([id]) => id), "ready scope set");
  assert.deepEqual(packet.bundles.filter(({ technicalReadiness }) => technicalReadiness === "blocked-named-prerequisites").map(({ id }) => id), [
    "qc-fourth-inventory", "ab-avi-crown", "ab-avi-post-harvest", "ab-primary-land-vegetation", "cwfis-current", "bc-wildfire", "ab-wildfire", "on-fire-disturbance",
  ], "blocked scope set");

  for (const [index, [bundleId, rows, specId]] of APPROVED_BUNDLES.entries()) {
    const scope = record.approvedScopes[index];
    assert.deepEqual(Object.keys(scope).sort(), ["bundleId", "decision", "rows", "specId", "specPath", "specSha256"].sort(), `scope ${bundleId} keys`);
    assert.equal(scope.bundleId, bundleId);
    assert.deepEqual(scope.rows, rows);
    assert.equal(scope.specId, specId);
    assert.equal(scope.decision, "approve");
    const bundle = packet.bundles.find(({ id }) => id === bundleId);
    assert.ok(bundle, `missing packet bundle: ${bundleId}`);
    assert.equal(bundle.technicalReadiness, "ready-for-owner-approve-reject-defer-transformation-scope");
    assert.deepEqual(bundle.rows, rows, `scope rows drift: ${bundleId}`);
    assert.equal(bundle.specId, specId, `scope spec drift: ${bundleId}`);
    const binding = specRegistry.specificationBindings.find(({ specId: candidate }) => candidate === specId);
    assert.ok(binding, `missing packet specification binding: ${specId}`);
    assert.equal(scope.specPath, binding.path, `scope specification path drift: ${specId}`);
    assert.equal(scope.specSha256, binding.sha256, `scope specification checksum drift: ${specId}`);
    assert.equal(sha256(root, scope.specPath), scope.specSha256, `specification file checksum drift: ${scope.specPath}`);
    const specificationRecord = readJson(root, scope.specPath);
    const specification = findSpec(specificationRecord, specId);
    assert.ok(specification, `missing specification: ${specId}`);
    assert.deepEqual(specification.sourceLedgerRows ?? [specification.sourceId], rows, `specification scope drift: ${specId}`);
    if (specification.admission) {
      assert.equal(specification.admission.transformationApproved, false, `specification must remain non-admitting: ${specId}`);
      assert.equal(specification.admission.ingestionApproved, false, `specification ingestion claim: ${specId}`);
      assert.equal(specification.admission.releaseApproved, false, `specification release claim: ${specId}`);
      assert.equal(specification.admission.productionEligible, false, `specification production claim: ${specId}`);
    } else {
      assert.match(specificationRecord.status, /unapproved|specification-only|not-approved/i, `specification status must remain non-admitting: ${specId}`);
      assert.equal(specification.output?.checksumSha256, null, `specification output must remain unexecuted: ${specId}`);
    }
  }
  return record;
}

export function checkPhase1TransformationScopeOwnerApproval(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  return validatePhase1TransformationScopeOwnerApproval(readJson(root, "data/phase1-transformation-scope-owner-approval-2026-08-25.json"), root);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  checkPhase1TransformationScopeOwnerApproval();
  console.log("Phase 1 transformation-scope approval passed: seven named scopes approved only for later, separately gated execution.");
}
