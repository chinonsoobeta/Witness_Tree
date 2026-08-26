import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const runners = readdirSync(root).filter((name) => name.endsWith(".sh") && /(?:archive|promotion|readback|recovery|qc)/i.test(name));
export function validateRunnerSource(name, source) {
    assert.doesNotMatch(source, /sts\s+get-session-token|duration-seconds\s+3600/i, `${name} retains a legacy STS design`);
  assert.doesNotMatch(source, /(?:export\s+)?AWS_(?:ACCESS_KEY_ID|SESSION_TOKEN)=[^\n]*(?:\n[\s\S]{0,120})?sts\s+assume-role/i, `${name} chains an assumed session into another role`);
  if (/sts\s+assume-role/i.test(source)) assert.match(source, /--profile[\s\S]*--serial-number[\s\S]*--token-code[\s\S]*--duration-seconds\s+(?:43200|"\$WT_AWS_ROLE_SESSION_SECONDS")/i, `${name} must directly assume from its configured operator profile with MFA for 43200 seconds`);
  return true;
}
export function validateArchiveDirectMfaRunners(files = runners) {
  for (const name of files) {
    validateRunnerSource(name, readFileSync(path.join(root, name), "utf8"));
  }
  const helper = readFileSync(path.join(root, "aws-direct-mfa-role-session.sh"), "utf8");
  assert.match(helper, /sts assume-role[\s\S]*--serial-number[\s\S]*--token-code[\s\S]*--duration-seconds "\$WT_AWS_ROLE_SESSION_SECONDS"/);
  assert.match(helper, /WT_AWS_ROLE_SESSION_SECONDS=43200/);
  return true;
}
if (process.argv[1]?.endsWith("check-archive-direct-mfa-runners.mjs")) { validateArchiveDirectMfaRunners(); console.log(`Archive direct-MFA runner gate passed for ${runners.length} shell runners.`); }
