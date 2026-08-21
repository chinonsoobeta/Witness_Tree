import assert from "node:assert/strict";
import test from "node:test";
import evidence from "../data/phase3-browser-audit-summary.json" with { type: "json" };

const routes = [
  "/en/places/bc-province?view=table", "/fr/lieux/bc-province?view=table",
  "/en/location/lat-p48d000000-lon-n124d000000", "/fr/emplacement/lat-p48d000000-lon-n124d000000",
  "/en/methods", "/fr/methodes", "/en/data", "/fr/donnees", "/en/glossary", "/fr/glossaire",
  "/en/corrections", "/fr/corrections", "/en/search?q=British%20Columbia", "/fr/recherche?q=Colombie-Britannique",
];

test("committed Phase 3 browser evidence remains bounded, complete and internally consistent", () => {
  assert.equal(evidence.schemaVersion, "witness-tree/phase3-browser-audit/1");
  assert.deepEqual([evidence.status, evidence.reviewStatus, evidence.productionEligible], ["example", "unapproved", false]);
  assert.match(evidence.browser.product, /Chrome\//);
  assert.match(evidence.axeVersion, /^4\./);
  assert.deepEqual(evidence.routes.map(({ route }) => route), routes);
  assert.equal(new Set(evidence.routes.map(({ route }) => route)).size, routes.length);
  assert.equal(evidence.summary.routes, routes.length);
  assert.equal(evidence.summary.maxLcpMs, Math.max(...evidence.routes.map(({ lcpMs }) => lcpMs)));
  assert.ok(evidence.summary.maxLcpMs <= evidence.thresholds.lcpMs);
  for (const row of evidence.routes) {
    assert.equal(row.axe.violations.length, 0);
    assert.deepEqual([row.keyboard.firstTab, row.keyboard.skipTarget, row.keyboard.unnamed], ["skip-link", "main", 0]);
    assert.equal(row.landmarks.contentLang, row.locale);
    assert.equal(row.landmarks.unnamed, 0);
    assert.deepEqual([row.forcedColors.active, row.forcedColors.blocked], [true, 0]);
    assert.equal(row.reflow.overflowPixels, 0);
    assert.ok(row.reflow.visualScale >= 1.99);
  }
  assert.deepEqual(evidence.excluded, ["screen-reader output", "human visual review", "field performance", "user-specific browser extensions"]);
});
