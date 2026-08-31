#!/usr/bin/env node
/**
 * Validates the BC endpoint divergence observation and keeps it honest about
 * its own reach.
 *
 * The record exists so that any claim resting on a BC forest tenure feature
 * count says which endpoint produced it. This checker therefore enforces two
 * things above schema: that the self-consistency control held, and that the
 * record claims nothing about which endpoint is authoritative or when either
 * was refreshed. BC states neither, so a record that asserted either would be
 * inferring publisher facts.
 *
 * Read-only.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DIVERGENCE_PATH = "data/bc-ften-endpoint-divergence-2026-08-30.json";
const LIFECYCLE = ["PENDING", "ACTIVE", "RETIRED"];

export function validateBcFtenEndpointDivergence(record) {
  const failures = [];
  const add = (message) => failures.push(message);

  if (record.schemaVersion !== "witness-tree/bc-ften-endpoint-divergence/1") add(`schemaVersion is ${record.schemaVersion}.`);
  if (record.status !== "as-of-query-time-observation") add(`status is ${record.status}, expected as-of-query-time-observation.`);
  for (const claim of ["published", "productionEligible", "isEdition", "isSnapshot"]) {
    if (record[claim] !== false) add(`${claim} must be false; this is an observation, not an edition.`);
  }
  if (!/resolves nothing about which endpoint is authoritative/i.test(record.purpose ?? "")) add("purpose must state that the record resolves nothing about which endpoint is authoritative.");
  if (!/Which endpoint is authoritative/i.test(record.doesNotShow ?? "")) add("doesNotShow must keep the authority question open.");
  if (record.control?.held !== true) add("the self-consistency control did not hold, so no count here can be compared.");

  if (!Array.isArray(record.layers) || record.layers.length === 0) return [...failures, "record measures no layers."];
  for (const layer of record.layers) {
    for (const [side, observed] of [["arcgis", layer.arcgis], ["wfs", layer.wfs]]) {
      if (observed?.sumsToTotal !== true) add(`${layer.id} ${side} did not reconcile to its lifecycle breakdown.`);
      const summed = LIFECYCLE.reduce((running, status) => running + (observed?.byStatus?.[status] ?? Number.NaN), 0);
      if (summed !== observed?.total) add(`${layer.id} ${side} totals ${observed?.total} but its lifecycle counts sum to ${summed}.`);
    }
    if (layer.arcgis?.definitionExpression != null) add(`${layer.id} ArcGIS side carries a definition expression, so it is a filtered view rather than the feature class.`);
    if (layer.delta?.wfsMinusArcgis !== layer.wfs?.total - layer.arcgis?.total) add(`${layer.id} delta does not equal the difference it reports.`);
    for (const status of LIFECYCLE) {
      const expected = layer.wfs?.byStatus?.[status] - layer.arcgis?.byStatus?.[status];
      if (layer.delta?.byStatus?.[status] !== expected) add(`${layer.id} ${status} delta does not equal the difference it reports.`);
    }
  }
  return failures;
}

export function check(root = REPO_ROOT) {
  return validateBcFtenEndpointDivergence(JSON.parse(readFileSync(path.join(root, DIVERGENCE_PATH), "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const failures = check();
  if (failures.length > 0) {
    console.error("BC endpoint divergence record is not valid:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  const record = JSON.parse(readFileSync(path.join(REPO_ROOT, DIVERGENCE_PATH), "utf8"));
  for (const layer of record.layers) console.log(`${layer.id}: ArcGIS ${layer.arcgis.total}, WFS ${layer.wfs.total}, difference ${layer.delta.wfsMinusArcgis}.`);
  console.log("Both endpoints reconciled against their own lifecycle breakdowns. Neither is claimed authoritative.");
}
