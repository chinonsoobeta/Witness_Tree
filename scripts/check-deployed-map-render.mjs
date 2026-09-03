#!/usr/bin/env node
/**
 * Fails when the deployed-Site render observation is missing, failing, or stale.
 *
 * scripts/verify-deployed-map-render.mjs drives a real browser against
 * https://www.witnesstree.ca and writes what it saw. That run needs the network
 * and the deployed origin, so it cannot be a CI step. This is the half CI can
 * run: it reads the committed record only.
 *
 * Staleness is the point. The record binds lib/explore/map-style.ts and
 * components/explore/ExploreMapClient.tsx by SHA-256. Change the archive URL or
 * the client and the observation no longer describes the deployed page, so this
 * fails and names the file that moved. Clearing it means re-running the harness
 * against the deployed Site, never editing the record: a record written by hand
 * asserts a measurement that did not happen.
 *
 * Read-only. It admits, releases and deploys nothing.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const RENDER_EVIDENCE_PATH = "data/deployed-map-render-evidence-2026-09-03.json";
export const RENDER_EVIDENCE_SCHEMA = "witness-tree/deployed-map-render-evidence/1";
export const DEPLOYED_ORIGIN = "https://www.witnesstree.ca";

const REQUIRED_CHECKS = Object.freeze([
  "pmtiles-range-responses",
  "no-geojson-fallback",
  "ready-from-pmtiles",
  "status-copy-is-not-a-fallback",
  "canvas-painted-loss-ramp",
]);

// `record` is injectable so the tests can exercise every rejection path without
// overwriting the real record, which describes a run that actually happened.
export function validateDeployedMapRender({ record: supplied, root = REPO_ROOT } = {}) {
  const failures = [];
  const add = (message) => failures.push(message);

  let record = supplied;
  if (record === undefined) {
    try {
      record = JSON.parse(readFileSync(path.join(root, RENDER_EVIDENCE_PATH), "utf8"));
    } catch (error) {
      return [`${RENDER_EVIDENCE_PATH} is missing or unreadable: ${error.message}. Run \`npm run verify:deployed-map-render\` against the deployed Site.`];
    }
  }

  if (record.schemaVersion !== RENDER_EVIDENCE_SCHEMA) add(`record schemaVersion is ${record.schemaVersion}, expected ${RENDER_EVIDENCE_SCHEMA}.`);
  if (record.status !== "deployed-site-browser-observation") add(`record status is ${record.status}, expected deployed-site-browser-observation.`);
  for (const claim of ["published", "productionEligible", "admissionClaim", "productionAdmission"]) {
    if (record[claim] !== false) add(`record claims ${claim} is not false; a browser observation admits and publishes nothing.`);
  }

  // The criterion is scoped to the deployed Site. A run against localhost or a
  // preview origin proves the code works, not that the Site does.
  if (typeof record.url !== "string" || !record.url.startsWith(DEPLOYED_ORIGIN)) {
    add(`record url is ${record.url}, which is not on the deployed origin ${DEPLOYED_ORIGIN}. This criterion is scoped to the deployed Site.`);
  }

  if (!Array.isArray(record.checks)) return [...failures, "record has no checks array."];
  const byId = new Map(record.checks.map((entry) => [entry.id, entry]));
  for (const id of REQUIRED_CHECKS) {
    const entry = byId.get(id);
    if (!entry) {
      add(`record does not report the ${id} check.`);
      continue;
    }
    if (entry.pass !== true) add(`${id} did not pass: ${entry.observed}. A failing observation is a real failure, not a stale record.`);
  }
  for (const id of [...byId.keys()].filter((name) => !REQUIRED_CHECKS.includes(name))) {
    add(`record reports an unknown check ${id}; the required set changed without this checker being updated.`);
  }
  if (record.allChecksPassed !== true) add("record does not assert allChecksPassed.");

  // A 206 is the whole point: it proves range requests reached the archive
  // rather than a whole-object download or a cached fallback.
  if (!(record.requestCounts?.pmtilesRange > 0)) add("record shows no HTTP 206 range responses from the PMTiles archive.");
  if (record.requestCounts?.geojsonFallback !== 0) add(`record shows ${record.requestCounts?.geojsonFallback} GeoJSON fallback fetches; the deployed page must not fall back.`);

  if (!Array.isArray(record.sources) || record.sources.length === 0) {
    add("record binds no source files, so staleness cannot be detected.");
    return failures;
  }
  for (const { path: relative, sha256 } of record.sources) {
    let current;
    try {
      current = createHash("sha256").update(readFileSync(path.join(root, relative))).digest("hex");
    } catch (error) {
      add(`record binds ${relative}, which cannot be read: ${error.message}`);
      continue;
    }
    if (current !== sha256) {
      add(`${relative} changed since the deployed Site was observed at ${record.observedAt}. Re-run the harness against the deployed Site.`);
    }
  }

  return failures;
}

function main() {
  const failures = validateDeployedMapRender();
  if (failures.length > 0) {
    console.error("Deployed-Site map render evidence is not current:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  const record = JSON.parse(readFileSync(path.join(REPO_ROOT, RENDER_EVIDENCE_PATH), "utf8"));
  console.log(
    `Deployed Site observed at ${record.observedAt}: ${record.requestCounts.pmtilesRange} PMTiles range responses, ` +
      `${record.requestCounts.geojsonFallback} fallback fetches, ${record.canvas.rampPixels} loss-ramp pixels. All ${REQUIRED_CHECKS.length} checks passed.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
