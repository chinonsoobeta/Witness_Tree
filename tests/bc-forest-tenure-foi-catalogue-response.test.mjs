import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateBcForestTenureFoiCatalogueResponse } from "../scripts/check-bc-forest-tenure-foi-catalogue-response.mjs";

const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
const record = read("bc-forest-tenure-foi-catalogue-response-2026-08-27");

test("BC FOI catalogue response preserves exact official identities and remains export-blocked", () => {
  assert.equal(validateBcForestTenureFoiCatalogueResponse(record), record);
  assert.equal(record.catalogueReadback.datasets.length, 2);
  assert.equal(record.assessment.directFullProvincePackagePresent, false);
  assert.equal(record.assessment.archiveOrProductionAdmission, false);
  assert.equal(record.request.outboundReplySent, false);
});

test("BC FOI catalogue response rejects identity, provenance, and request-summary drift", () => {
  const cases = [
    ["status", { ...record, status: "resolved" }],
    ["request summary label", { ...record, request: { ...record.request, requestedOutcomeIsSummary: false } }],
    ["separate timestamp condition", { ...record, request: { ...record.request, requestedOutcomeBasis: "Unattributed summary." } }],
    ["response provenance", { ...record, request: { ...record.request, responseProvenance: { ...record.request.responseProvenance, senderDomain: "example.invalid" } } }],
    ["catalogue identity", { ...record, catalogueReadback: { ...record.catalogueReadback, datasets: [{ ...record.catalogueReadback.datasets[0], objectName: "WRONG" }, record.catalogueReadback.datasets[1]] } }],
    ["resource set", { ...record, catalogueReadback: { ...record.catalogueReadback, datasets: [{ ...record.catalogueReadback.datasets[0], resources: ["direct-download"] }, record.catalogueReadback.datasets[1]] } }],
  ];
  for (const [label, candidate] of cases) assert.throws(() => validateBcForestTenureFoiCatalogueResponse(candidate), undefined, label);
});

test("BC FOI catalogue response rejects admission-looking or withdrawal claims", () => {
  for (const field of ["directFullProvincePackagePresent", "coherentTimestampedExtractVerified", "completeRecordCountVerified", "archiveOrProductionAdmission", "withdrawalRecommended"]) {
    const candidate = structuredClone(record);
    candidate.assessment[field] = true;
    assert.throws(() => validateBcForestTenureFoiCatalogueResponse(candidate), undefined, field);
  }
  const reply = structuredClone(record);
  reply.request.outboundReplySent = true;
  assert.throws(() => validateBcForestTenureFoiCatalogueResponse(reply), /reply/i);
});

