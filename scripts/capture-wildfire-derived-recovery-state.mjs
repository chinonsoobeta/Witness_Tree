import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import {
  ACCOUNT,
  BUCKET,
  RECOVERY_STATE_MAX_AGE_SECONDS,
  REGION,
  expectedObjects,
  stateTemplate,
  validateState
} from "./check-wildfire-derived-recovery.mjs";

const PROFILE = "default";
const ROOT_ARN = `arn:aws:iam::${ACCOUNT}:root`;
const VALID_CRC64 = /^[A-Za-z0-9+/]{11}=$/;
const VALID_VERSION = /^[^\s]{1,1024}$/;

function fail(message) {
  throw new Error(message);
}

function awsJson(args) {
  const env = { ...process.env, AWS_PAGER: "" };
  for (const name of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE", "AWS_DEFAULT_PROFILE"]) delete env[name];
  const result = spawnSync("aws", [...args, "--profile", PROFILE, "--output", "json"], {
    encoding: "utf8",
    timeout: 60_000,
    env
  });
  if (result.error || result.status !== 0) return { ok: false, stderr: result.stderr ?? "", stdout: result.stdout ?? "" };
  try {
    return { ok: true, value: JSON.parse(result.stdout) };
  } catch {
    return { ok: false, stderr: "invalid provider JSON", stdout: result.stdout ?? "" };
  }
}

function exactHead(key, versionId = null) {
  const args = ["s3api", "head-object", "--bucket", BUCKET, "--key", key, "--checksum-mode", "ENABLED", "--region", REGION];
  if (versionId) args.push("--version-id", versionId);
  const result = awsJson(args);
  if (!result.ok) fail("root/default exact BC payload head failed; no private state was written");
  const head = result.value;
  assert.equal(Number.isSafeInteger(head?.ContentLength), true, "exact head bytes are absent");
  assert.equal(head.ChecksumType, "FULL_OBJECT", "exact head checksum type is not FULL_OBJECT");
  assert.equal(VALID_CRC64.test(head.ChecksumCRC64NVME ?? ""), true, "exact head CRC64NVME is absent");
  assert.equal(VALID_VERSION.test(head.VersionId ?? ""), true, "exact head concrete version is absent");
  return head;
}

function proveAbsent(key) {
  const args = ["s3api", "head-object", "--bucket", BUCKET, "--key", key, "--checksum-mode", "ENABLED", "--region", REGION];
  const result = awsJson(args);
  if (result.ok) fail("an approved recovery target already exists; no private state was written");
  if (!/(404|NotFound|NoSuchKey|does not exist)/i.test(result.stderr)) fail("root/default absence proof was ambiguous; no private state was written");
  return { key, operation: "head-object", profile: PROFILE, status: "absent-head-404" };
}

function writePrivateState(path, state) {
  assert.equal(isAbsolute(path), true, "state path must be absolute");
  assert.equal(existsSync(path), false, "private state path already exists; refusing overwrite");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
  assert.equal((statSync(path).mode & 0o777), 0o600, "private state is not mode 600");
}

function main() {
  const args = process.argv.slice(2);
  assert.equal(args.length, 2, "usage");
  assert.equal(args[0], "--state", "usage");
  const statePath = args[1];
  assert.equal(isAbsolute(statePath), true, "state path must be absolute");

  const identity = awsJson(["sts", "get-caller-identity"]);
  assert.equal(identity.ok, true, "root/default identity could not be verified");
  assert.equal(identity.value?.Account, ACCOUNT, "root/default identity is outside the approved account");
  assert.equal(identity.value?.Arn, ROOT_ARN, "root/default identity is not the approved account root");

  const objects = expectedObjects();
  const latest = exactHead(objects.bcPayload.key);
  assert.equal(latest.ContentLength, objects.bcPayload.byteLength, "BC payload byte length is not exact");
  const concrete = exactHead(objects.bcPayload.key, latest.VersionId);
  assert.equal(concrete.VersionId, latest.VersionId, "BC payload concrete version changed between heads");
  assert.equal(concrete.ContentLength, latest.ContentLength, "BC payload bytes changed between heads");
  assert.equal(concrete.ChecksumType, latest.ChecksumType, "BC payload checksum type changed between heads");
  assert.equal(concrete.ChecksumCRC64NVME, latest.ChecksumCRC64NVME, "BC payload checksum changed between heads");

  const absenceProof = [objects.bcManifest.key, objects.ontarioPayload.key, objects.ontarioManifest.key].map(proveAbsent);
  const capturedAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(capturedAt) + RECOVERY_STATE_MAX_AGE_SECONDS * 1000).toISOString();
  const state = stateTemplate();
  state.capturedAt = capturedAt;
  state.expiresAt = expiresAt;
  state.absenceProof = absenceProof;
  state.bcPayload = {
    key: objects.bcPayload.key,
    versionId: concrete.VersionId,
    byteLength: concrete.ContentLength,
    checksumType: concrete.ChecksumType,
    checksumCRC64NVME: concrete.ChecksumCRC64NVME
  };
  validateState(state);
  writePrivateState(statePath, state);
  console.log("Root/default exact recovery state written owner-only mode 600; opaque identifiers were not printed.");
}

try {
  main();
} catch {
  console.error("Root/default recovery state capture failed closed; no recovery mutation was attempted.");
  process.exitCode = 65;
}
