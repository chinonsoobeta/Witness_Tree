import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { provinceSpanRelease } from "../lib/downloads/releases";

const record = JSON.parse(readFileSync("data/phase3-province-span-downloads-release.json", "utf8"));
const readback = JSON.parse(readFileSync("data/phase3-province-span-downloads-release-readback.json", "utf8"));

test("the Data page links exactly the bytes the release record read back", () => {
  assert.equal(provinceSpanRelease.id, record.releaseId);
  assert.equal(provinceSpanRelease.rowCount, record.rowCount);
  assert.equal(provinceSpanRelease.manifestUrl, record.manifest.url);
  for (const [key, name] of [["csv", "province-spans-1984-2022.csv"], ["json", "province-spans-1984-2022.json"]] as const) {
    const file = record.files.find((entry: { name: string }) => entry.name === name);
    assert.equal(provinceSpanRelease[key].url, file.url);
    assert.equal(provinceSpanRelease[key].sha256, file.sha256);
    const served = readback.cloudFrontExactReadback.files.find((entry: { name: string }) => entry.name === name);
    assert.equal(served.sha256, file.sha256);
    assert.equal(readback.s3ExactReadback.files.find((entry: { name: string }) => entry.name === name).md5ETagMatches, true);
  }
});

test("the release claims no more than the admission allowed", () => {
  assert.equal(record.admission.item, "C-province-span-aggregate");
  assert.deepEqual(record.claims, { ...record.claims, admitted: true, released: true, expertReviewed: false, complete: false, formalGatesChanged: false });
});
