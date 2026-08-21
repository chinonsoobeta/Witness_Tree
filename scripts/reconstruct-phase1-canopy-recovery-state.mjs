#!/usr/bin/env node
import { chmodSync, lstatSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute } from "node:path";
import { canopyRecovery, validateCanopyRecoveryHeads, validateCanopyRecoveryState } from "./check-phase1-canopy-completion-recovery.mjs";

const fail = (message) => { throw new Error(message); };
const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  if (index < 0 || !args[index + 1]) fail(`missing ${flag}`);
  return args[index + 1];
};
const profile = value("--profile");
const input = value("--state");
const output = value("--output");
if (profile === canopyRecovery.profile) fail("the promotion operator may not reconstruct private version state");
if (![input, output].every(isAbsolute) || input === output) fail("state paths must be distinct absolute paths");
try {
  lstatSync(output);
  fail("output state already exists");
} catch (error) {
  if (error.message === "output state already exists") throw error;
  if (error.code !== "ENOENT") throw error;
}

function ownerFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600) fail("private state must be a regular owner-owned mode-600 file");
}
function awsJson(parameters, label) {
  const run = spawnSync("aws", [...parameters, "--profile", profile, "--output", "json"], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  if (run.error || run.status !== 0) fail(`${label} failed; no private state was written`);
  try { return JSON.parse(run.stdout); } catch { fail(`${label} returned malformed JSON; no private state was written`); }
}
function head(bucket, key, label) {
  return awsJson(["s3api", "head-object", "--bucket", bucket, "--key", key, "--checksum-mode", "ENABLED", "--region", canopyRecovery.region], label);
}

try {
  ownerFile(input);
  const state = JSON.parse(readFileSync(input, "utf8"));
  validateCanopyRecoveryState(state);
  const identity = awsJson(["sts", "get-caller-identity"], "administrator identity read");
  if (identity.Account !== canopyRecovery.account || identity.Arn !== `arn:aws:iam::${canopyRecovery.account}:root`) fail("exact approved account root identity is required");
  const heads = {
    primaryPayload: head(canopyRecovery.primary.bucket, canopyRecovery.primary.payloadKey, "primary payload head"),
    recoveryPayload: head(canopyRecovery.recovery.bucket, canopyRecovery.recovery.payloadKey, "recovery payload head"),
    primarySidecar: head(canopyRecovery.primary.bucket, canopyRecovery.primary.sidecarKey, "primary sidecar head"),
    recoverySidecar: head(canopyRecovery.recovery.bucket, canopyRecovery.recovery.sidecarKey, "recovery sidecar head")
  };
  validateCanopyRecoveryHeads(heads, canopyRecovery);
  const versionRefs = Object.fromEntries(Object.entries(heads).map(([name, result]) => [name, result.VersionId]));
  const next = { ...state, versionRefs };
  validateCanopyRecoveryState(next);
  const temporary = `${output}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    chmodSync(temporary, 0o600);
    const created = statSync(temporary);
    if (created.uid !== process.getuid() || (created.mode & 0o777) !== 0o600) fail("new private state is not owner-owned mode 600");
    renameSync(temporary, output);
  } finally { rmSync(temporary, { force: true }); }
  console.log("Exact read-only primary/recovery heads passed; a new owner-only version-reference state was written without printing provider identifiers.");
} catch (error) {
  console.error(`Stopped: ${error.message}; no S3 or IAM mutation was attempted`);
  process.exitCode = 70;
}
