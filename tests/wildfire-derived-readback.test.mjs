import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  approvalTemplate,
  DEFAULT_DATA_ROOT,
  validateApproval,
  validateLocalArtifacts,
  validateReadback
} from "../scripts/check-wildfire-derived-readback.mjs";

const runnerPath = new URL("../scripts/run-wildfire-derived-readback.sh", import.meta.url).pathname;

function head(bytes, version) {
  return { VersionId: version, ContentLength: bytes, ChecksumType: "FULL_OBJECT", ChecksumCRC64NVME: "AAAAAAAAAAA=" };
}

function retention() {
  return { Retention: { Mode: "COMPLIANCE", RetainUntilDate: "2033-08-12T00:00:00Z" } };
}

function readback() {
  const approval = approvalTemplate();
  const [bc, ontario] = approval.artifacts;
  return {
    [bc.id]: { payload: head(bc.byteLength, "bc-payload-version"), manifest: head(bc.manifestByteLength, "bc-manifest-version"), retention: retention(), manifestRetention: retention() },
    [ontario.id]: { payload: head(ontario.byteLength, "ontario-payload-version"), manifest: head(ontario.manifestByteLength, "ontario-manifest-version"), retention: retention(), manifestRetention: retention() }
  };
}

test("approval, local artifacts, exact heads, and payload retention validate", () => {
  const approval = approvalTemplate();
  validateApproval(approval);
  validateLocalArtifacts(DEFAULT_DATA_ROOT);
  validateReadback(approval, readback());
});

test("readback rejects a missing concrete version and wrong retention", () => {
  const approval = approvalTemplate();
  const missingVersion = readback();
  delete missingVersion[approval.artifacts[0].id].payload.VersionId;
  assert.throws(() => validateReadback(approval, missingVersion), /concrete version/);
  const wrongRetention = readback();
  wrongRetention[approval.artifacts[1].id].retention.Retention.RetainUntilDate = "2034-08-12T00:00:00Z";
  assert.throws(() => validateReadback(approval, wrongRetention), /retention date/);
});

function writeApproval(dir) {
  const path = join(dir, "approval.json");
  writeFileSync(path, `${JSON.stringify(approvalTemplate())}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

function writeFakeAws(dir, { retentionFailure = false, headFailure = false } = {}) {
  const marker = join(dir, "aws-calls");
  const script = [
    "#!/bin/zsh",
    "print -r -- \"$*\" >> __MARKER__",
    "case \"$1:$2\" in",
    "  configure:get) print -r -- \"arn:aws:iam::286853118812:mfa/witness-tree/archive-operator.device\" ;;",
    "  sts:assume-role) print -r -- \"{\\\"Credentials\\\":{\\\"AccessKeyId\\\":\\\"test-access\\\",\\\"SecretAccessKey\\\":\\\"test-secret\\\",\\\"SessionToken\\\":\\\"test-session\\\"},\\\"AssumedRoleUser\\\":{\\\"Arn\\\":\\\"arn:aws:sts::286853118812:assumed-role/WitnessTreeWildfireDerivedPromotionUploader/test\\\"}}\" ;;",
    "  sts:get-caller-identity) print -r -- \"{\\\"Account\\\":\\\"286853118812\\\",\\\"Arn\\\":\\\"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator\\\"}\" ;;",
    "  s3api:head-object)",
    headFailure
      ? "    print -u2 -- \"head unavailable\"; exit 1 ;;"
      : [
        "    if [[ \"$*\" == *manifest.json* && \"$*\" == *bc-wildfire* ]]; then",
        "      print -r -- \"{\\\"VersionId\\\":\\\"bc-sidecar-version\\\",\\\"ContentLength\\\":831,\\\"ChecksumType\\\":\\\"FULL_OBJECT\\\",\\\"ChecksumCRC64NVME\\\":\\\"AAAAAAAAAAA=\\\"}\"",
        "    elif [[ \"$*\" == *manifest.json* ]]; then",
        "      print -r -- \"{\\\"VersionId\\\":\\\"ontario-sidecar-version\\\",\\\"ContentLength\\\":885,\\\"ChecksumType\\\":\\\"FULL_OBJECT\\\",\\\"ChecksumCRC64NVME\\\":\\\"AAAAAAAAAAA=\\\"}\"",
        "    elif [[ \"$*\" == *bc-wildfire-216-feature-release.gpkg* ]]; then",
        "      print -r -- \"{\\\"VersionId\\\":\\\"bc-payload-version\\\",\\\"ContentLength\\\":2162688,\\\"ChecksumType\\\":\\\"FULL_OBJECT\\\",\\\"ChecksumCRC64NVME\\\":\\\"AAAAAAAAAAA=\\\"}\"",
        "    else",
        "      print -r -- \"{\\\"VersionId\\\":\\\"ontario-payload-version\\\",\\\"ContentLength\\\":7913472,\\\"ChecksumType\\\":\\\"FULL_OBJECT\\\",\\\"ChecksumCRC64NVME\\\":\\\"AAAAAAAAAAA=\\\"}\"",
        "    fi",
        "    ;;"
      ].join("\n"),
    "  s3api:get-object-retention)",
    retentionFailure ? "    print -u2 -- \"retention unavailable\"; exit 1 ;;" : "    print -r -- \"{\\\"Retention\\\":{\\\"Mode\\\":\\\"COMPLIANCE\\\",\\\"RetainUntilDate\\\":\\\"2033-08-12T00:00:00Z\\\"}}\" ;;",
    "  *) print -u2 -- \"unexpected AWS operation\"; exit 99 ;;",
    "esac",
    ""
  ].join("\n").replaceAll("__MARKER__", JSON.stringify(marker));
  const awsPath = join(dir, "aws");
  writeFileSync(awsPath, script, { mode: 0o700 });
  chmodSync(awsPath, 0o700);
  return { marker, awsPath };
}

function runPty(args, dir) {
  const program = [
    "set timeout 60",
    "spawn -noecho zsh " + JSON.stringify(runnerPath) + " " + args.map(JSON.stringify).join(" "),
    "expect {",
    "  \"Current MFA TOTP (not stored):\" { send -- \"123456\\r\"; exp_continue }",
    "  eof { set result [wait]; exit [lindex $result 3] }",
    "  timeout { exit 2 }",
    "}"
  ].join("\n");
  return spawnSync("expect", ["-c", program], {
    encoding: "utf8",
    timeout: 90_000,
    env: { ...process.env, PATH: dir + ":" + process.env.PATH, WITNESS_TREE_DATA_ROOT: DEFAULT_DATA_ROOT }
  });
}

test("preflight validates local scope without TOTP or AWS", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-derived-readback-preflight-"));
  try {
    const approval = writeApproval(dir);
    const fake = writeFakeAws(dir);
    const run = spawnSync("zsh", [runnerPath, "--preflight", approval], { encoding: "utf8", env: { ...process.env, PATH: dir + ":" + process.env.PATH, WITNESS_TREE_DATA_ROOT: DEFAULT_DATA_ROOT } });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /PRECHECK passed/);
    assert.doesNotMatch(run.stdout + run.stderr, /123456/);
    assert.equal(existsSync(fake.marker), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("interactive readback uses only exact versioned heads and retention reads", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-derived-readback-success-"));
  try {
    const approval = writeApproval(dir);
    const fake = writeFakeAws(dir);
    const run = runPty(["--readback", approval], dir);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /exact BC\/Ontario payload, manifest/);
    assert.doesNotMatch(run.stdout + run.stderr, /123456|payload-version|sidecar-version/);
    const calls = readFileSync(fake.marker, "utf8").trim().split("\n");
    assert.equal(calls.filter((call) => call.includes("head-object")).length, 8);
    const roleCall = calls.find((call) => call.includes("sts assume-role"));
    assert.match(roleCall, /--serial-number arn:aws:iam::286853118812:mfa\/witness-tree\/archive-operator\.device/);
    assert.match(roleCall, /--token-code 123456/);
    assert.equal(calls.filter((call) => call.includes("get-object-retention")).length, 4);
    const heads = calls.filter((call) => call.includes("head-object"));
    assert.ok(heads.length === 8 && heads.every((call, index) => index % 2 === 0 || call.includes("--version-id")));
    assert.ok(calls.every((call) => !/^s3api (list-objects|put-object|upload-part|complete-multipart|delete-object|put-object-retention|put-object-legal-hold|put-object-retention|bypass-governance)/i.test(call)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an exact-head failure stops before versioned heads or retention", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-derived-readback-head-negative-"));
  try {
    const approval = writeApproval(dir);
    const fake = writeFakeAws(dir, { headFailure: true });
    const run = runPty(["--readback", approval], dir);
    assert.equal(run.status, 70, run.stdout + run.stderr);
    assert.match(run.stdout + run.stderr, /Exact derived object head failed/);
    const calls = readFileSync(fake.marker, "utf8").trim().split("\n");
    assert.equal(calls.filter((call) => call.includes("head-object")).length, 1);
    assert.equal(calls.filter((call) => call.includes("--version-id")).length, 0);
    assert.equal(calls.filter((call) => call.includes("get-object-retention")).length, 0);
    assert.ok(calls.every((call) => !/^s3api (put-object|upload-part|complete-multipart|delete-object|put-object-retention|put-object-legal-hold|bypass-governance)/i.test(call)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("interactive readback fails closed when retention cannot be read", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-derived-readback-retention-negative-"));
  try {
    const approval = writeApproval(dir);
    const fake = writeFakeAws(dir, { retentionFailure: true });
    const run = runPty(["--readback", approval], dir);
    assert.equal(run.status, 70, run.stdout + run.stderr);
    assert.match(run.stdout + run.stderr, /retention read failed/);
    const calls = readFileSync(fake.marker, "utf8").trim().split("\n");
    assert.equal(calls.filter((call) => call.includes("get-object-retention")).length, 1);
    assert.ok(calls.every((call) => !/^s3api (put-object|upload-part|complete-multipart|delete-object|put-object-retention|put-object-legal-hold|bypass-governance)/i.test(call)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
