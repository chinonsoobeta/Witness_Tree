import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateAcquisitionReadiness } from "../scripts/check-acquisition-readiness.mjs";

const registry = JSON.parse(readFileSync(new URL("../data/acquisition-readiness.json", import.meta.url), "utf8"));
const first = registry.sources[0];
const alberta = registry.sources.find((source) => source.id === "alberta-avi-crown");

test("audited acquisition metadata is exact and remains blocked", () => {
  assert.equal(validateAcquisitionReadiness(registry), registry);
  assert.equal(registry.sources.every((source) => source.productionEligible === false), true);
  assert.equal(registry.sources.every((source) => source.storageReviewed === false && source.computeReviewed === false && source.checksumPlanReviewed === false && source.attributionReviewed === false && source.sourceSelected === false), true);
  assert.equal(registry.sources.filter((source) => source.head).reduce((total, source) => total + source.head.contentLengthBytes, 0), 72325455437);
  assert.deepEqual(alberta?.unresolvedFields, ["Attribution", "Source version", "Checksum", "Archive", "Storage", "Compute"]);
  assert.equal(alberta?.head.lastModified, "2022-03-24T19:21:24Z");
  const ontario = registry.sources.find((source) => source.id === "ontario-fri-term-2-2018-2028");
  assert.equal(ontario?.kind, "discovery-blocked");
  assert.equal("head" in ontario, false);
  assert.equal("url" in ontario, false);
});

test("readiness gate rejects changed audited totals, unsafe URLs, and missing HEAD dates", () => {
  assert.throws(() => validateAcquisitionReadiness({ ...registry, sources: [{ ...first, head: { ...first.head, contentLengthBytes: 1 } }, ...registry.sources.slice(1)] }), /audited total/);
  assert.throws(() => validateAcquisitionReadiness({ ...registry, sources: [{ ...first, urlTemplate: "http://opendata.nfis.org/file.zip" }, ...registry.sources.slice(1)] }), /HTTPS/);
  assert.throws(() => validateAcquisitionReadiness({ ...registry, sources: [{ ...first, head: { ...first.head, observedOn: "2026-13-11" } }, ...registry.sources.slice(1)] }), /ISO date/);
  assert.throws(() => validateAcquisitionReadiness({ ...registry, sources: [{ ...first, head: { ...first.head, contentLengthBytes: Number.MAX_SAFE_INTEGER + 1 } }, ...registry.sources.slice(1)] }), /positive safe integer/);
  assert.throws(() => validateAcquisitionReadiness({ ...registry, sources: [{ ...first, sourceVersion: "Version 3" }, ...registry.sources.slice(1)] }), /audited fact/);
  assert.throws(() => validateAcquisitionReadiness({ ...registry, sources: registry.sources.map((source) => source.id === "ontario-fri-term-2-2018-2028" ? { ...source, url: "https://data.ontario.ca/download.csv" } : source) }), /Discovery records/);
});

test("readiness gate rejects resolved uncertainty, premature eligibility, and non-HEAD lineage", () => {
  assert.throws(() => validateAcquisitionReadiness({ ...registry, sources: [{ ...first, unresolvedFields: [] }, ...registry.sources.slice(1)] }), /Unresolved fields/);
  assert.throws(() => validateAcquisitionReadiness({ ...registry, sources: [{ ...first, productionEligible: true }, ...registry.sources.slice(1)] }), /production ineligible/);
  assert.throws(() => validateAcquisitionReadiness({ ...registry, sources: [{ ...first, retrievedAt: "2026-08-11" }, ...registry.sources.slice(1)] }), /HEAD observations only/);
  assert.throws(() => validateAcquisitionReadiness({ ...registry, sources: [{ ...first, checksumSha256: "a".repeat(64) }, ...registry.sources.slice(1)] }), /HEAD observations only/);
  assert.throws(() => validateAcquisitionReadiness({ ...registry, sources: [{ ...first, ingestionState: "complete" }, ...registry.sources.slice(1)] }), /HEAD observations only/);
  assert.throws(() => validateAcquisitionReadiness({ ...registry, sources: [{ ...first, storageReviewed: true }, ...registry.sources.slice(1)] }), /storageReviewed.*Storage/);
  assert.throws(() => validateAcquisitionReadiness({ ...registry, sources: [{ ...first, unresolvedFields: first.unresolvedFields.filter((field) => field !== "Storage") }, ...registry.sources.slice(1)] }), /storageReviewed.*Storage/);
});
