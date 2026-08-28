#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const DEFAULT_FILE = new URL("../data/site-hosting-capability-probe.json", import.meta.url);

export function validateSiteHostingCapabilityProbe(record) {
  assert.equal(record.schemaVersion, "witness-tree/site-hosting-capability-probe/1");
  assert.equal(record.status, "observed-partial");
  assert.equal(record.site.versionNumber, 8);
  assert.match(record.site.sourceCommitSha, /^[a-f0-9]{40}$/);
  assert.equal(record.site.productionUrl, "https://witness-tree-canada.r7bv67rgkk.chatgpt.site");
  assert.equal(record.requests.length, 3);
  const requests = new Map(record.requests.map((request) => [request.id, request]));
  assert.deepEqual([...requests.keys()].sort(), ["explore-html", "root-html", "static-asset-range"]);
  assert.equal(requests.get("root-html").status, 200);
  assert.equal(requests.get("explore-html").status, 200);
  const range = requests.get("static-asset-range");
  assert.equal(range.requestHeaders.range, "bytes=0-16383");
  assert.equal(range.status, 200);
  assert.equal(range.responseByteLength, 102206);
  assert.equal(range.responseHeaders.contentLength, "102206");
  assert.equal(range.responseHeaders.contentRange, null);
  assert.equal(record.capabilities.staticAssetRangeRequests.state, "not-supported-on-tested-asset");
  assert.match(record.capabilities.staticAssetRangeRequests.pmtilesConsequence, /separate delivery origin/i);
  assert.equal(record.capabilities.contentSecurityPolicy.state, "observed-absent");
  for (const id of ["largestStaticAsset", "availabilityTargetOrStatusPage", "syntheticLoadTestPermission"]) {
    assert.equal(record.capabilities[id].state, "unknown", `${id} must remain unknown`);
  }
  assert.deepEqual(record.claims, { hostFullyCharacterized: false, pmtilesOnSiteApproved: false, externalDeliveryOriginApproved: false, loadTestAuthorized: false, observabilityComplete: false, phase8GateMoved: false });
  assert.equal(JSON.stringify(record).includes(String.fromCodePoint(0x2014)), false, "probe must not contain an em dash");
  return record;
}

export async function checkSiteHostingCapabilityProbe(file = DEFAULT_FILE) {
  return validateSiteHostingCapabilityProbe(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await checkSiteHostingCapabilityProbe();
    console.log("Site hosting capability probe passed.");
  } catch (error) {
    console.error(`Stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
