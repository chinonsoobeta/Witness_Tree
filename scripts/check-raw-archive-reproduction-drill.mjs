import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const SCHEMA_VERSION = "witness-tree/raw-archive-reproduction-drill/1";
const METHOD_VERSION = "phase1-federal-electoral-districts-2023-v1";
const RUNNER_RELATIVE_PATH = "scripts/run-phase1-federal-electoral-transformation.mjs";
const RUNNER_URL = new URL("../scripts/run-phase1-federal-electoral-transformation.mjs", import.meta.url);
const RESTORE_RUNNER_RELATIVE_PATH = "scripts/restore-federal-electoral-archive-reproduction-inputs.sh";
const RESTORE_RUNNER_URL = new URL("../scripts/restore-federal-electoral-archive-reproduction-inputs.sh", import.meta.url);
const DRILL_URL = new URL("../data/raw-archive-reproduction-drill.json", import.meta.url);
const ARCHIVE_EVIDENCE_URL = new URL("../data/federal-electoral-archive-recovery-evidence.json", import.meta.url);
const ADMISSION_URL = new URL("../data/phase1-federal-electoral-production-admission.json", import.meta.url);

const SHA256 = /^[a-f\d]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
// sts assume-role mints a session and mutates nothing. It was previously absent, which meant a
// record listing every call it truly made would be rejected while an under-reporting one passed.
const READ_ONLY_OPERATIONS = new Set(["s3api head-object", "s3api get-object", "s3api head-bucket", "s3api list-object-versions", "s3api get-object-attributes", "sts get-caller-identity", "sts assume-role"]);
const MUTATION = /put-object|delete-object|delete-objects|put-bucket|create-bucket|copy-object|restore-object|legal-hold|retention|object-lock|--acl\b|\bcp\b|\bmv\b|\brm\b|\bsync\b/i;

function requiredText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
}

function requiredSha256(value, name) {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${name} must be a lowercase hexadecimal SHA-256.`);
}

/**
 * Byte lengths are compared against another record's field. If both sides were allowed to be absent
 * the comparison would hold vacuously, so each side is required to be a positive integer first.
 */
function requiredByteLength(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer byte length.`);
}

function isUtc(value) {
  return typeof value === "string" && UTC.test(value) && new Date(value).toISOString() === value.replace("Z", ".000Z");
}

/** The SHA-256 of the transformation runner as it exists in this repository. */
export function restoreRunnerSha256OnDisk() {
  return createHash("sha256").update(readFileSync(RESTORE_RUNNER_URL)).digest("hex");
}

export function runnerSha256OnDisk() {
  return createHash("sha256").update(readFileSync(RUNNER_URL)).digest("hex");
}

function checkArchivedObject(recorded, expected, name) {
  if (!recorded || typeof recorded !== "object") throw new Error(`The drill must record the restored ${name}.`);
  requiredText(recorded.key, `${name} key`);
  requiredText(recorded.versionId, `${name} versionId`);
  requiredSha256(recorded.sha256, `${name} SHA-256`);
  requiredByteLength(recorded.byteLength, `${name} byte length`);
  requiredByteLength(expected.byteLength, `The archive recovery evidence ${name} byte length`);
  if (recorded.key !== expected.key) throw new Error(`The restored ${name} key does not match the archive recovery evidence.`);
  if (recorded.versionId !== expected.versionId) throw new Error(`The restored ${name} versionId does not match the archive recovery evidence.`);
  if (recorded.byteLength !== expected.byteLength) throw new Error(`The restored ${name} byte length does not match the archive recovery evidence.`);
  if (recorded.sha256 !== expected.sha256) throw new Error(`The restored ${name} SHA-256 does not match the archive recovery evidence.`);
  // The provider's own checksum, cross-checked rather than merely restated.
  requiredText(recorded.checksumCRC64NVME, `${name} CRC64NVME checksum`);
  requiredText(expected.checksumCRC64NVME, `The archive recovery evidence ${name} CRC64NVME checksum`);
  if (recorded.checksumCRC64NVME !== expected.checksumCRC64NVME) throw new Error(`The restored ${name} CRC64NVME checksum does not match the archive recovery evidence.`);
}

/**
 * Checks a recorded raw-archive reproduction result only. It intentionally has no AWS command and no
 * write path, and it reads nothing outside this repository. Byte lengths and checksums are taken from
 * the archive recovery evidence and the production admission record rather than restated here, so the
 * drill cannot drift away from the records it claims to reproduce.
 */
const VERSION_BINDINGS = new Set(["pinned-version-id", "asserted-on-head-and-get"]);

export function validateRawArchiveReproductionDrill(record, { archiveEvidence, admission, runnerSha256 = runnerSha256OnDisk() } = {}) {
  if (!record || typeof record !== "object") throw new Error("The reproduction drill record is missing.");
  if (!archiveEvidence || typeof archiveEvidence !== "object") throw new Error("The federal electoral archive recovery evidence is required.");
  if (!admission || typeof admission !== "object") throw new Error("The federal electoral production admission record is required.");
  if (record.schemaVersion !== SCHEMA_VERSION) throw new Error(`The reproduction drill must be a ${SCHEMA_VERSION} record.`);
  if (record.status !== "passed") throw new Error("The reproduction drill must record a passed status.");
  if (record.operation !== "read-only-reproduction") throw new Error("The reproduction drill must record a read-only reproduction.");
  // How each restored object was bound to its recorded version. A pinned read passes --version-id.
  // An asserted read fetches the current version and requires the VersionId S3 reports on BOTH the
  // head and the get to equal the recorded version, which fails closed where a pinned read would
  // quietly succeed against a superseded object. Either is acceptable; neither may be left implied,
  // and a free-text claim is no longer accepted in place of one of these two values.
  if (!VERSION_BINDINGS.has(record.versionBinding)) throw new Error(`The reproduction drill must record versionBinding as one of: ${[...VERSION_BINDINGS].join(", ")}.`);
  if (record.versionBinding === "asserted-on-head-and-get" && record.versionAssertedOnHeadAndGet !== true) throw new Error("A drill bound by assertion must record versionAssertedOnHeadAndGet as true, proven on both the head and the get.");
  // versionAssertedOnHeadAndGet is asserted by the record, not proven to this checker: the runner
  // derives it honestly but into a temporary file that the drill deletes. Binding the restore script
  // by SHA-256 is what gives that boolean any weight, because it pins WHICH script produced the run
  // and that script's assertions are reviewable. Without this the boolean certifies nothing.
  requiredText(record.restoreRunnerPath, "Restore runner path");
  if (record.restoreRunnerPath !== RESTORE_RUNNER_RELATIVE_PATH) throw new Error(`The reproduction drill must name ${RESTORE_RUNNER_RELATIVE_PATH} as its restore runner.`);
  requiredSha256(record.restoreRunnerSha256, "Restore runner SHA-256");
  if (record.restoreRunnerSha256 !== restoreRunnerSha256OnDisk()) throw new Error("The recorded restore runner SHA-256 does not match the restore runner in this repository.");
  // The credential actually used. The read-only verifier role cannot read this prefix, so the run
  // needs a role that also holds write permission; that fact belongs in the record, not only in prose.
  requiredText(record.assumedRole, "Assumed role");
  requiredText(record.nonMutationStatement, "Non-mutation statement");
  if (!isUtc(record.startedAt) || !isUtc(record.completedAt)) throw new Error("The reproduction drill must record whole-second UTC start and completion timestamps.");
  if (new Date(record.completedAt) < new Date(record.startedAt)) throw new Error("The reproduction drill cannot complete before it started.");

  const tools = record.tools;
  if (!tools || typeof tools !== "object") throw new Error("The reproduction drill must pin its tool versions.");
  requiredText(tools.awsCli, "Pinned aws CLI version");
  requiredText(tools.gdal, "Pinned GDAL version");
  requiredText(tools.node, "Pinned node version");

  if (!Array.isArray(record.awsOperations) || record.awsOperations.length === 0) throw new Error("The reproduction drill must name every AWS operation it used.");
  for (const operation of record.awsOperations) {
    requiredText(operation, "AWS operation");
    if (MUTATION.test(operation)) throw new Error(`The reproduction drill named a mutating AWS operation: ${operation}.`);
    if (!READ_ONLY_OPERATIONS.has(operation)) throw new Error(`The reproduction drill named an AWS operation that is not on the read-only allowlist: ${operation}.`);
  }

  const restored = record.restoredInputs;
  if (!restored || typeof restored !== "object") throw new Error("The reproduction drill must record the restored raw inputs.");
  checkArchivedObject(restored.payload, { key: archiveEvidence.physicalArtifact?.payloadKey, versionId: archiveEvidence.payload?.versionId, byteLength: archiveEvidence.payload?.byteLength, sha256: archiveEvidence.payload?.sha256, checksumCRC64NVME: archiveEvidence.payload?.providerChecksum?.value }, "payload");
  checkArchivedObject(restored.manifest, { key: archiveEvidence.physicalArtifact?.manifestKey, versionId: archiveEvidence.manifest?.versionId, byteLength: archiveEvidence.manifest?.byteLength, sha256: archiveEvidence.manifest?.sha256, checksumCRC64NVME: archiveEvidence.manifest?.providerChecksum?.value }, "manifest");

  const reproduction = record.reproduction;
  if (!reproduction || typeof reproduction !== "object") throw new Error("The reproduction drill must record the reproduction result.");
  if (reproduction.methodVersion !== METHOD_VERSION) throw new Error(`The reproduction drill must use method version ${METHOD_VERSION}.`);
  if (reproduction.methodVersion !== admission.ledgerFields?.transformations?.methodVersion) throw new Error("The reproduced method version does not match the admitted method version.");
  if (reproduction.runnerPath !== RUNNER_RELATIVE_PATH) throw new Error(`The reproduction drill must name ${RUNNER_RELATIVE_PATH} as its runner.`);
  requiredSha256(reproduction.runnerSha256, "Runner SHA-256");
  if (reproduction.runnerSha256 !== runnerSha256) throw new Error("The recorded runner SHA-256 does not match the runner in this repository.");

  const admitted = admission.sharedArtifact;
  if (!admitted || typeof admitted !== "object") throw new Error("The production admission record does not bind an admitted artifact.");
  requiredSha256(admitted.sha256, "Admitted artifact SHA-256");
  requiredSha256(reproduction.outputSha256, "Reproduced output SHA-256");
  if (typeof reproduction.exactByteMatch !== "boolean") throw new Error("exactByteMatch must be a boolean.");
  const matchesAdmitted = reproduction.outputSha256 === admitted.sha256;
  if (reproduction.exactByteMatch !== matchesAdmitted) throw new Error("exactByteMatch must equal the computed comparison of the reproduced SHA-256 against the admitted artifact SHA-256.");
  if (!matchesAdmitted) throw new Error("The reproduced output SHA-256 does not equal the admitted artifact SHA-256.");
  requiredByteLength(reproduction.outputByteLength, "Reproduced output byte length");
  requiredByteLength(admitted.byteLength, "The admitted artifact byte length");
  if (reproduction.outputByteLength !== admitted.byteLength) throw new Error("The reproduced output byte length does not equal the admitted artifact byte length.");

  if (record.temporaryCopyRemoved !== true) throw new Error("The reproduction drill must record that the temporary copy was removed.");
  return record;
}

/** Reads the drill and the two records it is cross-checked against, then validates them together. */
export function checkRawArchiveReproductionDrill(file = DRILL_URL) {
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("The raw-archive reproduction drill has not been executed: data/raw-archive-reproduction-drill.json does not exist. Run the reproduction runbook in docs/RAW_ARCHIVE_REPRODUCIBILITY_SCOPE.md before this check can pass.");
    throw error;
  }
  const archiveEvidence = JSON.parse(readFileSync(ARCHIVE_EVIDENCE_URL, "utf8"));
  const admission = JSON.parse(readFileSync(ADMISSION_URL, "utf8"));
  return validateRawArchiveReproductionDrill(JSON.parse(raw), { archiveEvidence, admission });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const record = checkRawArchiveReproductionDrill();
    console.log(`PASS raw archive reproduction drill: the raw payload, bound to its recorded version by ${record.versionBinding}, reproduced the admitted ${record.reproduction.outputByteLength}-byte artifact byte for byte, and the temporary copy was removed.`);
  } catch (error) {
    console.error(`FAIL raw archive reproduction drill: ${error.message}`);
    process.exitCode = 1;
  }
}
