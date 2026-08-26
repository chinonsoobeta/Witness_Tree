import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateBcVriAccessBlock } from "../scripts/check-bc-vri-access.mjs";

const record = JSON.parse(readFileSync(new URL("../data/bc-vri-access-block.json", import.meta.url), "utf8"));

test("BC current VRI is explicitly blocked and distinct from tenure and cutblock records", () => {
  assert.equal(validateBcVriAccessBlock(record), record);
  assert.equal(record.admission.productionEligible, false);
  assert.equal(record.source.observedAccess.result, "HTTP 404 Not Found");
  assert.equal(record.rights.catalogueLicence, "Access Only");
  assert.equal(record.scope.notEquivalentTo.includes("Forest Tenure Cutblock Polygons (FTA 4.0)"), true);
  assert.equal(record.scope.notEquivalentTo.includes("Forest Tenure Harvesting Authority Polygons"), true);
});

test("BC current VRI gate rejects rights, artifact, scope, and admission drift", () => {
  assert.throws(() => validateBcVriAccessBlock({ ...record, status: "candidate" }), /blocked/);
  assert.throws(() => validateBcVriAccessBlock({ ...record, source: { ...record.source, observedAccess: { ...record.source.observedAccess, result: "HTTP 200 OK" } } }), /access defect/);
  assert.throws(() => validateBcVriAccessBlock({ ...record, rights: { ...record.rights, catalogueLicence: "Open Government Licence - British Columbia" } }), /Access Only/);
  assert.throws(() => validateBcVriAccessBlock({ ...record, scope: { ...record.scope, notEquivalentTo: [] } }), /distinct/);
  assert.throws(() => validateBcVriAccessBlock({ ...record, admission: { ...record.admission, staged: true } }), /staged/);
  assert.throws(() => validateBcVriAccessBlock({ ...record, requestDraft: { ...record.requestDraft, status: "sent" } }), /unsent/);
});
