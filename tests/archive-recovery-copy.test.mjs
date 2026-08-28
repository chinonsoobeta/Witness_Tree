import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertNoCredentialMaterial,
  checkArchiveRecoveryCopy,
  collectAdmittedPrimaryObjects,
  primaryObjectIdentity,
  validateArchiveRecoveryCopy,
} from "../scripts/check-archive-recovery-copy.mjs";

/**
 * These tests build the record the checker expects and mutate one field at a time, so a rule is
 * tested rather than a single recorded run. No AWS values are invented here that could be mistaken
 * for real ones: the fixture's bucket names, version identifiers, and job identifier are obvious
 * placeholders, and data/archive-recovery-copy.json is deliberately not created by this suite. That
 * file must come from an actual AWS run.
 */

const RETAIN_UNTIL = "2033-08-12T00:00:00+00:00";
const PAYLOAD_SHA256 = "a".repeat(64);

/** A two-object stand-in for the admitted primaries: one compliance-locked payload, one unlocked sidecar. */
function admittedFixture() {
  return new Map([
    [primaryObjectIdentity("raw/example/payload/example.zip", "PRIMARY-PAYLOAD-VERSION"), {
      key: "raw/example/payload/example.zip",
      versionId: "PRIMARY-PAYLOAD-VERSION",
      byteLength: 4096,
      checksumCrc64nvmeBase64: "AAAAAAAAAAA=",
      locked: true,
      retainUntilDate: RETAIN_UNTIL,
      source: "data/immutable-promotions.json",
    }],
    [primaryObjectIdentity("raw/example/manifest.json", "PRIMARY-MANIFEST-VERSION"), {
      key: "raw/example/manifest.json",
      versionId: "PRIMARY-MANIFEST-VERSION",
      byteLength: 512,
      checksumCrc64nvmeBase64: undefined,
      locked: false,
      retainUntilDate: undefined,
      source: "data/immutable-promotions.json",
    }],
  ]);
}

function fixture(overrides = {}) {
  return {
    schemaVersion: "witness-tree/archive-recovery-copy/1",
    status: "recovery-copy-verified",
    productionEligible: false,
    notice: "A second Canadian bucket holds a replica of every admitted primary object version. This is a storage fact only.",
    observedAt: "2026-08-28T12:00:00Z",
    primary: { bucket: "example-primary-bucket", region: "ca-central-1", countryCode: "CA" },
    destination: {
      bucket: "example-recovery-bucket",
      region: "ca-central-1",
      countryCode: "CA",
      versioning: "Enabled",
      objectLockEnabled: true,
      regionEvidenceReference: "get-bucket-location returned LocationConstraint=ca-central-1",
    },
    replicationRule: {
      id: "example-recovery-rule",
      status: "Enabled",
      scope: "Every object under the raw/ prefix.",
      appliesToExistingObjects: false,
      supersededFlatKeyVersionsExcluded: true,
      supersededFlatKeyDecision: "The superseded flat-key versions are excluded by prefix filter, decided before the rule was enabled.",
    },
    batchReplication: {
      performed: true,
      jobId: "example-batch-job",
      status: "Complete",
      completedAt: "2026-08-28T11:00:00Z",
      objectsReplicated: 2,
      objectsFailed: 0,
    },
    objectLock: {
      destinationRetentionMode: "COMPLIANCE",
      destinationRetainUntilDate: RETAIN_UNTIL,
      replicatedFromPrimary: true,
      irreversible: true,
      irreversibilityAcknowledgement: "The replicated compliance retention is irreversible: it cannot be shortened or removed by anyone, including the account root, before the retain-until date.",
    },
    objects: [
      {
        primaryKey: "raw/example/payload/example.zip",
        primaryVersionId: "PRIMARY-PAYLOAD-VERSION",
        destinationKey: "raw/example/payload/example.zip",
        destinationVersionId: "DESTINATION-PAYLOAD-VERSION",
        byteLength: 4096,
        checksumCrc64nvmeBase64: "AAAAAAAAAAA=",
        replicationStatus: "REPLICA",
        coveredBy: "batch-replication",
        retention: { mode: "COMPLIANCE", retainUntilDate: RETAIN_UNTIL },
      },
      {
        primaryKey: "raw/example/manifest.json",
        primaryVersionId: "PRIMARY-MANIFEST-VERSION",
        destinationKey: "raw/example/manifest.json",
        destinationVersionId: "DESTINATION-MANIFEST-VERSION",
        byteLength: 512,
        replicationStatus: "REPLICA",
        coveredBy: "batch-replication",
        retention: null,
      },
    ],
    coverage: {
      admittedPrimaryObjectCount: 2,
      replicatedObjectCount: 2,
      uncoveredPrimaryObjects: [],
      complete: true,
    },
    recoveryExercise: {
      performed: true,
      status: "passed",
      startedAt: "2026-08-28T11:30:00Z",
      completedAt: "2026-08-28T11:40:00Z",
      restoredFrom: {
        bucket: "example-recovery-bucket",
        key: "raw/example/payload/example.zip",
        versionId: "DESTINATION-PAYLOAD-VERSION",
      },
      expected: { byteLength: 4096, sha256: PAYLOAD_SHA256 },
      observed: { byteLength: 4096, sha256: PAYLOAD_SHA256 },
      byteLengthMatches: true,
      sha256Matches: true,
      primaryRetentionBefore: {
        key: "raw/example/payload/example.zip",
        versionId: "PRIMARY-PAYLOAD-VERSION",
        mode: "COMPLIANCE",
        retainUntilDate: RETAIN_UNTIL,
      },
      primaryRetentionAfter: {
        key: "raw/example/payload/example.zip",
        versionId: "PRIMARY-PAYLOAD-VERSION",
        mode: "COMPLIANCE",
        retainUntilDate: RETAIN_UNTIL,
      },
      primaryRetentionUnchanged: true,
      temporaryCopyRemoved: true,
    },
    ...overrides,
  };
}

const validate = (record, admitted = admittedFixture()) => validateArchiveRecoveryCopy(record, { admittedPrimaries: admitted });

/** Deep-clones the fixture and applies a mutation, so each case starts from a passing record. */
function broken(mutate) {
  const record = structuredClone(fixture());
  mutate(record);
  return record;
}

function withTempRecord(record, body) {
  const dir = mkdtempSync(path.join(tmpdir(), "archive-recovery-copy-"));
  try {
    const file = path.join(dir, "archive-recovery-copy.json");
    if (record !== undefined) writeFileSync(file, JSON.stringify(record, null, 2));
    return body(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a well-formed recovery copy record validates", () => {
  const record = fixture();
  assert.equal(validate(record), record);
});

test("the checker reads a well-formed record from disk", () => {
  withTempRecord(fixture(), (file) => {
    const record = checkArchiveRecoveryCopy(file, { admittedPrimaries: admittedFixture() });
    assert.equal(record.status, "recovery-copy-verified");
  });
});

test("an absent evidence file fails closed rather than being skipped", () => {
  withTempRecord(undefined, (file) => {
    assert.throws(
      () => checkArchiveRecoveryCopy(file, { admittedPrimaries: admittedFixture() }),
      /has not been produced: data\/archive-recovery-copy\.json does not exist/,
    );
  });
});

test("data/archive-recovery-copy.json is not present in this repository yet, and the default check therefore fails", () => {
  // This is the honest current state: the record is produced by an AWS run that has not happened.
  // If the file is ever added, this assertion should be replaced by a real validation, not deleted.
  let present = true;
  try {
    readFileSync(new URL("../data/archive-recovery-copy.json", import.meta.url), "utf8");
  } catch (error) {
    present = false;
    assert.equal(error.code, "ENOENT");
  }
  if (!present) assert.throws(() => checkArchiveRecoveryCopy(), /has not been produced/);
});

test("a wrong schema string, status, or production-eligibility claim is rejected", () => {
  assert.throws(() => validate(fixture({ schemaVersion: "witness-tree/archive-recovery-copy/2" })), /must be a witness-tree\/archive-recovery-copy\/1 record/);
  assert.throws(() => validate(fixture({ status: "ready" })), /status must be one of/);
  assert.throws(() => validate(fixture({ productionEligible: true })), /must remain production ineligible/);
  assert.throws(() => validate(fixture({ observedAt: "2026-08-28" })), /whole-second UTC instant/);
});

test("a non-Canadian replication destination is rejected", () => {
  for (const region of ["us-east-1", "us-west-2", "eu-west-1", "ca-central-2", "canada-central-1"]) {
    assert.throws(
      () => validate(broken((record) => { record.destination.region = region; })),
      /is not Canadian; every destination must be recorded as Canadian/,
    );
  }
});

test("a Canadian region cannot be claimed with a non-Canadian country code", () => {
  assert.throws(() => validate(broken((record) => { record.destination.countryCode = "US"; })), /must record countryCode CA/);
});

test("the second Canadian region is allowed only with a recorded owner approval", () => {
  assert.throws(() => validate(broken((record) => { record.destination.region = "ca-west-1"; })), /needs a recorded owner approval/);
  assert.doesNotThrow(() => validate(broken((record) => {
    record.destination.region = "ca-west-1";
    record.destination.regionApproval = "Recorded in the replication decision of data/archive-operations-readiness.json.";
  })));
});

test("a destination equal to the primary bucket, or without versioning and Object Lock, is rejected", () => {
  assert.throws(() => validate(broken((record) => { record.destination.bucket = record.primary.bucket; })), /must live in a second bucket/);
  assert.throws(() => validate(broken((record) => { record.destination.versioning = "Suspended"; })), /versioning as Enabled/);
  assert.throws(() => validate(broken((record) => { record.destination.objectLockEnabled = false; })), /Object Lock as enabled/);
});

test("a destination object version that does not map to an admitted primary version is rejected", () => {
  assert.throws(
    () => validate(broken((record) => { record.objects[0].primaryVersionId = "NOT-AN-ADMITTED-VERSION"; })),
    /is not an admitted primary object version/,
  );
  assert.throws(
    () => validate(broken((record) => { record.objects[0].primaryKey = "raw/example/payload/not-admitted.zip"; })),
    /is not an admitted primary object version/,
  );
});

test("two destination objects cannot claim the same primary object version", () => {
  assert.throws(
    () => validate(broken((record) => {
      record.objects[1].primaryKey = record.objects[0].primaryKey;
      record.objects[1].primaryVersionId = record.objects[0].primaryVersionId;
    })),
    /claims a primary object version that another destination object already claims/,
  );
});

test("a replica whose byte length or provider checksum disagrees with the primary is rejected", () => {
  assert.throws(() => validate(broken((record) => { record.objects[0].byteLength = 4097; })), /does not equal the admitted primary byte length/);
  assert.throws(() => validate(broken((record) => { record.objects[0].checksumCrc64nvmeBase64 = "BBBBBBBBBBB="; })), /provider checksum does not equal the admitted primary checksum/);
});

test("a destination object that is not a completed replica is rejected", () => {
  for (const status of ["PENDING", "FAILED", "COMPLETED"]) {
    assert.throws(() => validate(broken((record) => { record.objects[0].replicationStatus = status; })), /must be REPLICA/);
  }
  assert.throws(() => validate(broken((record) => { record.objects[0].coveredBy = "assumed"; })), /coveredBy must be one of/);
});

test("existing objects must be covered by a completed Batch Replication job", () => {
  assert.throws(() => validate(broken((record) => { record.batchReplication.performed = false; })), /batchReplication\.performed must be true/);
  assert.throws(() => validate(broken((record) => { delete record.batchReplication; })), /Batch Replication block is required/);
  assert.throws(() => validate(broken((record) => { record.batchReplication.status = "Failed"; })), /must be recorded as Complete/);
  assert.throws(() => validate(broken((record) => { record.batchReplication.jobId = "  "; })), /job id is required/);
  assert.throws(() => validate(broken((record) => { record.batchReplication.objectsFailed = 3; })), /3 failed objects; the recovery copy is incomplete/);
  assert.throws(() => validate(broken((record) => { record.batchReplication.objectsReplicated = 0; })), /replicated no objects/);
});

test("a rule claiming live replication covers pre-existing objects is rejected as a false S3 claim", () => {
  assert.throws(() => validate(broken((record) => { record.replicationRule.appliesToExistingObjects = true; })), /does not apply to objects that already existed/);
  assert.throws(() => validate(broken((record) => { record.replicationRule.status = "Disabled"; })), /must be recorded as Enabled/);
  assert.throws(() => validate(broken((record) => { delete record.replicationRule.supersededFlatKeyVersionsExcluded; })), /supersededFlatKeyVersionsExcluded must be a boolean/);
  assert.throws(() => validate(broken((record) => { delete record.replicationRule.supersededFlatKeyDecision; })), /decision on superseded flat-key versions is required/);
});

test("Object Lock facts must be recorded accurately and the irreversibility acknowledged", () => {
  assert.throws(() => validate(broken((record) => { record.objectLock.destinationRetentionMode = "GOVERNANCE"; })), /destinationRetentionMode must be recorded as COMPLIANCE/);
  assert.throws(() => validate(broken((record) => { record.objectLock.replicatedFromPrimary = false; })), /replicatedFromPrimary must record/);
  assert.throws(() => validate(broken((record) => { record.objectLock.irreversible = false; })), /irreversible must be true/);
  assert.throws(() => validate(broken((record) => { record.objectLock.irreversibilityAcknowledgement = "The copy is retained."; })), /must state plainly that the replicated retention cannot be shortened or removed/);
  assert.throws(() => validate(broken((record) => { record.objectLock.destinationRetainUntilDate = "2033-08-12"; })), /must be a whole-second UTC retention instant/);
});

test("a per-object retention that disagrees with the recorded destination retention is rejected", () => {
  assert.throws(() => validate(broken((record) => { record.objects[0].retention.retainUntilDate = "2030-01-01T00:00:00Z"; })), /retain-until date does not match/);
  assert.throws(() => validate(broken((record) => { record.objects[0].retention.mode = "GOVERNANCE"; })), /retention mode does not match/);
  assert.throws(() => validate(broken((record) => { record.objects[0].retention = null; })), /retention is required/);
});

test("an unlocked primary must not be recorded as though its replica were locked", () => {
  assert.throws(
    () => validate(broken((record) => { record.objects[1].retention = { mode: "COMPLIANCE", retainUntilDate: RETAIN_UNTIL }; })),
    /maps to an unlocked primary object, so its retention must be recorded as null/,
  );
});

test("coverage counts must be observed, and an unknown count is never read as zero", () => {
  assert.throws(() => validate(broken((record) => { delete record.coverage.replicatedObjectCount; })), /must be recorded as an observed integer; an absent value is not zero/);
  assert.throws(() => validate(broken((record) => { record.coverage.replicatedObjectCount = null; })), /an absent value is not zero/);
  assert.throws(() => validate(broken((record) => { record.coverage.admittedPrimaryObjectCount = "unknown"; })), /an unknown count is not zero/);
  assert.throws(() => validate(broken((record) => { record.batchReplication.objectsFailed = "unknown"; })), /an unknown count is not zero/);
  assert.throws(() => validate(broken((record) => { delete record.batchReplication.objectsFailed; })), /an absent value is not zero/);
  assert.throws(() => validate(broken((record) => { delete record.coverage.uncoveredPrimaryObjects; })), /an absent list is not an empty one/);
});

test("an uncovered primary object version must be listed, and cannot be claimed as complete coverage", () => {
  const partial = broken((record) => {
    record.objects.pop();
    record.coverage.replicatedObjectCount = 1;
    record.batchReplication.objectsReplicated = 1;
  });
  assert.throws(() => validate(partial), /does not match the 1 admitted primary object versions this record leaves uncovered/);

  const listed = structuredClone(partial);
  listed.coverage.uncoveredPrimaryObjects = ["raw/example/manifest.json@PRIMARY-MANIFEST-VERSION"];
  assert.throws(() => validate(listed), /coverage\.complete must equal the computed comparison/);

  const honest = structuredClone(listed);
  honest.coverage.complete = false;
  assert.throws(() => validate(honest), /may claim recovery-copy-verified only when every admitted primary object version is covered/);

  const partialStatus = structuredClone(honest);
  partialStatus.status = "partial-coverage";
  assert.doesNotThrow(() => validate(partialStatus));

  assert.throws(() => validate(fixture({ status: "partial-coverage" })), /must not understate itself as partial-coverage/);
});

test("coverage counts must agree with the repository and with the recorded objects", () => {
  assert.throws(() => validate(broken((record) => { record.coverage.admittedPrimaryObjectCount = 84; })), /primary object versions are admitted in this repository/);
  assert.throws(() => validate(broken((record) => { record.coverage.replicatedObjectCount = 3; })), /does not equal the number of recorded destination objects/);
});

test("a missing or failed recovery exercise is rejected", () => {
  assert.throws(() => validate(broken((record) => { delete record.recoveryExercise; })), /recovery exercise block is required/);
  assert.throws(() => validate(broken((record) => { record.recoveryExercise.performed = false; })), /recoveryExercise\.performed must be true/);
  assert.throws(() => validate(broken((record) => { record.recoveryExercise.status = "failed"; })), /must record a passed status/);
  assert.throws(() => validate(broken((record) => { record.recoveryExercise.temporaryCopyRemoved = false; })), /temporary copy was removed/);
  assert.throws(() => validate(broken((record) => { record.recoveryExercise.completedAt = "2026-08-28T11:00:00Z"; })), /cannot complete before it started/);
});

test("the recovery exercise must restore from the destination copy, not the primary", () => {
  assert.throws(() => validate(broken((record) => { record.recoveryExercise.restoredFrom.bucket = record.primary.bucket; })), /must restore from the destination bucket/);
  assert.throws(() => validate(broken((record) => { record.recoveryExercise.restoredFrom.versionId = "SOME-OTHER-VERSION"; })), /restored a destination object version that this record does not list/);
});

test("a checksum or byte-length mismatch in the recovered bytes is rejected", () => {
  assert.throws(
    () => validate(broken((record) => {
      record.recoveryExercise.observed.sha256 = "b".repeat(64);
      record.recoveryExercise.sha256Matches = false;
    })),
    /recovered SHA-256 does not equal the expected SHA-256/,
  );
  assert.throws(
    () => validate(broken((record) => { record.recoveryExercise.observed.sha256 = "b".repeat(64); })),
    /sha256Matches must equal the computed comparison/,
  );
  assert.throws(
    () => validate(broken((record) => {
      record.recoveryExercise.observed.byteLength = 4095;
      record.recoveryExercise.byteLengthMatches = false;
    })),
    /recovered byte length does not equal the expected byte length/,
  );
  assert.throws(
    () => validate(broken((record) => { record.recoveryExercise.expected.byteLength = 4095; })),
    /expected byte length does not equal the recorded destination object byte length/,
  );
});

test("the primary retention read-back must be present, on the right object, and unchanged", () => {
  assert.throws(() => validate(broken((record) => { delete record.recoveryExercise.primaryRetentionAfter; })), /primaryRetentionAfter is required/);
  assert.throws(
    () => validate(broken((record) => {
      record.recoveryExercise.primaryRetentionAfter.retainUntilDate = "2030-01-01T00:00:00Z";
      record.recoveryExercise.primaryRetentionUnchanged = false;
    })),
    /primary object's retention changed across the recovery exercise/,
  );
  assert.throws(
    () => validate(broken((record) => { record.recoveryExercise.primaryRetentionAfter.mode = "GOVERNANCE"; })),
    /primaryRetentionUnchanged must equal the computed comparison/,
  );
  assert.throws(
    () => validate(broken((record) => { record.recoveryExercise.primaryRetentionAfter.versionId = "PRIMARY-MANIFEST-VERSION"; })),
    /must read back the primary object version that the restored copy was made from/,
  );
});

test("credential-shaped material anywhere in the record is rejected", () => {
  const cases = [
    ["an access key identifier in a free-text field", (record) => { record.notice = "Run as AKIAIOSFODNN7EXAMPLE."; }, /AWS access key identifier/],
    ["a session token", (record) => { record.replicationRule.scope = "FwoGZXIvYXdzEBYaDNotARealTokenButShapedLikeOnePaddingPaddingPadding"; }, /STS session token/],
    ["a shared-credentials key name", (record) => { record.destination.regionEvidenceReference = "aws_secret_access_key was exported first"; }, /shared-credentials key name/],
    ["a security-token header", (record) => { record.notice = "Signed with x-amz-security-token."; }, /session-token header/],
    ["an MFA device serial", (record) => { record.notice = "Serial arn:aws:iam::123456789012:mfa/owner"; }, /MFA device serial/],
    ["an inline MFA code", (record) => { record.notice = "MFA code 123456 was entered."; }, /MFA or TOTP code/],
    ["a bare one-time code", (record) => { record.batchReplication.jobId = "123456"; }, /bare six-digit one-time code/],
    ["a credential-shaped field name", (record) => { record.destination.sessionToken = "redacted"; }, /credential-shaped field/],
    ["an MFA field name", (record) => { record.recoveryExercise.mfaSerialNumber = "redacted"; }, /credential-shaped field/],
    ["a TOTP field name", (record) => { record.recoveryExercise.totp = "redacted"; }, /credential-shaped field/],
  ];
  for (const [name, mutate, pattern] of cases) {
    assert.throws(() => validate(broken(mutate)), pattern, name);
  }
});

test("the credential scan reaches nested arrays and objects", () => {
  assert.throws(
    () => assertNoCredentialMaterial({ a: [{ b: ["AKIAIOSFODNN7EXAMPLE"] }] }),
    /record\.a\[0\]\.b\[0\] contains an AWS access key identifier/,
  );
  assert.doesNotThrow(() => assertNoCredentialMaterial({ a: [{ b: ["ordinary text", 5, null, true] }] }));
});

test("the admitted primary map is built from the two records the plan names", () => {
  const promotions = JSON.parse(readFileSync(new URL("../data/immutable-promotions.json", import.meta.url), "utf8"));
  const vlce2 = JSON.parse(readFileSync(new URL("../data/vlce2-remote-promotion-evidence.json", import.meta.url), "utf8"));
  const admitted = collectAdmittedPrimaryObjects(promotions, vlce2);
  // Three promoted payloads and their manifests, plus 39 VLCE2 payloads and their sidecars.
  assert.equal(admitted.size, 84);
  assert.equal([...admitted.values()].filter((entry) => entry.locked).length, 42);
  for (const entry of admitted.values()) {
    assert.ok(entry.key.startsWith("raw/"), entry.key);
    assert.ok(entry.byteLength > 0);
  }
});

test("an empty admitted primary set is refused rather than passing vacuously", () => {
  assert.throws(() => validateArchiveRecoveryCopy(fixture(), { admittedPrimaries: new Map() }), /admitted primary object versions are required/);
  assert.throws(() => validateArchiveRecoveryCopy(fixture(), {}), /admitted primary object versions are required/);
  assert.throws(() => validate(broken((record) => { record.objects = []; })), /must record every destination object version/);
});
