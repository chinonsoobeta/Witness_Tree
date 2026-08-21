import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate as validateRawArchiveEvidence } from "./check-current-wildfire-raw-archive-evidence.mjs";
import { validateCurrentWildfireDerivedArchiveEvidence } from "./check-current-wildfire-derived-archive-evidence.mjs";
import { validate as validateDerivedPromotionPlan } from "./prepare-wildfire-derived-immutable-promotion.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const SHA = /^[a-f0-9]{64}$/;
const VERSION = /^[A-Za-z0-9._-]{6,}$/;
const DERIVED_PLAN = validateDerivedPromotionPlan();
const DERIVED_ARTIFACT_BY_SOURCE = new Map(DERIVED_PLAN.artifacts.map((artifact) => [artifact.sourceId, artifact]));

function requiredDerivedObject(id, sourceId) {
  const artifact = DERIVED_ARTIFACT_BY_SOURCE.get(sourceId);
  assert.ok(artifact, `${sourceId} is missing from the canonical derived promotion plan.`);
  return {id, key: artifact.payloadKey, bytes: artifact.byteLength, sha256: artifact.sha256};
}

export const requiredCurrentWildfireObjects = [
  {id:"cwfis-current-raw",key:"raw/cwfis-current/undeclared/2026-08-14T20-24-34Z/fc3d4a0730f30d6f12782b16e9459c173dabd6e50d0715b27cddecd954097f86/payload/cwfif_national_activefires_2026-08-14t202242z.zip",bytes:45917,sha256:"fc3d4a0730f30d6f12782b16e9459c173dabd6e50d0715b27cddecd954097f86"},
  {id:"bc-wildfire-raw",key:"raw/bc-wildfire/undeclared/2026-08-14T20-31-39Z/46ee3a97ff83128630a030b5cfcc7f3c389fc94e3ca95d463595ab6f4fb57e83/payload/bc-wildfire-fire-perimeters_2026-08-14.geojson",bytes:4813292,sha256:"46ee3a97ff83128630a030b5cfcc7f3c389fc94e3ca95d463595ab6f4fb57e83"},
  requiredDerivedObject("bc-wildfire-derived", "bc-wildfire"),
  {id:"ab-wildfire-raw",key:"raw/ab-wildfire/undeclared/2026-08-14T13-42-09Z/f0e86ea34a7624c365349b3a8fbb77967bb45ab73c507cf441efb8f6a8736ee0/payload/alberta-wildfire-locations_2026-08-14.geojson",bytes:423853,sha256:"f0e86ea34a7624c365349b3a8fbb77967bb45ab73c507cf441efb8f6a8736ee0"},
  {id:"on-fire-disturbance-raw",key:"raw/on-fire-disturbance/undeclared/2026-08-14T13-49-36Z/99881f19a32068b5d66b244955f7b088e873ffe76eafebf1740f03e16f042f11/payload/ontario-in-year-fire-perimeters_2026-08-14.geojson",bytes:19510504,sha256:"99881f19a32068b5d66b244955f7b088e873ffe76eafebf1740f03e16f042f11"},
  requiredDerivedObject("on-fire-disturbance-derived", "on-fire-disturbance")
];

const PLACEHOLDER = "redacted-present";

function validPrimaryRetention(value) {
  return value?.mode === "COMPLIANCE"
    && (value.until ?? value.retainUntil) === "2033-08-12T00:00:00Z"
    && value.readbackVerified !== false;
}

/** Redacted booleans and placeholders cannot bind a payload to an exact remote version. */
export function primaryEvidenceSatisfiesCurrentWildfireGate(rawEvidence, derivedEvidence) {
  try {
    validateRawArchiveEvidence(rawEvidence);
    validateCurrentWildfireDerivedArchiveEvidence(derivedEvidence);
  } catch {
    return false;
  }

  const rawBySource = new Map(rawEvidence.entries.map((entry) => [entry.sourceId, entry]));
  const derivedById = new Map(derivedEvidence.objects.filter(({ kind }) => kind === "payload").map((object) => [object.id, object]));
  return requiredCurrentWildfireObjects.every((expected) => {
    if (expected.id.endsWith("-raw")) {
      const sourceId = expected.id.replace(/-raw$/, "");
      const entry = rawBySource.get(sourceId);
      return entry?.payloadKey === expected.key
        && entry.bytes === expected.bytes
        && entry.sha256 === expected.sha256
        && typeof entry.payloadVersionId === "string"
        && VERSION.test(entry.payloadVersionId)
        && entry.payloadChecksum?.type === "FULL_OBJECT"
        && entry.payloadChecksum?.algorithm === "CRC64NVME"
        && typeof entry.payloadChecksum?.providerValue === "string"
        && entry.payloadChecksum.providerValue !== PLACEHOLDER
        && entry.payloadRetention?.mode === "COMPLIANCE"
        && entry.payloadRetention.until === "2033-08-12T00:00:00Z";
    }
    const object = derivedById.get(`${expected.id}-payload`);
    return object?.key === expected.key
      && object.bytes === expected.bytes
      && object.sha256 === expected.sha256
      && typeof object.versionId === "string"
      && VERSION.test(object.versionId)
      && object.fullObjectChecksumVerified === true
      && object.exactVersionReadback === true
      && object.checksum?.type === "FULL_OBJECT"
      && object.checksum?.algorithm === "CRC64NVME"
      && typeof object.checksum?.providerValue === "string"
      && object.checksum.providerValue !== PLACEHOLDER
      && validPrimaryRetention(object.retention);
  });
}

export function remoteEvidenceSatisfiesCurrentWildfireGate(evidence) {
  if (!evidence || evidence.schemaVersion !== "witness-tree/current-wildfire-immutable-readbacks/1" || evidence.region !== "ca-central-1" || !Array.isArray(evidence.objects) || evidence.objects.length !== requiredCurrentWildfireObjects.length) return false;
  const byId = new Map(evidence.objects.map((object) => [object.id, object]));
  if (byId.size !== requiredCurrentWildfireObjects.length) return false;
  return requiredCurrentWildfireObjects.every((expected) => {
    const object = byId.get(expected.id);
    return object?.key === expected.key
      && object.bytes === expected.bytes
      && object.sha256 === expected.sha256
      && SHA.test(object.sha256)
      && VERSION.test(object.versionId ?? "")
      && object.fullObjectChecksumVerified === true
      && object.checksum?.type === "FULL_OBJECT"
      && object.checksum?.algorithm === "CRC64NVME"
      && typeof object.checksum?.providerValue === "string"
      && object.checksum.providerValue !== PLACEHOLDER
      && object.exactVersionReadback === true
      && object.retention?.mode === "COMPLIANCE"
      && Date.parse(object.retention.retainUntil) >= Date.parse("2033-08-12T00:00:00Z")
      && object.retention.readbackVerified === true;
  });
}

export function evaluateCurrentWildfireProductionEligibility(record, evidence) {
  return record?.ownerDecision?.scopeApproved === true
    && record.ownerDecision.geometryApproved === true
    && record.ownerDecision.transformationApproved === true
    && record.ownerDecision.ingestionApproved === true
    && record.ownerDecision.publicReleaseApproved === true
    && record.ownerDecision.productionAdmissionApproved === true
    && remoteEvidenceSatisfiesCurrentWildfireGate(evidence);
}

export function validateCurrentWildfireOwnerAdmission(record, ledger, profiles, policies, remoteEvidence = null, rawEvidence = read("data/current-wildfire-raw-archive-evidence.json"), derivedEvidence = read("data/current-wildfire-derived-archive-evidence.json")) {
  assert.equal(record.schemaVersion, "witness-tree/current-wildfire-owner-admission/1");
  assert.equal(record.status, "owner-approved-pipeline-blocked-on-machine-verifiable-readbacks");
  assert.deepEqual(record.ownerDecision, {
    scopeApproved: true,
    geometryApproved: true,
    transformationApproved: true,
    ingestionApproved: true,
    publicReleaseApproved: true,
    productionAdmissionApproved: true,
    condition: "Every exact raw payload and each required derived payload must first have repository-integrated immutable archive readback evidence. Approval does not itself satisfy that condition."
  });
  assert.equal(record.archiveGate.status, "blocked-placeholder-only-version-and-checksum-evidence");
  assert.equal(record.archiveGate.evidenceRef, "data/current-wildfire-raw-archive-evidence.json");
  assert.equal(record.archiveGate.derivedEvidenceRef, "data/current-wildfire-derived-archive-evidence.json");
  assert.equal(record.archiveGate.requiredObjectCount, 6);
  assert.equal(record.archiveGate.verifiedObjectCount, 0);
  assert.equal(record.archiveGate.attestedObjectCount, 6);
  assert.equal(record.archiveGate.primaryReadbacksVerified, false);
  assert.equal(record.archiveGate.recoveryReplicaVerified, false);
  assert.equal(record.archiveGate.mutationProvenance, false);
  assert.equal(record.archiveGate.productionEligible, false);
  assert.match(record.refreshAndAuthority.representation, /as-of snapshot.*never label.*real-time/i);
  assert.match(record.refreshAndAuthority.precedence, /provincial.*prevails over CWFIS/i);
  assert.match(record.refreshAndAuthority.failurePolicy, /Reject empty, capped, partial, schema-drifted, invalid, checksum-unbound or unarchived input/i);

  assert.deepEqual(record.sources.map(({id}) => id), ["cwfis-current", "bc-wildfire", "ab-wildfire", "on-fire-disturbance"]);
  for (const source of record.sources) {
    assert.equal(source.productionEligible, false);
    assert.match(source.transformation, /\S/);
    assert.match(source.ingestion, /\S/);
    assert.match(source.release, /\S/);
    const profile = profiles[source.id];
    assert.equal(source.raw.bytes, profile.artifact.bytes);
    assert.equal(source.raw.sha256, profile.artifact.sha256);
    const row = ledger.entries.find(({id}) => id === source.id);
    assert.ok(row.evidenceRefs.includes("data/current-wildfire-owner-admission.json"));
    assert.equal(row.proof.immutableArchive, false);
    assert.equal(row.proof.productionAdmission, false);
    assert.equal(row.productionEligible, false);
  }

  const cwfis = record.sources[0];
  assert.equal(cwfis.raw.featureCount, 586);
  assert.match(cwfis.release, /not real-time.*not a complete incident or perimeter inventory.*not provincial-agency authoritative/i);
  const bc = record.sources[1];
  assert.deepEqual(bc.derived, {bytes:2162688,sha256:policies.bc.derivedRelease.sha256,featureCount:216,unchanged:215,repaired:["G70362"],excludedAndQuarantined:["V10755"],excludedRelativeAreaDelta:0.03167100456325357,invalid:0,empty:0});
  assert.equal(bc.raw.featureCount, 217);
  assert.match(bc.release, /never claim 217-feature geometry coverage/i);
  assert.match(bc.transformation, /permanently exclude and quarantine V10755/i);
  const ab = record.sources[2];
  assert.equal(ab.raw.featureCount, 751);
  assert.match(ab.release, /not.*complete perimeter/i);
  const ontario = record.sources[3];
  assert.deepEqual(ontario.derived, {bytes:7913472,sha256:policies.ontario.derivedRelease.sha256,featureCount:188,unchanged:179,repairedCount:9,excludedAndQuarantined:[],invalid:0,empty:0});
  assert.match(ontario.transformation, /zero exclusion|no exclusion/i);

  assert.deepEqual(record.pipeline, {
    transformation: "approved-scope-defined-local-artifacts-not-machine-verifiably-archived",
    ingestion: "approved-blocked-on-machine-verifiable-archive-gate",
    release: "approved-blocked-on-machine-verifiable-archive-gate",
    productionAdmission: "approved-blocked-on-machine-verifiable-archive-gate",
    productionEligible: false,
    activationRule: "The machine gate may return productionEligible=true only when integrated evidence cryptographically binds each of the six exact raw/derived payloads to a concrete object version and non-placeholder full-object checksum value, and proves exact-version readback, retention, Canadian storage, and the approved downstream decision."
  });
  assert.equal(primaryEvidenceSatisfiesCurrentWildfireGate(rawEvidence, derivedEvidence), false, "Placeholder-only booleans and redacted checksum markers cannot close the six-object archive gate.");
  assert.equal(derivedEvidence.claims.recoveryReplicaVerified, false);
  assert.equal(derivedEvidence.claims.mutationProvenance, false);
  assert.equal(evaluateCurrentWildfireProductionEligibility(record, remoteEvidence), false, "No unintegrated or incomplete remote evidence may activate production.");
  return record;
}

export function checkCurrentWildfireOwnerAdmission() {
  return validateCurrentWildfireOwnerAdmission(
    read("data/current-wildfire-owner-admission.json"),
    read("data/phase1-production-source-ledger.json"),
    {"cwfis-current":read("data/cwfis-current-active-fires-profile.json"),"bc-wildfire":read("data/bc-wildfire-current-perimeters-profile.json"),"ab-wildfire":read("data/alberta-wildfire-locations-profile.json"),"on-fire-disturbance":read("data/ontario-in-year-fire-perimeters-profile.json")},
    {bc:read("data/bc-wildfire-geometry-policy-2026-08-14.json"),ontario:read("data/ontario-in-year-fire-geometry-policy-2026-08-14.json")},
    null,
    read("data/current-wildfire-raw-archive-evidence.json"),
    read("data/current-wildfire-derived-archive-evidence.json")
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  checkCurrentWildfireOwnerAdmission();
  console.log("Current-wildfire owner scope is approved, but 0/6 payloads have machine-verifiable version/checksum bindings; production remains blocked.");
}
