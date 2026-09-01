#!/usr/bin/env node
/**
 * Read-only evidence runner for an owner-completed S3 recovery copy.
 *
 * This runner never creates or changes an AWS resource. It accepts the identifiers and owner
 * acknowledgements for a copy operation that has already happened, then uses only read operations
 * to account for every primary object version admitted by this repository. A record is returned
 * only after complete coverage and a destination restore exercise have been observed.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  createReadStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import {
  collectAdmittedPrimaryObjects,
  primaryObjectIdentity,
  validateArchiveRecoveryCopy,
} from "./check-archive-recovery-copy.mjs";
import { validateArchiveOperationsReadiness } from "./check-archive-operations-readiness.mjs";

const INPUT_SCHEMA = "witness-tree/archive-recovery-copy-run-input/1";
const CANADIAN_REGIONS = new Set(["ca-central-1", "ca-west-1"]);
export const READ_ONLY_OPERATIONS = new Set([
  "describe-job",
  "get-bucket-location",
  "get-bucket-replication",
  "get-bucket-versioning",
  "get-object",
  "get-object-lock-configuration",
  "get-object-retention",
  "head-object",
  "list-object-versions",
]);
const SHA256 = /^[a-f\d]{64}$/;

const read = (relativePath) => JSON.parse(readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8"));
const fail = (message) => { throw new Error(`Archive recovery copy runner refused: ${message}`); };

function text(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`${label} is required.`);
  return value;
}

function observedCount(value, label) {
  if (value === undefined || value === null) fail(`${label} was not observed; an unknown count is not zero.`);
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be an observed non-negative integer.`);
  return value;
}

function instant(value, label) {
  const parsed = new Date(value);
  if (!(typeof value === "string" || value instanceof Date) || Number.isNaN(parsed.valueOf())) fail(`${label} is not an observed timestamp.`);
  return parsed;
}

function wholeSecond(value, label) {
  return instant(value, label).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function runInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("a private run input object is required.");
  if (value.schemaVersion !== INPUT_SCHEMA) fail(`the private input must be a ${INPUT_SCHEMA} record.`);
  if (!/^\d{12}$/.test(value.awsAccountId ?? "")) fail("awsAccountId must be the 12-digit account that owns the Batch Replication job.");
  text(value.replicationRuleId, "replicationRuleId");
  text(value.batchReplicationJobId, "batchReplicationJobId");
  if (typeof value.supersededFlatKeyVersionsExcluded !== "boolean") fail("supersededFlatKeyVersionsExcluded must record the owner's boolean decision.");
  text(value.supersededFlatKeyDecision, "supersededFlatKeyDecision");
  text(value.irreversibilityAcknowledgement, "irreversibilityAcknowledgement");
  return value;
}

function approvedReadiness(record) {
  validateArchiveOperationsReadiness(record);
  if (record.decisions.recoveryCopy.state !== "approved") fail("data/archive-operations-readiness.json has not approved a recovery copy.");
  if (record.decisions.replication.state !== "approved-canadian") fail("data/archive-operations-readiness.json has not approved Canadian replication.");
  return record;
}

function repositoryStorage(promotions, vlce2) {
  const promotionBucket = text(promotions.bucket?.bucketId, "immutable-promotions bucket id");
  const promotionRegion = text(promotions.bucket?.region?.regionId, "immutable-promotions region id");
  const vlce2Bucket = text(vlce2.storage?.bucket, "VLCE2 storage bucket");
  const vlce2Region = text(vlce2.storage?.region, "VLCE2 storage region");
  if (promotionBucket !== vlce2Bucket || promotionRegion !== vlce2Region) fail("the two admitted-object records do not identify one primary bucket and region.");
  if (!CANADIAN_REGIONS.has(promotionRegion)) fail(`the recorded primary region ${promotionRegion} is not Canadian.`);
  return { bucket: promotionBucket, region: promotionRegion };
}

function expectedPayloadDigests(promotions, vlce2, staged, vlce2Preparation) {
  const expected = new Map();
  for (const promotion of promotions.entries ?? []) {
    const source = staged.entries?.find((entry) => entry.id === promotion.stagedEntryId);
    if (!source) fail(`no staged acquisition accounts for ${promotion.payloadKey}.`);
    if (!SHA256.test(source.sha256 ?? "") || source.byteLength !== promotion.remoteByteLength || !promotion.snapshotId?.endsWith(`:${source.sha256}`)) {
      fail(`the staged bytes do not bind ${promotion.payloadKey}.`);
    }
    expected.set(primaryObjectIdentity(promotion.payloadKey, promotion.payloadVersionId), source.sha256);
  }
  for (const remote of vlce2.entries ?? []) {
    const planned = vlce2Preparation.entries?.find((entry) => entry.year === remote.year);
    if (!planned || !SHA256.test(planned.sha256 ?? "") || planned.remote?.payloadKey !== remote.payload?.key || planned.remote?.versionId !== remote.payload?.versionId || planned.byteLength !== remote.payload?.byteLength) {
      fail(`the staged VLCE2 bytes do not bind the admitted ${remote.year} payload.`);
    }
    expected.set(primaryObjectIdentity(remote.payload.key, remote.payload.versionId), planned.sha256);
  }
  return expected;
}

function replicationPrefix(rule) {
  if (rule.Filter !== undefined) {
    if (!rule.Filter || typeof rule.Filter !== "object" || Array.isArray(rule.Filter) || Object.keys(rule.Filter).some((key) => key !== "Prefix")) {
      fail("the selected replication rule uses a tag or compound filter, so key coverage cannot be accounted for from repository evidence.");
    }
    if (typeof rule.Filter.Prefix !== "string") fail("the selected replication rule has no observable key prefix.");
    return rule.Filter.Prefix;
  }
  if (typeof rule.Prefix === "string") return rule.Prefix;
  fail("the selected replication rule has no observable key scope.");
}

function destinationBucket(rule) {
  const arn = text(rule.Destination?.Bucket, "replication destination bucket ARN");
  const match = /^arn:aws:s3:::([a-z\d.-]+)$/.exec(arn);
  if (!match) fail("the replication destination is not a concrete standard-partition S3 bucket ARN.");
  return match[1];
}

function retentionObservation(response, expected, label) {
  if (!response || typeof response !== "object" || Array.isArray(response)) fail(`${label} retention was not observed.`);
  const actual = response.Retention;
  if (!expected.locked) {
    const explicitlyEmpty = actual && typeof actual === "object" && !Array.isArray(actual) && Object.keys(actual).length === 0;
    if (actual !== undefined && actual !== null && !explicitlyEmpty) fail(`${label} unexpectedly carries retention although its admitted primary is unlocked.`);
    return null;
  }
  if (!actual || actual.Mode !== "COMPLIANCE" || typeof actual.RetainUntilDate !== "string") fail(`${label} does not carry observed COMPLIANCE retention.`);
  if (Date.parse(actual.RetainUntilDate) !== Date.parse(expected.retainUntilDate)) fail(`${label} retention differs from the admitted primary retention.`);
  return { mode: actual.Mode, retainUntilDate: wholeSecond(actual.RetainUntilDate, `${label} retain-until date`) };
}

async function fileDigest(file) {
  const digest = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk) => digest.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return { byteLength: statSync(file).size, sha256: digest.digest("hex") };
}

async function downloadedDigest({ aws, bucket, region, key, versionId, directory, sequence }) {
  const destinationPath = join(directory, `readback-${sequence}`);
  let result;
  try {
    await aws("get-object", { bucket, region, key, versionId, checksumMode: "ENABLED", destinationPath });
    if (!existsSync(destinationPath)) fail(`${key} version ${versionId} did not produce restored bytes.`);
    result = await fileDigest(destinationPath);
  } finally {
    rmSync(destinationPath, { force: true });
  }
  if (existsSync(destinationPath)) fail(`${key} version ${versionId} left its temporary restored copy behind.`);
  return { ...result, temporaryCopyRemoved: true };
}

function assertExactHead(head, expected, label) {
  if (!head || typeof head !== "object") fail(`${label} metadata was not observed.`);
  if (head.VersionId !== expected.versionId) fail(`${label} returned a different version ID.`);
  if (head.ContentLength !== expected.byteLength) fail(`${label} byte length differs from the repository record.`);
  if (expected.checksumCrc64nvmeBase64 && head.ChecksumCRC64NVME !== expected.checksumCrc64nvmeBase64) fail(`${label} CRC64NVME differs from the repository record.`);
  return head;
}

function batchObservation(response, input, admittedCount) {
  const job = response?.Job;
  if (!job || typeof job !== "object") fail("the Batch Replication job was not observed.");
  if (job.JobId !== input.batchReplicationJobId) fail("describe-job returned a different Batch Replication job ID.");
  if (job.Status !== "Complete") fail(`Batch Replication job status is ${job.Status ?? "unobserved"}, not Complete.`);
  if (!job.Operation || !Object.hasOwn(job.Operation, "S3ReplicateObject")) fail("the completed Batch job did not perform S3 ReplicateObject.");
  const succeeded = observedCount(job.ProgressSummary?.NumberOfTasksSucceeded, "Batch Replication succeeded count");
  const failed = observedCount(job.ProgressSummary?.NumberOfTasksFailed, "Batch Replication failed count");
  const total = observedCount(job.ProgressSummary?.TotalNumberOfTasks, "Batch Replication total task count");
  if (total !== succeeded + failed) fail("the observed Batch Replication task counts do not reconcile.");
  if (failed !== 0) fail(`Batch Replication observed ${failed} failed tasks.`);
  if (succeeded < admittedCount) fail(`Batch Replication observed only ${succeeded} successful tasks for ${admittedCount} admitted objects.`);
  return {
    job,
    completedAt: wholeSecond(job.TerminationDate, "Batch Replication termination date"),
    succeeded,
    failed,
  };
}

/**
 * Observes an already completed recovery copy. `aws` is an injected transport and every permitted
 * operation is read-only. The copy, rule, destination, and Batch job must already exist.
 */
export async function runArchiveRecoveryCopy({
  input,
  aws,
  promotions = read("data/immutable-promotions.json"),
  vlce2 = read("data/vlce2-remote-promotion-evidence.json"),
  staged = read("data/staged-acquisitions.json"),
  vlce2Preparation = read("data/vlce2-promotion-preparation.json"),
  readiness = read("data/archive-operations-readiness.json"),
  clock = () => new Date(),
} = {}) {
  const ownerInput = runInput(input);
  if (typeof aws !== "function") throw new TypeError("A read-only aws transport is required.");
  approvedReadiness(readiness);
  const primary = repositoryStorage(promotions, vlce2);
  const admitted = collectAdmittedPrimaryObjects(promotions, vlce2);
  if (admitted.size === 0) fail("the repository has no admitted primary object versions.");
  const expectedSha256 = expectedPayloadDigests(promotions, vlce2, staged, vlce2Preparation);
  const keyOwners = new Set();
  for (const object of admitted.values()) {
    if (keyOwners.has(object.key)) fail(`more than one admitted primary version uses ${object.key}; destination mapping would be ambiguous.`);
    keyOwners.add(object.key);
    if (object.locked && !expectedSha256.has(primaryObjectIdentity(object.key, object.versionId))) fail(`locked payload ${object.key} has no staged SHA-256 binding.`);
  }

  const invoke = async (operation, request) => {
    if (!READ_ONLY_OPERATIONS.has(operation)) fail(`operation ${operation} is not read-only and is prohibited.`);
    return aws(operation, request);
  };
  const primaryLocation = await invoke("get-bucket-location", { bucket: primary.bucket, region: primary.region });
  if (primaryLocation?.LocationConstraint !== primary.region) fail("the primary bucket region differs from the admitted-object records.");
  const replication = await invoke("get-bucket-replication", { bucket: primary.bucket, region: primary.region });
  const rules = replication?.ReplicationConfiguration?.Rules;
  if (!Array.isArray(rules)) fail("the source replication rules were not observed.");
  const selected = rules.filter((rule) => rule?.ID === ownerInput.replicationRuleId);
  if (selected.length !== 1) fail(`replication rule ${ownerInput.replicationRuleId} was not observed exactly once.`);
  const rule = selected[0];
  if (rule.Status !== "Enabled") fail("the selected replication rule is not Enabled.");
  const prefix = replicationPrefix(rule);
  for (const object of admitted.values()) {
    if (!object.key.startsWith(prefix)) fail(`replication rule prefix ${JSON.stringify(prefix)} does not account for ${object.key}.`);
  }
  const supersededKeys = promotions.entries?.map((entry) => text(entry.supersededPayloadKey, "superseded payload key")) ?? [];
  if (supersededKeys.length === 0) fail("the superseded flat-key versions were not enumerated.");
  const supersededExcluded = supersededKeys.every((key) => !key.startsWith(prefix));
  if (ownerInput.supersededFlatKeyVersionsExcluded !== supersededExcluded) fail("the owner-recorded superseded flat-key decision disagrees with the observed rule prefix.");

  const destination = { bucket: destinationBucket(rule) };
  if (destination.bucket === primary.bucket) fail("the observed destination is the primary bucket, not a recovery copy.");
  const destinationLocation = await invoke("get-bucket-location", { bucket: destination.bucket, region: primary.region });
  destination.region = destinationLocation?.LocationConstraint;
  if (!CANADIAN_REGIONS.has(destination.region)) fail(`the observed destination region ${destination.region ?? "unobserved"} is not Canadian.`);
  if (destination.region === "ca-west-1") {
    const approval = `${readiness.decisions.recoveryCopy.reason} ${readiness.decisions.replication.reason}`;
    if (!/(?:ca-west-1|calgary|canada west)/i.test(approval)) fail("the ca-west-1 destination has no region-specific owner approval in data/archive-operations-readiness.json.");
  }
  const versioning = await invoke("get-bucket-versioning", { bucket: destination.bucket, region: destination.region });
  if (versioning?.Status !== "Enabled") fail("the recovery bucket versioning state is not observed as Enabled.");
  const lockConfiguration = await invoke("get-object-lock-configuration", { bucket: destination.bucket, region: destination.region });
  if (lockConfiguration?.ObjectLockConfiguration?.ObjectLockEnabled !== "Enabled") fail("the recovery bucket Object Lock state is not observed as Enabled.");
  const batch = batchObservation(
    await invoke("describe-job", { region: primary.region, accountId: ownerInput.awsAccountId, jobId: ownerInput.batchReplicationJobId }),
    ownerInput,
    admitted.size,
  );

  const temp = mkdtempSync(join(tmpdir(), "witness-tree-archive-recovery-copy-"));
  chmodSync(temp, 0o700);
  let sequence = 0;
  try {
    const objects = [];
    const mapped = new Map();
    for (const [id, admittedObject] of admitted) {
      const sourceHead = assertExactHead(
        await invoke("head-object", { bucket: primary.bucket, region: primary.region, key: admittedObject.key, versionId: admittedObject.versionId, checksumMode: "ENABLED" }),
        admittedObject,
        `primary ${admittedObject.key}`,
      );
      if (!["COMPLETE", "COMPLETED"].includes(sourceHead.ReplicationStatus)) fail(`primary ${admittedObject.key} is not observed with completed replication status.`);
      if (instant(sourceHead.LastModified, `primary ${admittedObject.key} LastModified`) >= instant(batch.job.CreationTime, "Batch Replication creation time")) {
        fail(`primary ${admittedObject.key} was not observed as pre-existing when the Batch Replication job was created.`);
      }
      retentionObservation(
        await invoke("get-object-retention", { bucket: primary.bucket, region: primary.region, key: admittedObject.key, versionId: admittedObject.versionId }),
        admittedObject,
        `primary ${admittedObject.key}`,
      );

      const listed = await invoke("list-object-versions", { bucket: destination.bucket, region: destination.region, prefix: admittedObject.key });
      if (!listed || !Array.isArray(listed.Versions)) fail(`destination versions for ${admittedObject.key} were not observed; an absent list is not zero.`);
      if (listed.IsTruncated === true || listed.NextToken) fail(`destination version enumeration for ${admittedObject.key} was truncated.`);
      const exactVersions = listed.Versions.filter((version) => version?.Key === admittedObject.key);
      for (const version of exactVersions) {
        text(version.VersionId, `destination version ID for ${admittedObject.key}`);
        if (!Number.isSafeInteger(version.Size) || version.Size < 0) fail(`destination byte length for ${admittedObject.key} was not observed.`);
      }
      const sizeCandidates = exactVersions.filter((version) => version.Size === admittedObject.byteLength);
      const replicaCandidates = [];
      let primaryDigest;
      if (!admittedObject.checksumCrc64nvmeBase64) {
        primaryDigest = await downloadedDigest({ aws: invoke, bucket: primary.bucket, region: primary.region, key: admittedObject.key, versionId: admittedObject.versionId, directory: temp, sequence: sequence++ });
        if (primaryDigest.byteLength !== admittedObject.byteLength) fail(`the exact primary download for ${admittedObject.key} did not contain the admitted byte length.`);
      }
      for (const version of sizeCandidates) {
        const head = await invoke("head-object", { bucket: destination.bucket, region: destination.region, key: admittedObject.key, versionId: version.VersionId, checksumMode: "ENABLED" });
        if (head?.VersionId !== version.VersionId || head?.ContentLength !== admittedObject.byteLength || head?.ReplicationStatus !== "REPLICA") continue;
        if (admittedObject.checksumCrc64nvmeBase64) {
          if (head.ChecksumCRC64NVME !== admittedObject.checksumCrc64nvmeBase64) continue;
        } else {
          const candidateDigest = await downloadedDigest({ aws: invoke, bucket: destination.bucket, region: destination.region, key: admittedObject.key, versionId: version.VersionId, directory: temp, sequence: sequence++ });
          if (candidateDigest.byteLength !== admittedObject.byteLength || candidateDigest.byteLength !== primaryDigest.byteLength || candidateDigest.sha256 !== primaryDigest.sha256) continue;
        }
        replicaCandidates.push({ version, head });
      }
      if (replicaCandidates.length !== 1) fail(`${admittedObject.key} maps to ${replicaCandidates.length} byte-identical destination replicas; exactly one is required.`);
      const replica = replicaCandidates[0];
      const retention = retentionObservation(
        await invoke("get-object-retention", { bucket: destination.bucket, region: destination.region, key: admittedObject.key, versionId: replica.version.VersionId }),
        admittedObject,
        `destination ${admittedObject.key}`,
      );
      const object = {
        primaryKey: admittedObject.key,
        primaryVersionId: admittedObject.versionId,
        destinationKey: admittedObject.key,
        destinationVersionId: replica.version.VersionId,
        byteLength: admittedObject.byteLength,
        ...(admittedObject.checksumCrc64nvmeBase64 ? { checksumCrc64nvmeBase64: admittedObject.checksumCrc64nvmeBase64 } : {}),
        replicationStatus: "REPLICA",
        coveredBy: "batch-replication",
        retention,
      };
      objects.push(object);
      mapped.set(id, object);
    }

    const lockedRetentions = objects.filter((object) => object.retention).map((object) => object.retention);
    if (lockedRetentions.length === 0) fail("no compliance-locked replica was observed.");
    const destinationRetainUntilDate = lockedRetentions[0].retainUntilDate;
    if (lockedRetentions.some((retention) => retention.mode !== "COMPLIANCE" || Date.parse(retention.retainUntilDate) !== Date.parse(destinationRetainUntilDate))) {
      fail("the destination replicas do not share the admitted COMPLIANCE retention date.");
    }
    const exerciseCandidates = [...admitted.entries()]
      .filter(([id, object]) => object.locked && expectedSha256.has(id))
      .sort((left, right) => left[1].byteLength - right[1].byteLength);
    if (exerciseCandidates.length === 0) fail("no locked payload has staged bytes available for a recovery exercise.");
    const [exerciseId, exercisePrimary] = exerciseCandidates[0];
    const exerciseDestination = mapped.get(exerciseId);
    const before = retentionObservation(
      await invoke("get-object-retention", { bucket: primary.bucket, region: primary.region, key: exercisePrimary.key, versionId: exercisePrimary.versionId }),
      exercisePrimary,
      `primary recovery-exercise ${exercisePrimary.key} before`,
    );
    const startedAt = wholeSecond(clock(), "recovery exercise start");
    const restored = await downloadedDigest({ aws: invoke, bucket: destination.bucket, region: destination.region, key: exerciseDestination.destinationKey, versionId: exerciseDestination.destinationVersionId, directory: temp, sequence: sequence++ });
    const after = retentionObservation(
      await invoke("get-object-retention", { bucket: primary.bucket, region: primary.region, key: exercisePrimary.key, versionId: exercisePrimary.versionId }),
      exercisePrimary,
      `primary recovery-exercise ${exercisePrimary.key} after`,
    );
    const completedAt = wholeSecond(clock(), "recovery exercise completion");
    const expected = { byteLength: exercisePrimary.byteLength, sha256: expectedSha256.get(exerciseId) };
    if (restored.byteLength !== expected.byteLength || restored.sha256 !== expected.sha256) fail("the destination recovery exercise bytes do not match the staged payload.");
    if (before.mode !== after.mode || Date.parse(before.retainUntilDate) !== Date.parse(after.retainUntilDate)) fail("the primary retention changed across the recovery exercise.");

    const record = {
      schemaVersion: "witness-tree/archive-recovery-copy/1",
      status: "recovery-copy-verified",
      productionEligible: false,
      notice: "Read-only observation of a completed Canadian recovery copy. It proves storage coverage and one restore exercise only; it does not admit data or make any AWS change.",
      observedAt: wholeSecond(clock(), "recovery copy observation time"),
      primary: { bucket: primary.bucket, region: primary.region, countryCode: "CA" },
      destination: {
        bucket: destination.bucket,
        region: destination.region,
        countryCode: "CA",
        versioning: versioning.Status,
        objectLockEnabled: true,
        regionEvidenceReference: `get-bucket-location returned LocationConstraint=${destination.region} during this read-only run.`,
        ...(destination.region === "ca-west-1" ? { regionApproval: `Approved in data/archive-operations-readiness.json: ${readiness.decisions.recoveryCopy.reason} ${readiness.decisions.replication.reason}` } : {}),
      },
      replicationRule: {
        id: rule.ID,
        status: rule.Status,
        scope: prefix ? `Object keys beginning ${JSON.stringify(prefix)}.` : "All object keys in the source bucket.",
        appliesToExistingObjects: false,
        supersededFlatKeyVersionsExcluded: supersededExcluded,
        supersededFlatKeyDecision: ownerInput.supersededFlatKeyDecision,
      },
      batchReplication: {
        performed: true,
        jobId: batch.job.JobId,
        status: batch.job.Status,
        completedAt: batch.completedAt,
        objectsReplicated: batch.succeeded,
        objectsFailed: batch.failed,
      },
      objectLock: {
        destinationRetentionMode: "COMPLIANCE",
        destinationRetainUntilDate,
        replicatedFromPrimary: true,
        irreversible: true,
        irreversibilityAcknowledgement: ownerInput.irreversibilityAcknowledgement,
      },
      objects,
      coverage: {
        admittedPrimaryObjectCount: admitted.size,
        replicatedObjectCount: objects.length,
        uncoveredPrimaryObjects: [],
        complete: objects.length === admitted.size,
      },
      recoveryExercise: {
        performed: true,
        status: "passed",
        startedAt,
        completedAt,
        restoredFrom: { bucket: destination.bucket, key: exerciseDestination.destinationKey, versionId: exerciseDestination.destinationVersionId },
        expected,
        observed: { byteLength: restored.byteLength, sha256: restored.sha256 },
        byteLengthMatches: restored.byteLength === expected.byteLength,
        sha256Matches: restored.sha256 === expected.sha256,
        primaryRetentionBefore: { key: exercisePrimary.key, versionId: exercisePrimary.versionId, mode: before.mode, retainUntilDate: before.retainUntilDate },
        primaryRetentionAfter: { key: exercisePrimary.key, versionId: exercisePrimary.versionId, mode: after.mode, retainUntilDate: after.retainUntilDate },
        primaryRetentionUnchanged: before.mode === after.mode && Date.parse(before.retainUntilDate) === Date.parse(after.retainUntilDate),
        temporaryCopyRemoved: restored.temporaryCopyRemoved,
      },
    };
    return validateArchiveRecoveryCopy(record, { admittedPrimaries: admitted });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function cliTransport() {
  const json = (args) => JSON.parse(execFileSync("aws", [...args, "--output", "json", "--no-cli-pager"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  return (operation, request) => {
    const region = ["--region", request.region];
    if (operation === "describe-job") return json(["s3control", "describe-job", "--account-id", request.accountId, "--job-id", request.jobId, ...region]);
    const bucket = ["--bucket", request.bucket];
    if (["get-bucket-location", "get-bucket-replication", "get-bucket-versioning", "get-object-lock-configuration"].includes(operation)) {
      return json(["s3api", operation, ...bucket, ...region]);
    }
    if (operation === "list-object-versions") return json(["s3api", operation, ...bucket, "--prefix", request.prefix, ...region]);
    const object = [...bucket, "--key", request.key, "--version-id", request.versionId];
    if (operation === "head-object") return json(["s3api", operation, ...object, "--checksum-mode", request.checksumMode, ...region]);
    if (operation === "get-object-retention") return json(["s3api", operation, ...object, ...region]);
    if (operation === "get-object") return json(["s3api", operation, ...object, "--checksum-mode", request.checksumMode, request.destinationPath, ...region]);
    throw new Error(`Unsupported read-only operation ${operation}.`);
  };
}

function parseArgs(argv) {
  if (argv.length === 4 && argv[0] === "--input" && isAbsolute(argv[1]) && argv[2] === "--write" && isAbsolute(argv[3])) {
    return { inputFile: argv[1], write: argv[3] };
  }
  throw new Error("Usage: run-archive-recovery-copy.mjs --input /absolute/private-input.json --write /absolute/archive-recovery-copy.json");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { inputFile, write } = parseArgs(process.argv.slice(2));
  const input = JSON.parse(readFileSync(inputFile, "utf8"));
  const record = await runArchiveRecoveryCopy({ input, aws: cliTransport() });
  writeFileSync(write, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  chmodSync(write, 0o600);
  process.stdout.write(`Recorded ${record.objects.length} exact destination replicas and a passed recovery exercise.\n`);
}
