import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateBcFtaOperationalSources } from "../scripts/check-bc-fta-operational-sources.mjs";

const record = JSON.parse(readFileSync(new URL("../data/bc-fta-operational-sources.json", import.meta.url), "utf8"));

test("BC FTA sources are licensed but blocked until a coherent publisher export exists", () => {
  assert.equal(validateBcFtaOperationalSources(record), record);
  assert.equal(record.licence.id, "ogl-british-columbia");
  assert.equal(record.sources.every((source) => source.productionEligible === false), true);
  assert.equal(record.blocker.rawDownloadPerformed, false);
});

test("BC FTA audit rejects an unsafe paged scrape and any production claim", () => {
  assert.throws(() => validateBcFtaOperationalSources({ ...record, sources: record.sources.map((source) => ({ ...source, serviceObservations: { ...source.serviceObservations, wfsPagingTransactionSafe: true } })) }), /service-safety/);
  assert.throws(() => validateBcFtaOperationalSources({ ...record, blocker: { ...record.blocker, rawDownloadPerformed: true } }), /fail closed/);
  assert.throws(() => validateBcFtaOperationalSources({ ...record, sources: record.sources.map((source) => ({ ...source, productionEligible: true })) }), /non-production/);
});
