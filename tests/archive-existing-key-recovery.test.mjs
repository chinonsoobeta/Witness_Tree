import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const helper = new URL("../scripts/archive-existing-key-recovery.sh", import.meta.url).pathname;
const payload = "approved fixture payload\n";
const manifest = '{"fixture":"deterministic"}\n';
const sha = "ac6e474fa8c4524e8d635caf9da451f092f75a2dca22b00a3c0d26aace91c4e2";

function mockedAws(dir, mode) {
  const marker = join(dir, "calls");
  const script = `#!/bin/zsh
print -r -- "$*" >> ${JSON.stringify(marker)}
key=""; version=""; out=""
for ((i=1; i <= $#; i++)); do
  [[ "${'$'}{argv[$i]}" == "--key" ]] && key="${'$'}{argv[$((i+1))]}"
  [[ "${'$'}{argv[$i]}" == "--version-id" ]] && version="${'$'}{argv[$((i+1))]}"
done
case "$1:$2" in
  s3api:head-object)
    if [[ "$key" == payload ]]; then print -- '{"VersionId":"payload-v1","ContentLength":25,"ChecksumType":"FULL_OBJECT","ChecksumCRC64NVME":"AAAAAAAAAAA="}'
    else print -- '{"VersionId":"manifest-v1","ContentLength":28,"ChecksumType":"FULL_OBJECT","ChecksumCRC64NVME":"AAAAAAAAAAA="}'; fi ;;
  s3api:get-object)
    out="${'$'}{argv[-1]}"; if [[ "$key" == payload ]]; then ${mode === "mismatch" ? "print -n -- wrong > \"$out\"" : `print -n -- ${JSON.stringify(payload)} > "$out"`}; else print -n -- ${JSON.stringify(manifest)} > "$out"; fi; print -- '{}' ;;
  s3api:get-object-retention)
    if [[ ${JSON.stringify(mode)} == missing && ! -f ${JSON.stringify(join(dir, "retention-called"))} ]]; then print -u2 -- NoSuchObjectLockConfiguration; exit 255; fi
    if [[ ${JSON.stringify(mode)} == ambiguous ]]; then print -u2 -- AccessDenied; exit 255; fi
    print -- '{"Retention":{"Mode":"COMPLIANCE","RetainUntilDate":"2033-08-12T00:00:00Z"}}' ;;
  s3api:put-object-retention) touch ${JSON.stringify(join(dir, "retention-called"))}; print -- '{}' ;;
  s3api:put-object) print -u2 -- unexpected-put; exit 91 ;;
  *) print -u2 -- unexpected; exit 99 ;;
esac
`;
  writeFileSync(join(dir, "aws"), script, { mode: 0o700 });
  return marker;
}

function runHelper(mode, body) {
  const dir = mkdtempSync(join(tmpdir(), "archive-existing-key-"));
  const marker = mockedAws(dir, mode);
  const expected = join(dir, "manifest.json"); writeFileSync(expected, manifest);
  const command = `set -euo pipefail
TMP=${JSON.stringify(dir)}; BUCKET=test; REGION=ca-central-1; RETAIN_UNTIL=2033-08-12T00:00:00Z
fail() { print -u2 -- "FAIL:$1"; exit "${'$'}{2:-1}"; }
source ${JSON.stringify(helper)}
${body.replaceAll("$EXPECTED", JSON.stringify(expected))}`;
  const result = spawnSync("zsh", ["-c", command], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
  const calls = existsSync(marker) ? readFileSync(marker, "utf8") : "";
  rmSync(dir, { recursive: true, force: true });
  return { ...result, calls };
}

test("existing exact payload and manifest are downloaded, version-verified, and never rewritten", () => {
  const run = runHelper("complete", `
wt_archive_head_current_or_absent payload payload; pv="$WT_ARCHIVE_VERSION"
wt_archive_head_current_or_absent manifest manifest; mv="$WT_ARCHIVE_VERSION"
wt_archive_verify_existing_payload payload "$pv" 25 ${sha} payload
wt_archive_verify_existing_manifest manifest "$mv" $EXPECTED manifest
wt_archive_ensure_compliance_retention payload "$pv" payload
wt_archive_ensure_compliance_retention manifest "$mv" manifest
`);
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.calls, /head-object --bucket test --key payload --checksum-mode ENABLED/, `${run.stdout}\n${run.stderr}`);
  assert.match(run.calls, /head-object --bucket test --key payload --version-id payload-v1/);
  assert.match(run.calls, /get-object --bucket test --key payload --version-id payload-v1/);
  assert.match(run.calls, /get-object --bucket test --key manifest --version-id manifest-v1/);
  assert.doesNotMatch(run.calls, /put-object(?: |$)/);
  assert.doesNotMatch(run.calls, /put-object-retention/);
});

test("existing payload SHA mismatch stops before retention or any write", () => {
  const run = runHelper("mismatch", `wt_archive_verify_existing_payload payload payload-v1 25 ${sha} payload`);
  assert.equal(run.status, 73, `${run.stdout}\n${run.stderr}`);
  assert.match(`${run.stdout}${run.stderr}`, /bytes do not match the approved SHA-256/);
  assert.doesNotMatch(run.calls, /put-object(?:-retention)?(?: |$)/);
});

test("only an exact missing-retention diagnostic permits a version-specific retention repair", () => {
  const run = runHelper("missing", `wt_archive_ensure_compliance_retention payload payload-v1 payload`);
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.calls, /put-object-retention --bucket test --key payload --version-id payload-v1/);
  assert.doesNotMatch(run.calls, /put-object --bucket/);
});

test("unrecognized retention error stops before mutation", () => {
  const run = runHelper("ambiguous", `wt_archive_ensure_compliance_retention payload payload-v1 payload`);
  assert.equal(run.status, 73, `${run.stdout}\n${run.stderr}`);
  assert.match(`${run.stdout}${run.stderr}`, /Could not read existing payload retention/);
  assert.doesNotMatch(run.calls, /put-object(?:-retention)?(?: |$)/);
});
