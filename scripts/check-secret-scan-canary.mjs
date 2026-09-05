/*
 * Proves that `.gitleaks.toml` still reports credentials.
 *
 * The config quiets one entropy heuristic on two shapes this repository stores
 * by the thousand, which is the kind of change that can quietly turn a secret
 * scan into a no-op. So the scan is run once more against a directory of
 * planted credentials and required to report every one of them, while the two
 * allowlisted shapes in the same file stay quiet.
 *
 * The planted values are assembled from fragments at run time. Nothing in this
 * file is itself credential-shaped, so the repository scan has nothing to find
 * here.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));

/** Credential shapes that must still be reported, built so no literal appears in this source. */
export const PLANTED = {
  awsAccessKey: ["AKIA", "Z4TVQ", "6RJH", "2XMPL", "QN"].join(""),
  githubToken: ["ghp", "_", "0f4Ka", "9LmR2", "tYb7Q", "sVd1X", "eNc6H", "jU3pZ", "wG8"].join(""),
  stripeKey: ["sk", "_live_", "51Hq", "8ZaTb", "3nWkP", "vXr7Ld", "0Ej2"].join(""),
  slackToken: ["xoxb", "-", "2417", "8309", "5561", "-", "9024", "7716", "3388", "-", "hR2vQ", "9dLxK", "s4Tn7", "bWmZ"].join(""),
};

/** Shapes the config deliberately clears. Neither may be reported. */
export const ALLOWED = {
  evidenceDigest: createHash("sha256").update("witness-tree-secret-scan-canary").digest("hex"),
  datasetIdentifier: "federal-electoral-districts-2025-shp",
};

export function canaryFileContents() {
  return [
    `aws_secret_key = "${PLANTED.awsAccessKey}"`,
    `github_api_key = "${PLANTED.githubToken}"`,
    `stripe_api_key = "${PLANTED.stripeKey}"`,
    `slack_api_key = "${PLANTED.slackToken}"`,
    `"scripts/archive-existing-key-recovery.sh": "${ALLOWED.evidenceDigest}"`,
    `"remoteKeyVersion": "${ALLOWED.datasetIdentifier}"`,
    "",
  ].join("\n");
}

export function classifyFindings(findings, contents) {
  const secrets = new Set(findings.map((finding) => finding.Secret));
  const missed = Object.entries(PLANTED).filter(([, value]) => ![...secrets].some((secret) => secret.includes(value)));
  const cleared = Object.entries(ALLOWED).filter(([, value]) => [...secrets].some((secret) => secret.includes(value)));
  assert.equal(missed.length, 0, `The secret scan no longer reports planted credentials: ${missed.map(([name]) => name).join(", ")}`);
  assert.equal(cleared.length, 0, `The allowlist is not being applied: ${cleared.map(([name]) => name).join(", ")}`);
  for (const value of Object.values({ ...PLANTED, ...ALLOWED })) assert.ok(contents.includes(value), "The canary file lost a planted value");
  return { status: "passed", planted: Object.keys(PLANTED).length, allowlisted: Object.keys(ALLOWED).length, reported: findings.length, externalReview: false };
}

export function runCanary(binary) {
  const directory = mkdtempSync(path.join(tmpdir(), "secret-scan-canary-"));
  try {
    const contents = canaryFileContents();
    writeFileSync(path.join(directory, "planted.txt"), contents, { mode: 0o600 });
    const report = path.join(directory, "report.json");
    /* Redaction is off here on purpose: the planted values are fabricated, and the
     * report never leaves this temporary directory, which is removed below. */
    const scan = spawnSync(binary, ["dir", "--config", path.join(REPO, ".gitleaks.toml"), "--no-banner", "--exit-code", "1", "--report-format", "json", "--report-path", report, directory], { encoding: "utf8" });
    assert.equal(scan.error, undefined, `Could not run the secret scanner: ${scan.error?.message}`);
    assert.ok(scan.status === 0 || scan.status === 1, `The secret scanner exited ${scan.status}: ${scan.stderr}`);
    return classifyFindings(JSON.parse(readFileSync(report, "utf8")), contents);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, "Usage: check-secret-scan-canary.mjs <gitleaks-binary>");
  console.log(JSON.stringify(runCanary(process.argv[2])));
}
