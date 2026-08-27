import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exactPromotionObjects, validateQcFourthInventoryPromotionPreparation } from "./check-qc-fourth-inventory-immutable-promotion.mjs";
import { validateNbacArchiveIamApplied } from "./check-nbac-archive-iam-applied.mjs";
import { validatePhase1NbacOwnerAuthorization } from "./check-phase1-nbac-owner-authorization.mjs";
import { validatePhase1NbacProfile } from "./check-phase1-nbac-profile.mjs";
import { validateNbacImmutablePromotionPreparation } from "./prepare-nbac-immutable-promotion.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const CLAIMS = { remoteObjectExists: false, sidecarUploaded: false, retentionApplied: false, immutableObjectStorage: false, transformed: false, ingested: false, productionAdmission: false, productionEligible: false };
const RETENTION = { mode: "COMPLIANCE", retainUntil: "2033-08-12T00:00:00Z" };
const EXPECTED = [
  { id: "federal-electoral-archive", rows: ["fed-2023-ridings", "elections-canada-45th-files"], preflight: "zsh scripts/run-phase1-approved-promotion.sh --preflight", commandKey: "ownerCommand", command: "zsh scripts/run-phase1-approved-promotion.sh --run-federal" },
  { id: "quebec-current-original-archive", rows: ["qc-current-ecoforest", "qc-original-current-inventory"], preflight: "zsh scripts/run-qc-approved-multipart-promotion.sh --preflight", commandKey: "ownerCommand", command: "zsh scripts/run-qc-approved-multipart-promotion.sh --run" },
  { id: "quebec-fourth-inventory-archive", rows: ["qc-fourth-inventory"], preflight: "node scripts/qc-fourth-inventory-immutable-promotion.mjs --preflight --data-root /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data", commandKey: "ownerCommandTemplate", command: "node scripts/qc-fourth-inventory-immutable-promotion.mjs --execute --approve-exact-artifact-set --approve-iam-policy --approve-compliance-retention --approve-mfa-session --retention-until 2033-08-12T00:00:00Z --session-ready --data-root <controlled-absolute-path> --state-dir <controlled-absolute-path> --sidecar-dir <controlled-absolute-path>" },
];

export function validatePhase1ImmutablePromotionReadiness(audit, ledger, national, wildfire, wildfireAdmission, quebec, fourthEvidence, fourthPlan, fourthIam, approvals, nbacProfile, nbacAuthorization, nbacPreparation, nbacIam) {
  assert.equal(audit.schemaVersion, 1); assert.equal(audit.status, "preparation-audit-only");
  assert.equal(audit.asOf, "2026-08-27");
  assert.match(audit.notice, /does not call AWS.*alter IAM.*production eligible/i);
  assert.deepEqual(audit.destination, { bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", countryCode: "CA", retentionMode: "COMPLIANCE", recommendedRetainUntil: "2033-08-12T00:00:00Z" });
  assert.deepEqual(audit.claims, CLAIMS);
  const pendingOrCompletedRows = ledger.entries.filter((entry) => entry.evidenceState === "local-verified-profiled" || entry.evidenceRefs.includes("data/qc-immutable-promotion-attestation.json") || entry.evidenceRefs.includes("data/federal-electoral-archive-recovery-evidence.json") || entry.evidenceRefs.includes("data/current-wildfire-exact-raw-archive-capture-2026-08-25.json") || entry.evidenceRefs.includes("data/qc-fourth-inventory-exact-archive-readback-2026-08-25.json")).map(({ id }) => id).sort();
  assert.deepEqual([...audit.coveredProductionRowIds].sort(), pendingOrCompletedRows);
  assert.equal(audit.physicalArtifactGroups.length, 5);
  const rows = audit.physicalArtifactGroups.flatMap((group) => group.productionRowIds);
  assert.equal(new Set(rows).size, rows.length); assert.deepEqual([...rows].sort(), pendingOrCompletedRows);
  const [nationalGroup, wildfireGroup, quebecGroup, fourthGroup, nbacGroup] = audit.physicalArtifactGroups;
  const approved = approvals.phase1.archiveApprovals;
  assert.equal(approved.length, 4);
  for (const expected of EXPECTED) {
    const actual = approved.find(({ id }) => id === expected.id);
    assert.ok(actual); assert.deepEqual(actual.rows, expected.rows); assert.deepEqual(actual.retention, RETENTION);
    assert.equal(actual.preflight, expected.preflight); assert.equal(actual[expected.commandKey], expected.command);
  }
  const wildfireApproval = approved.find(({ id }) => id === "current-wildfire-exact-archive-proof");
  assert.deepEqual(wildfireApproval.rows, ["cwfis-current", "bc-wildfire", "ab-wildfire", "on-fire-disturbance"]);
  assert.deepEqual(wildfireApproval.retention, { ...RETENTION, payloadsAndManifests: true });
  assert.equal(wildfireApproval.preflight, "zsh scripts/run-wildfire-derived-readback.sh --preflight <owner-owned-mode-600-copy-of-readback-approval>");
  assert.equal(nationalGroup.status, "approved-owner-local-federal-execution-evidence-pending"); assert.equal(nationalGroup.preflight, EXPECTED[0].preflight); assert.equal(nationalGroup.ownerCommand, EXPECTED[0].command); assert.equal(nationalGroup.physicalArtifactCount, national.artifacts.length); assert.deepEqual(nationalGroup.productionRowIds, EXPECTED[0].rows);
  assert.equal(wildfireGroup.status, "primary-exact-version-compliance-readback-captured");
  assert.equal(wildfireGroup.physicalArtifactCount, wildfireAdmission.archiveGate.requiredObjectCount);
  assert.equal(wildfireGroup.preparedRawArtifactCount, wildfire.artifacts.length);
  assert.equal(wildfireGroup.verifiedDerivedArtifactCount, 2);
  assert.equal(wildfireGroup.unpreparedDerivedArtifactCount, 0);
  assert.equal(wildfireGroup.preflight, wildfireApproval.preflight);
  assert.equal(wildfireGroup.ownerAdmission, "data/current-wildfire-owner-admission.json");
  assert.equal(wildfireGroup.derivedEvidence, "data/current-wildfire-derived-archive-evidence.json");
  assert.equal(wildfireAdmission.archiveGate.verifiedObjectCount, 6);
  assert.equal(wildfireAdmission.archiveGate.attestedObjectCount, 0);
  assert.match(wildfireGroup.blocker, /primary exact-version COMPLIANCE.*Recovery-replica.*production is false/i);
  assert.equal(wildfireGroup.proposedRole, wildfire.mfaGatedExecution.proposedRole); assert.deepEqual([...wildfireGroup.productionRowIds].sort(), wildfire.artifacts.map((artifact) => read("data/staged-acquisitions.json").entries.find((entry) => entry.id === artifact.id).sourceId).sort());
  assert.equal(quebecGroup.status, "immutable-attestation-captured-and-integrated"); assert.equal(quebecGroup.attestation, "data/qc-immutable-promotion-attestation.json"); assert.match(quebecGroup.blocker, /separate transformation, ingestion, release, and production-admission/i); assert.equal(quebecGroup.physicalArtifactCount, quebec.artifacts.length); assert.equal(quebecGroup.proposedRole, quebec.mfaGatedExecution.proposedRole); assert.deepEqual(quebecGroup.productionRowIds, EXPECTED[1].rows);
  assert.equal(fourthGroup.status, "independent-exact-version-compliance-readback-captured"); assert.equal(fourthGroup.readback, "data/qc-fourth-inventory-exact-archive-readback-2026-08-25.json"); assert.equal(fourthGroup.preparation, "data/qc-fourth-inventory-immutable-promotion-preparation.json"); assert.equal(fourthGroup.runner, "scripts/check-qc-fourth-inventory-exact-archive-readback.mjs"); assert.match(fourthGroup.blocker, /recovery-replica.*transformation.*production-admission/i);
  assert.equal(fourthGroup.physicalArtifactCount, exactPromotionObjects(validateQcFourthInventoryPromotionPreparation(fourthPlan, fourthIam)).length);
  assert.equal(fourthEvidence.fullProductAcquisition.archiveCount, fourthPlan.archiveSet.count);
  for (const field of ["remoteObjectsExist", "retentionApplied", "immutableObjectStorage", "transformed", "ingested", "productionEligible"]) assert.equal(fourthPlan.claims[field], false);
  validatePhase1NbacProfile(nbacProfile);
  validatePhase1NbacOwnerAuthorization(nbacAuthorization);
  validateNbacImmutablePromotionPreparation(nbacPreparation);
  validateNbacArchiveIamApplied(nbacIam);
  assert.deepEqual(nbacGroup, {
    id: "nbac-1972-2025",
    productionRowIds: ["cwfis-historical"],
    physicalArtifactCount: 1,
    profile: "data/phase1-nbac-profile-2026-08-27.json",
    ownerAuthorization: "data/phase1-nbac-owner-authorization-2026-08-27.json",
    preparation: "data/nbac-immutable-promotion-preparation.json",
    iamEvidence: "data/nbac-archive-iam-applied-2026-08-27.json",
    runner: "scripts/run-nbac-approved-promotion.sh",
    status: "owner-authorized-exact-key-iam-applied-storage-evidence-pending",
    blocker: "The exact local payload, profile, owner authorization, preparation and exact-key IAM readback are recorded, but no durable exact-version payload/manifest retention receipt exists. Immutable archive and all downstream admission states remain false.",
  });
  const nbacLedger = ledger.entries.find(({ id }) => id === "cwfis-historical");
  assert.equal(nbacLedger.evidenceState, "local-verified-profiled");
  assert.equal(nbacLedger.proof.immutableArchive, false);
  assert.equal(nbacLedger.productionEligible, false);
  assert.equal(nbacPreparation.claims.immutableArchive, false);
  assert.equal(nbacIam.claims.archiveObjectWritten, false);
  return audit;
}

export function checkPhase1ImmutablePromotionReadiness() {
  return validatePhase1ImmutablePromotionReadiness(read("data/phase1-immutable-promotion-readiness.json"), read("data/phase1-production-source-ledger.json"), read("data/phase1-local-profiled-promotion-preparation.json"), read("data/current-wildfire-immutable-promotion-preparation.json"), read("data/current-wildfire-owner-admission.json"), read("data/qc-immutable-promotion-preparation.json"), read("data/qc-fourth-inventory-evidence.json"), read("data/qc-fourth-inventory-immutable-promotion-preparation.json"), read("data/qc-fourth-inventory-immutable-promotion-iam-policy.json"), read("data/phase1-phase3-owner-approvals-2026-08-21.json"), read("data/phase1-nbac-profile-2026-08-27.json"), read("data/phase1-nbac-owner-authorization-2026-08-27.json"), read("data/nbac-immutable-promotion-preparation.json"), read("data/nbac-archive-iam-applied-2026-08-27.json"));
}

if (process.argv[1]?.endsWith("check-phase1-immutable-promotion-readiness.mjs")) {
  const audit = checkPhase1ImmutablePromotionReadiness();
  console.log(`Phase 1 immutable-promotion readiness audit passed: ${audit.coveredProductionRowIds.length} pending-or-completed rows, ${audit.physicalArtifactGroups.reduce((sum, group) => sum + group.physicalArtifactCount, 0)} tracked objects; wildfire recovery provenance and QC fourth downstream decisions remain blocked.`);
}
