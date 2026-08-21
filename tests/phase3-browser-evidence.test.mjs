import assert from "node:assert/strict";
import test from "node:test";
import evidence from "../data/phase3-browser-audit-summary.json" with { type: "json" };
import { validateBrowserEvidence } from "../scripts/audit-phase3-browser.mjs";

const routes = [
  "/en/places/bc-province?view=table", "/fr/lieux/bc-province?view=table",
  "/en/location/lat-p48d000000-lon-n124d000000", "/fr/emplacement/lat-p48d000000-lon-n124d000000",
  "/en/methods", "/fr/methodes", "/en/data", "/fr/donnees", "/en/glossary", "/fr/glossaire",
  "/en/corrections", "/fr/corrections", "/en/search?q=British%20Columbia", "/fr/recherche?q=Colombie-Britannique",
];

test("committed Phase 3 browser evidence remains bounded, complete and internally consistent", () => {
  assert.doesNotThrow(() => validateBrowserEvidence(evidence));
  assert.equal(evidence.schemaVersion, "witness-tree/phase3-browser-audit/2");
  assert.deepEqual([evidence.status, evidence.reviewStatus, evidence.productionEligible], ["example", "unapproved", false]);
  assert.match(evidence.browser.product, /Chrome\//);
  assert.match(evidence.axeVersion, /^4\./);
  assert.deepEqual(evidence.routes.map(({ route }) => route), routes);
  assert.equal(new Set(evidence.routes.map(({ route }) => route)).size, routes.length);
  assert.equal(evidence.summary.routes, routes.length);
  assert.equal(evidence.summary.maxLcpMs, Math.max(...evidence.routes.map(({ lcpMs }) => lcpMs)));
  assert.ok(evidence.summary.maxLcpMs < evidence.thresholds.lcpMsExclusive);
  for (const row of evidence.routes) {
    assert.equal(row.axe.violations.length, 0);
    assert.deepEqual([row.keyboard.firstTab, row.keyboard.skipTarget, row.keyboard.unnamed], ["skip-link", "main", 0]);
    assert.deepEqual([row.keyboard.order, row.keyboard.wrappedOnce, row.keyboard.traversedTabStops], ["complete-dom-order", true, row.keyboard.totalTabStops]);
    assert.equal(row.landmarks.documentLang, row.locale);
    assert.equal(row.landmarks.contentLang, row.locale);
    assert.equal(row.landmarks.unnamed, 0);
    assert.deepEqual([row.forcedColors.active, row.forcedColors.blocked], [true, 0]);
    assert.deepEqual([row.forcedColors.linkFailures, row.forcedColors.evidenceFailures, row.forcedColors.confidenceFailures], [0, 0, 0]);
    assert.equal(row.reflow.overflowPixels, 0);
    assert.deepEqual([row.reflow.viewportWidth, row.reflow.visualScale], [320, 1]);
  }
  assert.deepEqual(evidence.excluded, ["screen-reader output", "human visual review", "human forced-colours and CVD review", "field performance", "user-specific browser extensions"]);
});

test("browser evidence rejects relaxed performance, partial focus, wrong locale and synthetic reflow", () => {
  for (const mutate of [
    (copy) => { copy.profile.downloadBitsPerSecond = 16_000_000; },
    (copy) => { copy.thresholds.lcpMsExclusive = 2500; },
    (copy) => { copy.routes[0].lcpRuns[0] = 2000; },
    (copy) => { copy.routes[1].landmarks.documentLang = "en"; },
    (copy) => { copy.routes[0].keyboard.traversedTabStops -= 1; },
    (copy) => { copy.routes[0].forcedColors.evidenceFailures = 1; },
    (copy) => { delete copy.routes[0].forcedColors.confidenceCues; },
    (copy) => { copy.routes[0].reflow = { viewportWidth: 640, visualScale: 2, overflowPixels: 0 }; },
  ]) {
    const copy = structuredClone(evidence); mutate(copy);
    assert.throws(() => validateBrowserEvidence(copy));
  }
});
