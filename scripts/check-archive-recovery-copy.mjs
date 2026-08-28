// Checks data/archive-recovery-copy.json, the Phase 8 `backups` evidence record.
//
// This file is repository-only. It performs no AWS call, opens no network socket, and has no write
// path. It reads a recorded recovery-copy result and cross-checks it against the two records that
// already describe the primary objects this project relies on:
// data/immutable-promotions.json and data/vlce2-remote-promotion-evidence.json.
//
// It is fail-closed in the strong sense: an absent evidence file is a failure, not a skip. The
// record does not exist yet, and it must be produced by an actual AWS run before this check can
// pass. Nothing here fabricates a destination bucket, a region, an ARN, or a version ID.
import { readFileSync } from "node:fs";

const SCHEMA_VERSION = "witness-tree/archive-recovery-copy/1";
const RECORD_URL = new URL("../data/archive-recovery-copy.json", import.meta.url);
const PROMOTIONS_URL = new URL("../data/immutable-promotions.json", import.meta.url);
const VLCE2_URL = new URL("../data/vlce2-remote-promotion-evidence.json", import.meta.url);

// Two Canadian AWS regions exist. Everything else crosses the border, and
// docs/ARCHIVE_OPERATIONS_READINESS.md requires every destination to be documented as Canadian
// before replication is enabled. The allowlist is closed: an unrecognised region is rejected rather
// than inspected for a "ca" prefix, so a future non-Canadian region that happens to be named
// plausibly cannot slip through.
const CANADIAN_REGIONS = new Map([
  ["ca-central-1", "Canada (Central)"],
  ["ca-west-1", "Canada West (Calgary)"],
]);
// Only ca-central-1 is currently approved. A ca-west-1 destination is still Canadian, but it is a
// new region and the readiness record says that is an owner decision, so it must name the approval.
const PREAPPROVED_REGION = "ca-central-1";

const STATUSES = new Set(["recovery-copy-verified", "partial-coverage"]);
const COVERAGE_MECHANISMS = new Set(["live-replication", "batch-replication"]);
const SHA256 = /^[a-f\d]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
// AWS renders retention instants with an explicit +00:00 offset rather than Z. Both are accepted
// for retention fields only; the record's own timestamps stay in the repository's strict Z form.
const RETENTION_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|\+00:00)$/;

// Field names that carry a credential if they carry anything at all. Presence is the defect; the
// value is never inspected, so this check cannot itself become a place where a secret is quoted.
const CREDENTIAL_KEY = /\b(?:access key id|secret access key|session token|security token|serial number|mfa|totp|otp|passcode|password|passphrase|credentials?)\b/;
// camelCase, snake_case, and kebab-case all name the same field. The key is normalised to
// space-separated lowercase words first, so mfaSerialNumber and mfa_serial_number are caught alike.
const normalizeKey = (key) => key.replace(/([a-z\d])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
// Value shapes that are credentials regardless of where they appear.
const CREDENTIAL_VALUE = [
  [/\b(?:AKIA|ASIA|AIDA|AROA|ANPA|ANVA|APKA|ABIA|ACCA)[A-Z0-9]{16}\b/, "an AWS access key identifier"],
  [/\b(?:FwoG|FQoG|FQoD|IQoJ)[A-Za-z0-9+/=_-]{40,}/, "an STS session token"],
  [/\baws_(?:access_key_id|secret_access_key|session_token)\b/i, "a shared-credentials key name"],
  [/\bx-amz-security-token\b/i, "a session-token header"],
  [/\barn:aws:iam::\d{12}:mfa\//i, "an MFA device serial"],
  [/\b(?:MFA|TOTP|one[- ]time)\b[^\n]{0,40}?\b\d{6}\b/i, "an MFA or TOTP code"],
  [/^\s*\d{6}\s*$/, "a bare six-digit one-time code"],
];

function requiredText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
  return value;
}

function requiredObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} is required.`);
  return value;
}

function requiredSha256(value, name) {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${name} must be a lowercase hexadecimal SHA-256.`);
  return value;
}

function requiredBoolean(value, name) {
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean.`);
  return value;
}

/**
 * A count that must have been observed. Unknown is never coerced to zero: an absent field, a null,
 * or a placeholder such as "unknown" is a failure, because a zero written in place of an unobserved
 * count reads as "nothing failed" when the truth is "nobody looked".
 */
function requiredCount(value, name) {
  if (value === undefined || value === null) throw new Error(`${name} must be recorded as an observed integer; an absent value is not zero.`);
  if (typeof value === "string") throw new Error(`${name} must be an observed integer, not the placeholder ${JSON.stringify(value)}; an unknown count is not zero.`);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer count.`);
  return value;
}

function requiredByteLength(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer byte length.`);
  return value;
}

function requiredUtc(value, name) {
  if (typeof value !== "string" || !UTC.test(value) || new Date(value).toISOString() !== value.replace("Z", ".000Z")) {
    throw new Error(`${name} must be a whole-second UTC instant.`);
  }
  return value;
}

function requiredRetentionInstant(value, name) {
  if (typeof value !== "string" || !RETENTION_INSTANT.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${name} must be a whole-second UTC retention instant.`);
  }
  return value;
}

/** Walks every string in the record, key and value alike, looking for anything credential shaped. */
export function assertNoCredentialMaterial(value, path = "record") {
  if (typeof value === "string") {
    for (const [pattern, description] of CREDENTIAL_VALUE) {
      if (pattern.test(value)) throw new Error(`${path} contains ${description}; credentials, MFA values, and session tokens must never be written to this record.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoCredentialMaterial(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (CREDENTIAL_KEY.test(normalizeKey(key))) throw new Error(`${path}.${key} is a credential-shaped field; credentials, MFA values, and session tokens must never be written to this record.`);
      assertNoCredentialMaterial(item, `${path}.${key}`);
    }
  }
}

/** The stable identity of one object version. Exported so callers key the same way this file does. */
export const primaryObjectIdentity = (key, versionId) => `${key}#${versionId}`;
const identity = primaryObjectIdentity;

/**
 * Builds the set of primary object versions this project has already admitted, from the two records
 * the plan names. Each entry carries the byte length, the provider checksum, and whether the object
 * is under compliance retention, so a claimed replica can be compared rather than merely counted.
 */
export function collectAdmittedPrimaryObjects(promotions, vlce2) {
  requiredObject(promotions, "The immutable promotions record");
  requiredObject(vlce2, "The VLCE2 remote promotion evidence record");
  const admitted = new Map();
  const add = (entry) => {
    requiredText(entry.key, "An admitted primary key");
    requiredText(entry.versionId, "An admitted primary versionId");
    requiredByteLength(entry.byteLength, `Admitted primary ${entry.key} byte length`);
    const id = identity(entry.key, entry.versionId);
    if (admitted.has(id)) throw new Error(`Two admitted primary records claim the same object version: ${entry.key}.`);
    admitted.set(id, entry);
  };

  if (!Array.isArray(promotions.entries) || promotions.entries.length === 0) throw new Error("The immutable promotions record has no entries.");
  for (const entry of promotions.entries) {
    add({
      key: entry.payloadKey,
      versionId: entry.payloadVersionId,
      byteLength: entry.remoteByteLength,
      checksumCrc64nvmeBase64: entry.providerReported?.checksumBase64,
      locked: entry.retentionMode === "compliance",
      retainUntilDate: entry.providerReportedRetention?.retainUntilDate,
      source: "data/immutable-promotions.json",
    });
    add({
      key: entry.manifestKey,
      versionId: entry.manifestVersionId,
      byteLength: entry.manifestByteLength,
      checksumCrc64nvmeBase64: undefined,
      locked: entry.manifestRetention !== "not-locked",
      retainUntilDate: undefined,
      source: "data/immutable-promotions.json",
    });
  }

  if (!Array.isArray(vlce2.entries) || vlce2.entries.length === 0) throw new Error("The VLCE2 remote promotion evidence record has no entries.");
  for (const entry of vlce2.entries) {
    const payload = requiredObject(entry.payload, "A VLCE2 payload");
    const sidecar = requiredObject(entry.sidecar, "A VLCE2 sidecar");
    add({
      key: payload.key,
      versionId: payload.versionId,
      byteLength: payload.byteLength,
      checksumCrc64nvmeBase64: payload.checksumCrc64nvmeBase64,
      locked: entry.retention?.mode === "COMPLIANCE",
      retainUntilDate: entry.retention?.retainUntilDate,
      source: "data/vlce2-remote-promotion-evidence.json",
    });
    add({
      key: sidecar.key,
      versionId: sidecar.versionId,
      byteLength: sidecar.byteLength,
      checksumCrc64nvmeBase64: sidecar.checksumCrc64nvmeBase64,
      // The VLCE2 notice records the sidecars as deliberately left unlocked.
      locked: false,
      retainUntilDate: undefined,
      source: "data/vlce2-remote-promotion-evidence.json",
    });
  }
  return admitted;
}

function validateDestination(record) {
  const primary = requiredObject(record.primary, "The primary storage block");
  requiredText(primary.bucket, "Primary bucket");
  requiredText(primary.region, "Primary region");
  if (!CANADIAN_REGIONS.has(primary.region)) throw new Error(`The primary region ${primary.region} is not a Canadian AWS region.`);

  const destination = requiredObject(record.destination, "The destination storage block");
  requiredText(destination.bucket, "Destination bucket");
  requiredText(destination.region, "Destination region");
  if (destination.countryCode !== "CA") throw new Error("The destination must record countryCode CA.");
  if (!CANADIAN_REGIONS.has(destination.region)) {
    throw new Error(`The replication destination region ${destination.region} is not Canadian; every destination must be recorded as Canadian before replication is enabled.`);
  }
  if (destination.region !== PREAPPROVED_REGION) {
    requiredText(destination.regionApproval, `A destination outside ${PREAPPROVED_REGION} needs a recorded owner approval, and destination.regionApproval`);
  }
  if (destination.bucket === primary.bucket) throw new Error("The recovery copy must live in a second bucket; a destination equal to the primary bucket is not a recovery copy.");
  if (destination.versioning !== "Enabled") throw new Error("The destination bucket must record versioning as Enabled.");
  if (destination.objectLockEnabled !== true) throw new Error("The destination bucket must record Object Lock as enabled.");
  requiredText(destination.regionEvidenceReference, "Destination region evidence reference");
  return { primary, destination };
}

function validateReplication(record) {
  const rule = requiredObject(record.replicationRule, "The replication rule block");
  requiredText(rule.id, "Replication rule id");
  if (rule.status !== "Enabled") throw new Error("The replication rule must be recorded as Enabled.");
  requiredText(rule.scope, "Replication rule scope");
  // An S3 replication rule applies only to objects written after it was created. A record claiming
  // otherwise is asserting something false about S3, so it is rejected rather than believed.
  if (rule.appliesToExistingObjects !== false) throw new Error("An S3 replication rule does not apply to objects that already existed; appliesToExistingObjects must be recorded as false.");
  // The superseded flat-key versions in data/immutable-promotions.json would replicate unless the
  // rule filters them out. The decision is required to be recorded either way, not left implied.
  requiredBoolean(rule.supersededFlatKeyVersionsExcluded, "replicationRule.supersededFlatKeyVersionsExcluded");
  requiredText(rule.supersededFlatKeyDecision, "The recorded decision on superseded flat-key versions");

  const batch = requiredObject(record.batchReplication, "The S3 Batch Replication block");
  if (batch.performed !== true) throw new Error("Existing objects are covered only by S3 Batch Replication; batchReplication.performed must be true.");
  requiredText(batch.jobId, "Batch Replication job id");
  if (batch.status !== "Complete") throw new Error("The Batch Replication job must be recorded as Complete.");
  requiredUtc(batch.completedAt, "Batch Replication completion instant");
  const replicated = requiredCount(batch.objectsReplicated, "batchReplication.objectsReplicated");
  const failed = requiredCount(batch.objectsFailed, "batchReplication.objectsFailed");
  if (replicated === 0) throw new Error("A Batch Replication job that replicated no objects does not cover the existing objects.");
  if (failed !== 0) throw new Error(`Batch Replication recorded ${failed} failed objects; the recovery copy is incomplete.`);
  return { rule, batch };
}

function validateObjectLock(record) {
  const lock = requiredObject(record.objectLock, "The Object Lock block");
  if (lock.destinationRetentionMode !== "COMPLIANCE") throw new Error("Replicating a compliance-locked object replicates the lock; destinationRetentionMode must be recorded as COMPLIANCE.");
  requiredRetentionInstant(lock.destinationRetainUntilDate, "objectLock.destinationRetainUntilDate");
  if (lock.replicatedFromPrimary !== true) throw new Error("objectLock.replicatedFromPrimary must record that the destination retention came from the primary lock.");
  if (lock.irreversible !== true) throw new Error("Compliance-mode retention cannot be shortened or removed by anyone; objectLock.irreversible must be true.");
  const acknowledgement = requiredText(lock.irreversibilityAcknowledgement, "objectLock.irreversibilityAcknowledgement");
  if (!/irrevers|cannot be (?:shortened|removed|deleted|undone)/i.test(acknowledgement)) {
    throw new Error("The irreversibility acknowledgement must state plainly that the replicated retention cannot be shortened or removed.");
  }
  return lock;
}

function validateObjects(record, admitted, lock) {
  if (!Array.isArray(record.objects) || record.objects.length === 0) throw new Error("The recovery copy must record every destination object version it created.");
  const seenPrimaries = new Set();
  const seenDestinations = new Set();
  const byDestination = new Map();
  for (const [index, object] of record.objects.entries()) {
    const label = `objects[${index}]`;
    requiredObject(object, label);
    requiredText(object.primaryKey, `${label}.primaryKey`);
    requiredText(object.primaryVersionId, `${label}.primaryVersionId`);
    requiredText(object.destinationKey, `${label}.destinationKey`);
    requiredText(object.destinationVersionId, `${label}.destinationVersionId`);
    if (!COVERAGE_MECHANISMS.has(object.coveredBy)) throw new Error(`${label}.coveredBy must be one of: ${[...COVERAGE_MECHANISMS].join(", ")}.`);
    if (object.replicationStatus !== "REPLICA") throw new Error(`${label}.replicationStatus must be REPLICA; anything else is not a completed copy.`);

    const primaryId = identity(object.primaryKey, object.primaryVersionId);
    const primary = admitted.get(primaryId);
    if (!primary) throw new Error(`${label} maps to ${object.primaryKey} version ${object.primaryVersionId}, which is not an admitted primary object version in data/immutable-promotions.json or data/vlce2-remote-promotion-evidence.json.`);
    if (seenPrimaries.has(primaryId)) throw new Error(`${label} claims a primary object version that another destination object already claims.`);
    seenPrimaries.add(primaryId);

    const destinationId = identity(object.destinationKey, object.destinationVersionId);
    if (seenDestinations.has(destinationId)) throw new Error(`${label} repeats a destination object version already recorded.`);
    seenDestinations.add(destinationId);
    byDestination.set(destinationId, { object, primary });

    // A replica is byte identical to its source. Both sides are required to be positive integers
    // first, so an equality that would otherwise hold vacuously cannot pass for a comparison.
    requiredByteLength(object.byteLength, `${label}.byteLength`);
    requiredByteLength(primary.byteLength, `The admitted primary byte length for ${object.primaryKey}`);
    if (object.byteLength !== primary.byteLength) throw new Error(`${label} byte length ${object.byteLength} does not equal the admitted primary byte length ${primary.byteLength}.`);
    if (primary.checksumCrc64nvmeBase64) {
      requiredText(object.checksumCrc64nvmeBase64, `${label}.checksumCrc64nvmeBase64`);
      if (object.checksumCrc64nvmeBase64 !== primary.checksumCrc64nvmeBase64) throw new Error(`${label} provider checksum does not equal the admitted primary checksum.`);
    }

    // Retention is recorded as it actually is. A locked primary replicates its lock; an unlocked
    // sidecar must not be recorded as locked, because that would overstate the copy.
    if (primary.locked) {
      const retention = requiredObject(object.retention, `${label}.retention`);
      if (retention.mode !== lock.destinationRetentionMode) throw new Error(`${label} retention mode does not match the recorded destination retention mode.`);
      requiredRetentionInstant(retention.retainUntilDate, `${label}.retention.retainUntilDate`);
      if (Date.parse(retention.retainUntilDate) !== Date.parse(lock.destinationRetainUntilDate)) throw new Error(`${label} retain-until date does not match the recorded destination retention date.`);
    } else if (object.retention !== null) {
      throw new Error(`${label} maps to an unlocked primary object, so its retention must be recorded as null rather than claimed.`);
    }
  }
  return { seenPrimaries, byDestination };
}

function validateCoverage(record, admitted, seenPrimaries) {
  const coverage = requiredObject(record.coverage, "The coverage block");
  requiredCount(coverage.admittedPrimaryObjectCount, "coverage.admittedPrimaryObjectCount");
  requiredCount(coverage.replicatedObjectCount, "coverage.replicatedObjectCount");
  if (coverage.admittedPrimaryObjectCount !== admitted.size) throw new Error(`coverage.admittedPrimaryObjectCount is ${coverage.admittedPrimaryObjectCount}, but ${admitted.size} primary object versions are admitted in this repository.`);
  if (coverage.replicatedObjectCount !== record.objects.length) throw new Error("coverage.replicatedObjectCount does not equal the number of recorded destination objects.");
  if (!Array.isArray(coverage.uncoveredPrimaryObjects)) throw new Error("coverage.uncoveredPrimaryObjects must be an array, empty only when every admitted primary object version is covered; an absent list is not an empty one.");

  const uncovered = [];
  for (const [id, primary] of admitted) {
    if (!seenPrimaries.has(id)) uncovered.push(`${primary.key}@${primary.versionId}`);
  }
  const recorded = [...coverage.uncoveredPrimaryObjects];
  for (const item of recorded) requiredText(item, "coverage.uncoveredPrimaryObjects entry");
  if (recorded.length !== uncovered.length || [...recorded].sort().join("\n") !== [...uncovered].sort().join("\n")) {
    throw new Error(`coverage.uncoveredPrimaryObjects does not match the ${uncovered.length} admitted primary object versions this record leaves uncovered.`);
  }
  const complete = uncovered.length === 0;
  if (requiredBoolean(coverage.complete, "coverage.complete") !== complete) throw new Error("coverage.complete must equal the computed comparison of covered against admitted primary object versions.");
  if (record.status === "recovery-copy-verified" && !complete) throw new Error("A record may claim recovery-copy-verified only when every admitted primary object version is covered; use partial-coverage instead.");
  if (record.status === "partial-coverage" && complete) throw new Error("A record covering every admitted primary object version must not understate itself as partial-coverage.");
  return coverage;
}

function validateRecoveryExercise(record, destination, byDestination) {
  const exercise = requiredObject(record.recoveryExercise, "The recovery exercise block");
  if (exercise.performed !== true) throw new Error("A recovery copy that has never been restored from is not evidence; recoveryExercise.performed must be true.");
  if (exercise.status !== "passed") throw new Error("The recovery exercise must record a passed status.");
  requiredUtc(exercise.startedAt, "Recovery exercise start instant");
  requiredUtc(exercise.completedAt, "Recovery exercise completion instant");
  if (new Date(exercise.completedAt) < new Date(exercise.startedAt)) throw new Error("The recovery exercise cannot complete before it started.");

  const restoredFrom = requiredObject(exercise.restoredFrom, "recoveryExercise.restoredFrom");
  requiredText(restoredFrom.bucket, "recoveryExercise.restoredFrom.bucket");
  requiredText(restoredFrom.key, "recoveryExercise.restoredFrom.key");
  requiredText(restoredFrom.versionId, "recoveryExercise.restoredFrom.versionId");
  if (restoredFrom.bucket !== destination.bucket) throw new Error("The recovery exercise must restore from the destination bucket; restoring from the primary proves nothing about the copy.");
  const restored = byDestination.get(identity(restoredFrom.key, restoredFrom.versionId));
  if (!restored) throw new Error("The recovery exercise restored a destination object version that this record does not list among its replicated objects.");

  const expected = requiredObject(exercise.expected, "recoveryExercise.expected");
  const observed = requiredObject(exercise.observed, "recoveryExercise.observed");
  requiredByteLength(expected.byteLength, "recoveryExercise.expected.byteLength");
  requiredByteLength(observed.byteLength, "recoveryExercise.observed.byteLength");
  requiredSha256(expected.sha256, "recoveryExercise.expected.sha256");
  requiredSha256(observed.sha256, "recoveryExercise.observed.sha256");
  if (expected.byteLength !== restored.object.byteLength) throw new Error("The expected byte length does not equal the recorded destination object byte length.");

  const byteLengthMatches = expected.byteLength === observed.byteLength;
  const sha256Matches = expected.sha256 === observed.sha256;
  if (requiredBoolean(exercise.byteLengthMatches, "recoveryExercise.byteLengthMatches") !== byteLengthMatches) throw new Error("byteLengthMatches must equal the computed comparison of the expected and observed byte lengths.");
  if (requiredBoolean(exercise.sha256Matches, "recoveryExercise.sha256Matches") !== sha256Matches) throw new Error("sha256Matches must equal the computed comparison of the expected and observed SHA-256 values.");
  if (!byteLengthMatches) throw new Error("The recovered byte length does not equal the expected byte length.");
  if (!sha256Matches) throw new Error("The recovered SHA-256 does not equal the expected SHA-256; the recovered bytes are not the staged bytes.");

  // The exercise must prove the primary was not disturbed, which means reading its retention back
  // afterwards and comparing it against what it was before, on the same object version.
  const before = requiredObject(exercise.primaryRetentionBefore, "recoveryExercise.primaryRetentionBefore");
  const after = requiredObject(exercise.primaryRetentionAfter, "recoveryExercise.primaryRetentionAfter");
  for (const [side, block] of [["primaryRetentionBefore", before], ["primaryRetentionAfter", after]]) {
    requiredText(block.key, `recoveryExercise.${side}.key`);
    requiredText(block.versionId, `recoveryExercise.${side}.versionId`);
    requiredText(block.mode, `recoveryExercise.${side}.mode`);
    requiredRetentionInstant(block.retainUntilDate, `recoveryExercise.${side}.retainUntilDate`);
    if (block.key !== restored.primary.key || block.versionId !== restored.primary.versionId) {
      throw new Error(`recoveryExercise.${side} must read back the primary object version that the restored copy was made from.`);
    }
  }
  const unchanged = before.mode === after.mode && Date.parse(before.retainUntilDate) === Date.parse(after.retainUntilDate);
  if (requiredBoolean(exercise.primaryRetentionUnchanged, "recoveryExercise.primaryRetentionUnchanged") !== unchanged) throw new Error("primaryRetentionUnchanged must equal the computed comparison of the retention read back before and after the exercise.");
  if (!unchanged) throw new Error("The primary object's retention changed across the recovery exercise.");
  if (exercise.temporaryCopyRemoved !== true) throw new Error("The recovery exercise must record that the restored temporary copy was removed.");
  return exercise;
}

/**
 * Validates a recovery-copy record against the admitted primary object versions. Pure: it takes the
 * record and the admitted map, reads nothing, and writes nothing.
 */
export function validateArchiveRecoveryCopy(record, { admittedPrimaries } = {}) {
  requiredObject(record, "The archive recovery copy record");
  if (!(admittedPrimaries instanceof Map) || admittedPrimaries.size === 0) throw new Error("The admitted primary object versions are required.");
  if (record.schemaVersion !== SCHEMA_VERSION) throw new Error(`The recovery copy record must be a ${SCHEMA_VERSION} record.`);
  if (!STATUSES.has(record.status)) throw new Error(`The recovery copy status must be one of: ${[...STATUSES].join(", ")}.`);
  // A recovery copy is a storage fact. It admits nothing into production on its own.
  if (record.productionEligible !== false) throw new Error("This record must remain production ineligible.");
  requiredText(record.notice, "Notice");
  requiredUtc(record.observedAt, "observedAt");
  assertNoCredentialMaterial(record);

  const { destination } = validateDestination(record);
  validateReplication(record);
  const lock = validateObjectLock(record);
  const { seenPrimaries, byDestination } = validateObjects(record, admittedPrimaries, lock);
  validateCoverage(record, admittedPrimaries, seenPrimaries);
  validateRecoveryExercise(record, destination, byDestination);
  return record;
}

/**
 * Reads the recovery-copy record and the two primary records, then validates them together. An
 * absent recovery-copy file fails: this evidence is produced by an AWS run, and until that run has
 * happened there is nothing to pass.
 */
export function checkArchiveRecoveryCopy(file = RECORD_URL, { admittedPrimaries } = {}) {
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("The archive recovery copy has not been produced: data/archive-recovery-copy.json does not exist. Run the sequence in docs/ARCHIVE_RECOVERY_COPY_SCHEMA.md against AWS and record its output before this check can pass.");
    }
    throw error;
  }
  const admitted = admittedPrimaries ?? collectAdmittedPrimaryObjects(
    JSON.parse(readFileSync(PROMOTIONS_URL, "utf8")),
    JSON.parse(readFileSync(VLCE2_URL, "utf8")),
  );
  return validateArchiveRecoveryCopy(JSON.parse(raw), { admittedPrimaries: admitted });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const record = checkArchiveRecoveryCopy();
    console.log(`PASS archive recovery copy: ${record.objects.length} destination object versions in ${record.destination.region}, ${record.status}, restored and verified with the primary retention read back unchanged.`);
  } catch (error) {
    console.error(`FAIL archive recovery copy: ${error.message}`);
    process.exitCode = 1;
  }
}
