#!/usr/bin/env node
/**
 * Records which economic region holds each published place, for the place pages.
 *
 * Input: derived/phase3-interval-place-zonal-v1/csd-to-economic-region.json on
 * the data root, the same file scripts/build-place-region-measurements.mjs adds
 * the regions up from (data/phase3-economic-region-interval-measurements.json
 * binds its checksum as regionMapping.sha256). Each census subdivision's point
 * on its surface falls in exactly one 2021 economic region.
 *
 * Output: data/place-economic-regions.json, the 2,291 places of
 * data/place-name-index.json grouped by region code. Reserves, settlements and
 * treaty or agreement lands are in the input but are not published, so they
 * are left out here too.
 *
 * Reads two small files; nothing here needs bounding.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const MAPPING = "derived/phase3-interval-place-zonal-v1/csd-to-economic-region.json";
const OUTPUT = "data/place-economic-regions.json";

const mappingBytes = readFileSync(path.join(DATA_ROOT, MAPPING));
const sha256 = createHash("sha256").update(mappingBytes).digest("hex");
const mapping = JSON.parse(mappingBytes);
const regionRelease = JSON.parse(readFileSync(path.join(REPO_ROOT, "data/phase3-economic-region-interval-measurements.json"), "utf8"));
const index = JSON.parse(readFileSync(path.join(REPO_ROOT, "data/place-name-index.json"), "utf8"));

if (mapping.schema !== "witness-tree/csd-to-economic-region/1") throw new Error("Unexpected mapping schema.");
if (regionRelease.regionMapping?.sha256 !== sha256) {
  throw new Error("The mapping on the data root is not the one the economic-region figures were built from.");
}

const regions = Object.fromEntries(regionRelease.regions.map((region) => [region.boundaryId.slice(-4), []]));
for (const place of index.places) {
  const dguid = mapping.csdToRegion[place.id];
  if (typeof dguid !== "string" || !/^2021S0500\d{4}$/.test(dguid)) throw new Error(`${place.id} has no economic region.`);
  const code = dguid.slice(-4);
  if (!regions[code]) throw new Error(`${place.id} falls in ${dguid}, which has no figures.`);
  regions[code].push(place.id);
}
for (const list of Object.values(regions)) list.sort();

const record = {
  schema: "witness-tree/place-economic-regions/1",
  builtFrom: { path: MAPPING, sha256 },
  method: mapping.method,
  boundaryEdition: regionRelease.boundaryEdition,
  claims: { admitted: false, released: false, productionEligible: false, externalAction: false },
  note: "The economic region holding each place in data/place-name-index.json, by 2021 economic region code. The same assignment adds each place into its region's figures.",
  places: index.places.length,
  regions,
};
writeFileSync(path.join(REPO_ROOT, OUTPUT), `${JSON.stringify(record, null, 1)}\n`);
console.log(`Wrote ${OUTPUT}: ${record.places} places in ${Object.keys(regions).length} regions.`);
