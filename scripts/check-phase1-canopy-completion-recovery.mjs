import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const desiredPath = new URL("../data/phase1-canopy-completion-recovery-iam-delta.json", import.meta.url);
export const desiredIamDelta = JSON.parse(readFileSync(desiredPath, "utf8"));
const retentionDeltaPath = new URL("../data/phase1-canopy-recovery-retention-iam-delta.json", import.meta.url);
export const desiredRecoveryRetentionDelta = JSON.parse(readFileSync(retentionDeltaPath, "utf8"));

export const canopyRecoveryIamAttestation = Object.freeze({
  schemaVersion: "witness-tree/phase1-canopy-recovery-iam-attestation/2",
  policyName: desiredRecoveryRetentionDelta.policyName,
  delta: Object.freeze({
    sid: desiredRecoveryRetentionDelta.delta.sid,
    effect: desiredRecoveryRetentionDelta.delta.effect,
    actions: Object.freeze([...desiredRecoveryRetentionDelta.delta.actions]),
    resources: Object.freeze([...desiredRecoveryRetentionDelta.delta.resources])
  }),
  readbackCorrection: Object.freeze({
    sid: desiredIamDelta.delta.sid,
    actions: Object.freeze([...desiredIamDelta.delta.actions]),
    resources: Object.freeze([...desiredIamDelta.delta.resources]),
    removedCondition: Object.freeze(structuredClone(desiredIamDelta.authorizedConditionRemoval))
  }),
  simulations: Object.freeze(desiredRecoveryRetentionDelta.simulations.map((simulation) => Object.freeze({ ...simulation })))
});

export const canopyRecovery = Object.freeze({
  schemaVersion: "witness-tree/phase1-canopy-completion-recovery/1",
  stateSchemaVersion: 1,
  account: desiredIamDelta.account,
  role: desiredIamDelta.role,
  profile: desiredIamDelta.profile,
  region: desiredIamDelta.region,
  primary: Object.freeze({
    bucket: "witness-tree-raw-archive-ca-central-1",
    payloadKey: "raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/payload/ca_canopy_height_2022.zip",
    sidecarKey: "raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/manifest.json"
  }),
  recovery: Object.freeze({
    bucket: "witness-tree-raw-recovery-ca-central-1",
    payloadKey: "raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/payload/ca_canopy_height_2022.zip",
    sidecarKey: "raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/manifest.json"
  }),
  payloadBytes: 10347564066,
  sidecarBytes: 459,
  partSize: 67108864,
  partCount: 155,
  retainUntil: "2033-08-12T00:00:00Z",
  requiredSteps: Object.freeze([
    "read-exact-heads",
    "apply-compliance-retention-exact-payload-and-sidecar-versions",
    "read-exact-retention-back"
  ]),
  requiredExclusions: Object.freeze([
    "no-mpu-completion",
    "no-mpu-listing",
    "no-upload",
    "no-sidecar-rewrite",
    "no-delete",
    "no-bypass-governance",
    "no-legal-hold",
    "no-iam-change",
    "no-phase2",
    "no-production-inference"
  ])
});

const array = (value) => Array.isArray(value) ? value : [value];
const sorted = (values) => [...values].sort();
const statementActions = (statement) => array(statement.Action ?? []);
const statementResources = (statement) => array(statement.Resource ?? []);
const actionMatches = (statement, wanted) => statementActions(statement).some((action) => action === wanted || action === "*" || action === "s3:*");
const exactAllow = (statements, action, resource) => statements.some((statement) => statement.Effect === "Allow" && actionMatches(statement, action) && statementResources(statement).includes(resource));

function decodePolicyDocument(value) {
  if (typeof value === "string") return JSON.parse(decodeURIComponent(value));
  return value;
}

/** Validate the exact readback delta and the retention capabilities required at this stage. */
export function validateCanopyRecoveryIam(policyEnvelope, desired = desiredIamDelta, { requireRecoveryRetention = true } = {}) {
  const policy = decodePolicyDocument(policyEnvelope?.PolicyDocument ?? policyEnvelope);
  assert.ok(policy && typeof policy === "object" && Array.isArray(policy.Statement), "policy document is malformed");
  const statements = policy.Statement;
  const deltaStatements = statements.filter((statement) => statement.Sid === desired.delta.sid);
  assert.equal(deltaStatements.length, 1, "the exact recovery-readback statement is absent or duplicated");
  const delta = deltaStatements[0];
  assert.equal(delta.Effect, desired.delta.effect, "the recovery-readback statement must allow the exact action");
  assert.deepEqual(sorted(statementActions(delta)), sorted(desired.delta.actions), "the recovery delta grants an unexpected action");
  assert.deepEqual(sorted(statementResources(delta)), sorted(desired.delta.resources), "the recovery delta has an unexpected resource scope");
  assert.equal(delta.Condition, undefined, "the recovery readback statement may not retain an S3-call MFA condition");
  assert.equal(delta.NotAction, undefined, "the recovery delta may not use NotAction");
  assert.equal(delta.NotResource, undefined, "the recovery delta may not use NotResource");
  assert.equal(delta.Principal, undefined, "the recovery delta may not introduce a principal");
  assert.deepEqual(Object.keys(delta).sort(), ["Action", "Effect", "Resource", "Sid"].sort(), "the recovery delta has an unexpected policy field");

  for (const statement of statements) {
    assert.equal(statement.NotAction, undefined, "role policy may not hide actions behind NotAction");
    assert.equal(statement.NotResource, undefined, "role policy may not hide resources behind NotResource");
    for (const resource of statementResources(statement)) assert.equal(resource.includes("*"), false, "role policy may not use wildcard resources");
    if (statement === delta) continue;
    for (const action of statementActions(statement)) {
      assert.equal(action.includes("*"), false, "role policy may not use wildcard actions");
      assert.equal(action === "s3:GetObjectVersion" || action === "s3:*" || action === "*", false, "versioned readback is granted outside the exact delta statement");
      assert.equal(action === "iam:*" || action.startsWith("iam:"), false, "IAM mutation or discovery is outside the recovery role scope");
    }
  }
  for (const forbidden of desired.forbiddenActions) {
    for (const statement of statements) {
      assert.equal(statementActions(statement).includes(forbidden), false, `forbidden action ${forbidden} is present`);
    }
  }
  const requiredRetentionResources = requireRecoveryRetention
    ? desired.requiredExistingRetention.resources
    : [desired.requiredExistingRetention.resources[0]];
  for (const action of desired.requiredExistingRetention.actions) {
    for (const resource of requiredRetentionResources) {
      assert.equal(exactAllow(statements, action, resource), true, `required retention capability is absent for ${action}`);
    }
  }
  return true;
}

export function validateCanopyRecoveryReadbackProvisioningPolicy(policyEnvelope) {
  return validateCanopyRecoveryIam(policyEnvelope, desiredIamDelta, { requireRecoveryRetention: false });
}

/** Validate the exact final policy after appending the recovery retention statement. */
export function validateCanopyRecoveryRetentionProvisioningPolicy(policyEnvelope, desired = desiredRecoveryRetentionDelta) {
  const policy = decodePolicyDocument(policyEnvelope?.PolicyDocument ?? policyEnvelope);
  validateCanopyRecoveryIam(policy);
  const statements = policy.Statement;
  const matches = statements.filter((statement) => statement.Sid === desired.delta.sid);
  assert.equal(matches.length, 1, "the exact recovery-retention statement is absent or duplicated");
  const retention = matches[0];
  assert.equal(retention.Effect, desired.delta.effect, "the recovery-retention statement must allow the exact actions");
  assert.deepEqual(sorted(statementActions(retention)), sorted(desired.delta.actions), "the recovery-retention statement grants an unexpected action");
  assert.deepEqual(sorted(statementResources(retention)), sorted(desired.delta.resources), "the recovery-retention statement has an unexpected resource scope");
  assert.deepEqual(Object.keys(retention).sort(), ["Action", "Effect", "Resource", "Sid"].sort(), "the recovery-retention statement has an unexpected policy field");
  return true;
}

const sha256 = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

/** Validate the redacted owner/root-generated IAM attestation. */
export function validateCanopyRecoveryIamAttestation(attestation, { requireApplied = true } = {}) {
  assert.ok(attestation && typeof attestation === "object" && !Array.isArray(attestation), "IAM attestation is malformed");
  assert.deepEqual(Object.keys(attestation).sort(), [
    "accessAnalyzer", "account", "applied", "basePolicySha256", "delta", "desiredPolicySha256",
    "noCredentials", "noObjectVersionIds", "noUploadIds", "policyName", "preservation", "profile",
    "readbackCorrection", "readbackPolicySha256", "region", "role", "schemaVersion", "simulations", "status"
  ].sort(), "IAM attestation contains an unexpected field");
  assert.equal(attestation.schemaVersion, canopyRecoveryIamAttestation.schemaVersion, "IAM attestation schema is not recognized");
  assert.equal(attestation.account, desiredRecoveryRetentionDelta.account, "IAM attestation account is outside the approved account");
  assert.equal(attestation.role, desiredRecoveryRetentionDelta.role, "IAM attestation role is not the approved promotion role");
  assert.equal(attestation.profile, desiredRecoveryRetentionDelta.profile, "IAM attestation profile is not the approved operator profile");
  assert.equal(attestation.region, desiredRecoveryRetentionDelta.region, "IAM attestation region is not approved");
  assert.equal(attestation.policyName, canopyRecoveryIamAttestation.policyName, "IAM attestation policy name is not exact");
  assert.equal(attestation.status === "planned" || attestation.status === "applied", true, "IAM attestation status is not recognized");
  assert.equal(attestation.applied, attestation.status === "applied", "IAM attestation applied status is inconsistent");
  if (requireApplied) assert.equal(attestation.applied, true, "an applied IAM attestation is required");
  assert.equal(sha256(attestation.basePolicySha256), true, "IAM attestation base policy hash is malformed");
  assert.equal(sha256(attestation.desiredPolicySha256), true, "IAM attestation desired policy hash is malformed");
  if (attestation.applied) {
    assert.equal(sha256(attestation.readbackPolicySha256), true, "IAM attestation readback policy hash is malformed");
    assert.equal(attestation.readbackPolicySha256, attestation.desiredPolicySha256, "IAM attestation readback hash does not match the desired policy hash");
  } else {
    assert.equal(attestation.readbackPolicySha256, null, "a planned IAM attestation may not claim a readback hash");
  }
  assert.equal(attestation.preservation, "passed", "IAM attestation does not prove additive preservation");
  assert.equal(attestation.noCredentials, true, "IAM attestation is not redacted of credentials");
  assert.equal(attestation.noObjectVersionIds, true, "IAM attestation is not redacted of object version IDs");
  assert.equal(attestation.noUploadIds, true, "IAM attestation is not redacted of upload IDs");
  assert.deepEqual(attestation.delta, canopyRecoveryIamAttestation.delta, "IAM attestation delta is not exact");
  assert.deepEqual(Object.keys(attestation.delta).sort(), ["actions", "effect", "resources", "sid"].sort(), "IAM attestation delta contains an unexpected field");
  assert.deepEqual(attestation.readbackCorrection, canopyRecoveryIamAttestation.readbackCorrection, "IAM attestation readback correction is not exact");
  assert.deepEqual(Object.keys(attestation.readbackCorrection).sort(), ["actions", "removedCondition", "resources", "sid"].sort(), "IAM attestation readback correction contains an unexpected field");
  assert.deepEqual(Object.keys(attestation.accessAnalyzer).sort(), ["findings", "status"].sort(), "IAM attestation Access Analyzer result contains an unexpected field");
  assert.equal(Number.isInteger(attestation.accessAnalyzer.findings) && attestation.accessAnalyzer.findings === 0, true, "IAM attestation Access Analyzer findings are not zero");
  assert.equal(attestation.accessAnalyzer.status === "passed" || (!attestation.applied && attestation.accessAnalyzer.status === "unavailable"), true, "IAM attestation Access Analyzer result is not recognized");
  if (attestation.applied) assert.equal(attestation.accessAnalyzer.status, "passed", "an applied IAM attestation requires Access Analyzer validation");
  assert.ok(Array.isArray(attestation.simulations), "IAM attestation simulations are malformed");
  assert.deepEqual(attestation.simulations.map(({ case: name }) => name).sort(), desiredRecoveryRetentionDelta.simulations.map(({ case: name }) => name).sort(), "IAM attestation simulation cases are incomplete or changed");
  for (const simulation of attestation.simulations) {
    assert.deepEqual(Object.keys(simulation).sort(), ["action", "case", "decision"].sort(), "IAM attestation simulation contains an unexpected field");
    const expected = desiredRecoveryRetentionDelta.simulations.find(({ case: name }) => name === simulation.case);
    assert.ok(expected, "IAM attestation contains an unknown simulation case");
    assert.equal(simulation.action, expected.action, "IAM attestation simulation action is not exact");
    if (attestation.applied) assert.equal(simulation.decision, expected.decision, "IAM attestation simulation decision is not the required result");
    else assert.equal(simulation.decision === expected.decision || simulation.decision === "unavailable", true, "planned IAM attestation simulation decision is malformed");
  }
  return true;
}

const expectedObjects = (scope) => ({
  bucket: scope.bucket,
  payloadKey: scope.payloadKey,
  sidecarKey: scope.sidecarKey
});

/** Validate the owner approval envelope before any TOTP or AWS call. */
export function validateCanopyRecoveryApproval(approval, expected = canopyRecovery) {
  assert.ok(approval && typeof approval === "object", "approval is malformed");
  assert.equal(approval.schemaVersion, expected.schemaVersion, "approval schema is not recognized");
  assert.equal(approval.approved, true, "explicit recovery approval is absent");
  assert.equal(approval.account, expected.account, "approval account is outside the approved account");
  assert.equal(approval.role, expected.role, "approval role is not the approved promotion role");
  assert.equal(approval.profile, expected.profile, "approval profile is not the approved operator profile");
  assert.equal(approval.region, expected.region, "approval region is not approved");
  assert.deepEqual(approval.primary, expectedObjects(expected.primary), "primary object scope is not exact");
  assert.deepEqual(approval.recovery, expectedObjects(expected.recovery), "recovery object scope is not exact");
  assert.deepEqual(approval.retention, { mode: "COMPLIANCE", retainUntil: expected.retainUntil, payloadsAndSidecars: true }, "retention scope is not exact");
  assert.deepEqual(approval.steps, expected.requiredSteps, "recovery steps are not exact");
  assert.deepEqual(approval.exclusions, expected.requiredExclusions, "recovery exclusions are incomplete or changed");
  assert.equal(approval.productionEligible, false, "recovery approval may not authorize production inference");
  assert.equal(approval.phase2, false, "recovery approval may not authorize Phase 2");
  return true;
}

const validEtag = (value) => typeof value === "string" && /^"[^"]+"$/.test(value);
const validCrc64 = (value) => typeof value === "string" && /^[A-Za-z0-9+/]{11}=$/.test(value);

/** Validate the existing private 155-part state without returning its opaque upload ID. */
export function validateCanopyRecoveryState(state, expected = canopyRecovery) {
  assert.ok(state && typeof state === "object", "private state is malformed");
  assert.equal(state.schemaVersion, expected.stateSchemaVersion, "private state schema is not recognized");
  assert.equal(state.bucket, expected.primary.bucket, "private state bucket is not the approved primary bucket");
  assert.equal(state.region, expected.region, "private state region is not approved");
  assert.equal(state.key, expected.primary.payloadKey, "private state key is not the approved canopy payload");
  assert.equal(typeof state.uploadId, "string", "private state upload binding is absent");
  assert.ok(state.uploadId.length >= 20 && !/[\r\n\t ]/.test(state.uploadId), "private state upload binding is malformed");
  assert.equal(state.partSize, expected.partSize, "private state part size is not exact");
  assert.ok(Array.isArray(state.parts) && state.parts.length === expected.partCount, "private state is not the complete 155-part prefix");
  const finalSize = expected.payloadBytes - expected.partSize * (expected.partCount - 1);
  for (const [index, part] of state.parts.entries()) {
    assert.equal(part?.PartNumber, index + 1, "private state parts are not contiguous");
    assert.equal(part?.Size, index + 1 === expected.partCount ? finalSize : expected.partSize, "private state part size drifted");
    assert.equal(validEtag(part?.ETag), true, "private state ETag acknowledgement is malformed");
    assert.equal(validCrc64(part?.ChecksumCRC64NVME), true, "private state CRC64 acknowledgement is malformed");
  }
  if (state.versionRefs !== undefined) {
    assert.ok(state.versionRefs && typeof state.versionRefs === "object" && !Array.isArray(state.versionRefs), "private version references are malformed");
    for (const field of ["primaryPayload", "primarySidecar", "recoveryPayload", "recoverySidecar"]) {
      if (state.versionRefs[field] !== undefined) {
        assert.equal(typeof state.versionRefs[field], "string", "private version reference is malformed");
        assert.ok(state.versionRefs[field].length > 0 && !/[\r\n\t ]/.test(state.versionRefs[field]), "private version reference is malformed");
      }
    }
  }
  return true;
}

const isFullObjectChecksum = (head) => head?.ChecksumType === "FULL_OBJECT" && typeof head.ChecksumCRC64NVME === "string" && head.ChecksumCRC64NVME.length > 0;
const hasVersion = (head) => typeof head?.VersionId === "string" && head.VersionId.length > 0;

/** Validate four exact object heads without returning or printing provider identifiers. */
export function validateCanopyRecoveryHeads({ primaryPayload, recoveryPayload, primarySidecar, recoverySidecar }, { payloadBytes, sidecarBytes }) {
  for (const [head, bytes] of [[primaryPayload, payloadBytes], [recoveryPayload, payloadBytes], [primarySidecar, sidecarBytes], [recoverySidecar, sidecarBytes]]) {
    assert.equal(head?.ContentLength, bytes, "object byte length does not match the approved value");
    assert.equal(hasVersion(head), true, "object version is absent");
    assert.equal(isFullObjectChecksum(head), true, "object lacks a FULL_OBJECT CRC64NVME checksum");
  }
  assert.equal(primaryPayload.ChecksumType, recoveryPayload.ChecksumType, "primary/recovery payload checksum types differ");
  assert.equal(primaryPayload.ChecksumCRC64NVME, recoveryPayload.ChecksumCRC64NVME, "primary/recovery payload checksums differ");
  assert.equal(primarySidecar.ChecksumType, recoverySidecar.ChecksumType, "primary/recovery sidecar checksum types differ");
  assert.equal(primarySidecar.ChecksumCRC64NVME, recoverySidecar.ChecksumCRC64NVME, "primary/recovery sidecar checksums differ");
  return true;
}

/** If private version references exist, require every read-only head to match them. */
export function validateCanopyRecoveryVersionReferences({ primaryPayload, recoveryPayload, primarySidecar, recoverySidecar }, refs = {}) {
  for (const [field, head] of [["primaryPayload", primaryPayload], ["recoveryPayload", recoveryPayload], ["primarySidecar", primarySidecar], ["recoverySidecar", recoverySidecar]]) {
    if (refs[field] !== undefined) assert.equal(head?.VersionId, refs[field], "read-only head does not match the saved private version reference");
  }
  return true;
}

export function validateCanopyRecoveryRetention({ primaryPayload, recoveryPayload, primarySidecar, recoverySidecar }, retainUntil = "2033-08-12T00:00:00Z") {
  for (const retention of [primaryPayload, recoveryPayload, primarySidecar, recoverySidecar]) {
    validateCanopyRecoverySingleRetention(retention, retainUntil);
  }
  return true;
}

export function validateCanopyRecoverySingleRetention(retention, retainUntil = "2033-08-12T00:00:00Z") {
  assert.equal(retention?.Retention?.Mode, "COMPLIANCE", "retention mode is not COMPLIANCE");
  const actual = Date.parse(retention?.Retention?.RetainUntilDate ?? "");
  assert.equal(Number.isFinite(actual), true, "retention instant is absent or malformed");
  assert.equal(actual, Date.parse(retainUntil), "retention instant does not match the approved date");
  return true;
}

if (process.argv[1]?.endsWith("check-phase1-canopy-completion-recovery.mjs")) {
  try {
    const mode = process.argv[2];
    if (mode === "--policy-stdin") {
      validateCanopyRecoveryIam(JSON.parse(readFileSync(0, "utf8")));
      console.log("Canopy recovery IAM desired state passed.");
    } else if (mode === "--approval-state") {
      const approval = JSON.parse(readFileSync(process.argv[3], "utf8"));
      const state = JSON.parse(readFileSync(process.argv[4], "utf8"));
      validateCanopyRecoveryApproval(approval);
      validateCanopyRecoveryState(state);
      console.log("Canopy recovery approval and private state passed.");
    } else if (mode === "--heads") {
      const heads = Object.fromEntries(["primaryPayload", "recoveryPayload", "primarySidecar", "recoverySidecar"].map((name, index) => [name, JSON.parse(readFileSync(process.argv[3 + index], "utf8"))]));
      const state = JSON.parse(readFileSync(process.argv[7], "utf8"));
      validateCanopyRecoveryHeads(heads, { payloadBytes: canopyRecovery.payloadBytes, sidecarBytes: canopyRecovery.sidecarBytes });
      validateCanopyRecoveryVersionReferences(heads, state.versionRefs ?? {});
      console.log("Canopy recovery object heads passed.");
    } else if (mode === "--retention") {
      validateCanopyRecoveryRetention(Object.fromEntries(["primaryPayload", "recoveryPayload", "primarySidecar", "recoverySidecar"].map((name, index) => [name, JSON.parse(readFileSync(process.argv[3 + index], "utf8"))])), canopyRecovery.retainUntil);
      console.log("Canopy recovery retention passed.");
    } else if (mode === "--retention-one") {
      validateCanopyRecoverySingleRetention(JSON.parse(readFileSync(process.argv[3], "utf8")), canopyRecovery.retainUntil);
      console.log("Canopy recovery retention passed.");
    } else if (mode === "--attestation-state") {
      validateCanopyRecoveryIamAttestation(JSON.parse(readFileSync(process.argv[3], "utf8")), { requireApplied: process.argv[4] !== "--planned" });
      console.log("Canopy recovery IAM attestation passed.");
    } else {
      throw new Error("usage");
    }
  } catch {
    console.error("Canopy recovery check failed closed; no TOTP or storage mutation was authorized.");
    process.exitCode = 65;
  }
}
