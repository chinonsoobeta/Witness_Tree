#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

export const RELEASE_ID = "316af633de6a259554a79f46653481b5876ebed3be749e78b700e4aeeea0ee1f";
const BASE_URL = `https://d3g1406o0uekin.cloudfront.net/releases/phase8-bulk-download-v1/${RELEASE_ID}`;
export const EXPECTED = {
  csv: { id: "phase2-province-loss-2020-2022-csv", kind: "csv-table", licenceIds: ["ogl-canada-2.0", "statcan-open-licence"], publicUrl: `${BASE_URL}/downloads/phase2-province-loss-2020-2022.csv`, sha256: "a11fe16f3b6872b8928b13fc0eb62e19a7c8d1f6131f94eceffe76d89f23b1dd", byteLength: 1786, contentType: "text/csv; charset=utf-8" },
  geopackage: { id: "phase2-province-loss-2020-2022-geopackage", kind: "event-record-geopackage-metadata", licenceIds: ["ogl-canada-2.0", "statcan-open-licence"], publicUrl: `${BASE_URL}/downloads/phase2-province-loss-2020-2022.gpkg`, sha256: "d5d8bb2b3eb92145277ffe5cf06387fd4d9705997c1b808c5975ec86e4db2b7a", byteLength: 303104, contentType: "application/geopackage+sqlite3" },
  manifest: { id: "phase8-bulk-download-public-manifest", kind: "release-manifest", licenceIds: ["ogl-canada-2.0", "statcan-open-licence"], publicUrl: `${BASE_URL}/manifest.json`, sha256: "0d43fd90f3f8c522e2885922f838e56b6c28fe4e2d1f8f2ab72a15a0a209789d", byteLength: 9811, contentType: "application/json" },
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function retrievePhase8BulkDownloadRelease() {
  const artifacts = {};
  for (const [name, expected] of Object.entries(EXPECTED)) {
    const response = await fetch(expected.publicUrl, { headers: { Origin: "https://witness-tree-canada.r7bv67rgkk.chatgpt.site" } });
    assert.equal(response.status, 200, `${name} public status`);
    assert.equal(response.headers.get("content-type"), expected.contentType, `${name} content type`);
    assert.equal(response.headers.get("access-control-allow-origin"), "*", `${name} CORS`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, expected.byteLength, `${name} byte length`);
    assert.equal(sha256(bytes), expected.sha256, `${name} SHA-256`);
    artifacts[name] = { ...expected, retrievedByteLength: bytes.length, retrievedSha256: sha256(bytes), publicStatus: response.status, accessControlAllowOrigin: "*" };
  }
  return artifacts;
}

export function githubActionsReceipt(artifacts, env = process.env) {
  assert.equal(env.GITHUB_ACTIONS, "true", "durable independent receipt may be written only by GitHub Actions");
  for (const name of ["GITHUB_REPOSITORY", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_SHA", "RUNNER_OS", "RUNNER_ARCH", "GITHUB_WORKFLOW"]) assert.ok(env[name], `${name} is required`);
  return {
    schemaVersion: "witness-tree/phase8-bulk-download-independent-retrieval/1",
    status: "independently-retrieved-and-hashed",
    retrievalContext: "github-hosted-runner-separate-from-producing-machine",
    retrievedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    releaseId: RELEASE_ID,
    repository: env.GITHUB_REPOSITORY,
    workflow: env.GITHUB_WORKFLOW,
    runId: Number(env.GITHUB_RUN_ID),
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
    runUrl: `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    headSha: env.GITHUB_SHA,
    runner: { os: env.RUNNER_OS, arch: env.RUNNER_ARCH },
    artifacts,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outputIndex = process.argv.indexOf("--output");
  if (process.argv.some((value, index) => index > 1 && value !== "--output" && index !== outputIndex + 1)) throw new Error("Usage: check-phase8-bulk-download-independent-retrieval.mjs [--output PATH]");
  const artifacts = await retrievePhase8BulkDownloadRelease();
  if (outputIndex !== -1) {
    const output = process.argv[outputIndex + 1];
    assert.ok(output, "--output requires a path");
    await writeFile(output, `${JSON.stringify(githubActionsReceipt(artifacts), null, 2)}\n`, { flag: "wx", mode: 0o600 });
    console.log(`Independent Phase 8 retrieval receipt written: ${output}`);
  } else {
    console.log(`Phase 8 bulk release live retrieval verified: ${RELEASE_ID}; three exact public objects matched.`);
  }
}
