import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DIVERGENCE_PATH, check, validateBcFtenEndpointDivergence } from "../scripts/check-bc-ften-endpoint-divergence.mjs";

const record = () => JSON.parse(readFileSync(new URL(`../${DIVERGENCE_PATH}`, import.meta.url), "utf8"));
const mutated = (change) => { const copy = record(); change(copy); return validateBcFtenEndpointDivergence(copy); };

test("the committed observation is valid and both endpoints reconciled", () => {
  assert.deepEqual(check(), []);
  assert.equal(record().control.held, true);
});

test("the two official BC endpoints disagree on the same feature class", () => {
  const harvest = record().layers.find((layer) => layer.id === "ften-harvest-authority");
  assert.equal(harvest.featureClass, "WHSE_FOREST_TENURE.FTEN_HARVEST_AUTH_POLY_SVW");
  assert.notEqual(harvest.arcgis.total, harvest.wfs.total, "If these ever agree, the block record's reasoning should be revisited rather than this test loosened.");
  assert.equal(harvest.arcgis.definitionExpression, null, "The ArcGIS side is the whole feature class, not a filtered view, so the difference is not a query artifact.");
});

/**
 * The difference runs in both directions: the ArcGIS side carries more PENDING
 * and ACTIVE rows, the WFS side far more RETIRED. A scope filter would take
 * rows away in one direction only. Lifecycle transitions moving one way over
 * time is what produces this shape, which is why neither side can be described
 * as a subset of the other.
 */
test("the difference is not a scope filter, because it runs in both directions", () => {
  const harvest = record().layers.find((layer) => layer.id === "ften-harvest-authority");
  assert.ok(harvest.delta.byStatus.ACTIVE < 0, "ArcGIS reports more ACTIVE.");
  assert.ok(harvest.delta.byStatus.PENDING < 0, "ArcGIS reports more PENDING.");
  assert.ok(harvest.delta.byStatus.RETIRED > 0, "WFS reports more RETIRED.");
});

test("a capped or paged count is refused rather than compared", () => {
  const failures = mutated((copy) => { copy.layers[0].arcgis.byStatus.RETIRED += 1; });
  assert.ok(failures.some((message) => message.includes("lifecycle counts sum to")));
  assert.ok(mutated((copy) => { copy.control.held = false; }).some((message) => message.includes("control did not hold")));
});

test("a filtered ArcGIS view cannot be presented as the feature class", () => {
  const failures = mutated((copy) => { copy.layers[0].arcgis.definitionExpression = "LIFE_CYCLE_STATUS_CODE <> 'RETIRED'"; });
  assert.ok(failures.some((message) => message.includes("definition expression")));
});

test("the record may not claim an edition, a publication, or an authoritative endpoint", () => {
  for (const claim of ["published", "productionEligible", "isEdition", "isSnapshot"]) {
    assert.ok(mutated((copy) => { copy[claim] = true; }).some((message) => message.startsWith(claim)));
  }
  assert.ok(mutated((copy) => { copy.doesNotShow = "The WFS endpoint is the authoritative one."; }).some((message) => message.includes("authority question open")));
});

test("a restated delta that does not equal its own operands is refused", () => {
  assert.ok(mutated((copy) => { copy.layers[0].delta.wfsMinusArcgis = 0; }).some((message) => message.includes("delta does not equal")));
  assert.ok(mutated((copy) => { copy.layers[0].delta.byStatus.RETIRED = 0; }).some((message) => message.includes("RETIRED delta does not equal")));
});
