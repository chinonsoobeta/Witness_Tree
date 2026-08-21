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
  assert.equal(evidence.schemaVersion, "witness-tree/phase3-browser-audit/3");
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

test("browser evidence rejects every reproduced metadata, identity, semantic and boundary tamper", () => {
  const cases = [
    ["network profile", (copy) => { copy.profile.downloadBitsPerSecond = 16_000_000; }],
    ["performance threshold", (copy) => { copy.thresholds.lcpMsExclusive = 2500; }],
    ["LCP boundary", (copy) => { copy.routes[0].lcpRuns[0] = 2000; }],
    ["template identity", (copy) => { copy.routes[0].template = "location"; }],
    ["paired locale and language", (copy) => { copy.routes[1].locale = "en"; copy.routes[1].landmarks.documentLang = "en"; copy.routes[1].landmarks.contentLang = "en"; }],
    ["missing browser product", (copy) => { delete copy.browser.product; }],
    ["missing browser protocol", (copy) => { delete copy.browser.protocolVersion; }],
    ["missing global axe version", (copy) => { delete copy.axeVersion; }],
    ["per-route axe version drift", (copy) => { copy.routes[0].axe.version = "4.10.0"; }],
    ["null LCP element", (copy) => { copy.routes[0].lcpElement = null; }],
    ["invalid LCP element", (copy) => { copy.routes[0].lcpElement = "not a tag"; }],
    ["collapsed focus counts", (copy) => { copy.routes[0].keyboard.totalTabStops = 1; copy.routes[0].keyboard.traversedTabStops = 1; copy.routes[0].landmarks.interactive = 1; }],
    ["partial focus", (copy) => { copy.routes[0].keyboard.traversedTabStops -= 1; }],
    ["landmark and focus mismatch", (copy) => { copy.routes[0].landmarks.interactive += 1; }],
    ["invalid landmark", (copy) => { copy.routes[0].landmarks.banner = false; }],
    ["forced-colors link distinction", (copy) => { copy.routes[0].forcedColors.linkFailures = 1; }],
    ["invisible forced-colors cue", (copy) => { copy.routes[0].forcedColors.evidenceFailures = 1; }],
    ["collapsed cue variants", (copy) => { copy.routes[0].forcedColors.evidenceVariants = ["official-record"]; }],
    ["collapsed visible cue glyphs", (copy) => { copy.routes[0].forcedColors.evidenceVariantGlyphs[1] = copy.routes[0].forcedColors.evidenceVariantGlyphs[0]; }],
    ["missing confidence variant identity", (copy) => { copy.routes[0].forcedColors.confidenceVariants = []; }],
    ["one global cue pair", (copy) => { for (const row of copy.routes) { row.forcedColors.evidenceCues = 0; row.forcedColors.confidenceCues = 0; row.forcedColors.evidenceVariants = []; row.forcedColors.confidenceVariants = []; } copy.routes[0].forcedColors.evidenceCues = 1; copy.routes[0].forcedColors.confidenceCues = 1; copy.routes[0].forcedColors.evidenceVariants = ["official-record"]; copy.routes[0].forcedColors.confidenceVariants = ["high"]; }],
    ["arbitrary local scroll regions", (copy) => { copy.routes[0].reflow.localScrollRegions = 99; }],
    ["synthetic reflow", (copy) => { copy.routes[0].reflow = { viewportWidth: 640, visualScale: 2, overflowPixels: 0, localScrollRegions: 2 }; }],
    ["removed exclusion", (copy) => { copy.excluded.pop(); }],
    ["altered exclusion", (copy) => { copy.excluded[0] = "screen-reader output complete"; }],
  ];
  for (const [name, mutate] of cases) {
    const copy = structuredClone(evidence); mutate(copy);
    assert.throws(() => validateBrowserEvidence(copy), name);
  }
});
