import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { checkSiteHostingCapabilityProbe, validateSiteHostingCapabilityProbe } from "../scripts/check-site-hosting-capability-probe.mjs";

const file = new URL("../data/site-hosting-capability-probe.json", import.meta.url);

test("the live Sites probe preserves observed range failure and unanswered capabilities", async () => {
  const record = await checkSiteHostingCapabilityProbe(file);
  assert.equal(record.capabilities.staticAssetRangeRequests.state, "not-supported-on-tested-asset");
  assert.equal(record.capabilities.largestStaticAsset.state, "unknown");
  assert.equal(record.claims.phase8GateMoved, false);
});

test("the probe cannot promote unknowns or a full-host claim", async () => {
  const source = JSON.parse(await readFile(file, "utf8"));
  for (const mutate of [
    (record) => { record.capabilities.syntheticLoadTestPermission.state = "authorized"; },
    (record) => { record.claims.pmtilesOnSiteApproved = true; },
    (record) => { record.claims.observabilityComplete = true; },
    (record) => { record.requests[2].status = 206; },
  ]) {
    const record = structuredClone(source);
    mutate(record);
    assert.throws(() => validateSiteHostingCapabilityProbe(record));
  }
});
