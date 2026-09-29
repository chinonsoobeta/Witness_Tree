#!/usr/bin/env node
/**
 * Turns the census-subdivision interval aggregate on the data root into what
 * the site reads for places and economic regions.
 *
 * Input: derived/phase3-interval-place-zonal-v1/census-subdivisions-2021.json,
 * the same interval-union-and-sum method the riding figures use, run over the
 * 3,033 census subdivisions of the four provinces (2021 cartographic boundary
 * file). Every number in it is a count of 30 m cells, so figures for areas that
 * don't overlap add up exactly.
 *
 * Outputs:
 *   data/phase3-economic-region-interval-measurements.json
 *     The 44 economic regions, each the sum of every census subdivision inside
 *     it (a subdivision's point on its surface falls in exactly one region; see
 *     csd-to-economic-region.json). Reserves and settlements count toward their
 *     region's total, as they are part of its area; they are never published
 *     on their own.
 *   data/place-whole-record-measurements.json
 *     1984-2022 for the 2,291 places in data/place-name-index.json, for search.
 *   <data root>/derived/phase3-interval-place-zonal-v1/site/census-subdivisions-<PR>.json
 *     Every span for those 2,291 places, one file per province, for the map's
 *     census-subdivision layer. Too large for the site bundle; served beside the
 *     layer's tiles.
 *
 * Each record is compacted and checked by compactDistrict, the same function
 * the riding release uses, so a broken span stops the build.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compactDistrict } from "./build-phase3-interval-release.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const PRODUCT = "derived/phase3-interval-place-zonal-v1";
const SOURCE = `${PRODUCT}/census-subdivisions-2021.json`;
const MAPPING = `${PRODUCT}/csd-to-economic-region.json`;
const SITE_DIR = `${PRODUCT}/site`;
const REGION_RELEASE = "data/phase3-economic-region-interval-measurements.json";
const PLACE_RELEASE = "data/place-whole-record-measurements.json";
const PROVINCE_FOR_PRUID = { "59": "BC", "48": "AB", "35": "ON", "24": "QC" };
const STEPS = 38;
const SPANS = (STEPS * (STEPS + 1)) / 2;
const SUMMED_FIELDS = [
  "cells", "unmappedCells",
  "annualLossCells", "intervalKnownCells", "intervalUnionLossCells", "intervalUnknownCells", "intervalSummedLossCells",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readDataRoot = (relative) => readFileSync(path.join(DATA_ROOT, relative));

const sourceBytes = readDataRoot(SOURCE);
const source = JSON.parse(sourceBytes);
const mappingBytes = readDataRoot(MAPPING);
const mapping = JSON.parse(mappingBytes);
const index = JSON.parse(readFileSync(path.join(REPO_ROOT, "data/place-name-index.json"), "utf8"));
if (source.firstYear !== 1984 || source.lastYear !== 2022 || source.intervalCount !== SPANS) {
  throw new Error("The census-subdivision aggregate does not cover the 741 spans of 1984 to 2022.");
}
if (source.districts.length !== 3033) throw new Error(`Expected 3,033 census subdivisions, read ${source.districts.length}.`);
if ((mapping.unmatched ?? []).length !== 0) throw new Error("Some census subdivisions have no economic region.");

// Economic regions: add every subdivision's cell counts, field by field.
const regions = new Map();
for (const district of source.districts) {
  const region = mapping.csdToRegion[district.boundaryId];
  if (!region) throw new Error(`${district.boundaryId} has no economic region.`);
  if (!regions.has(region)) {
    regions.set(region, Object.fromEntries(SUMMED_FIELDS.map((field) => [field, Array.isArray(district[field]) ? new Array(district[field].length).fill(0) : 0])));
  }
  const total = regions.get(region);
  for (const field of SUMMED_FIELDS) {
    if (Array.isArray(district[field])) district[field].forEach((value, i) => { total[field][i] += value; });
    else total[field] += district[field];
  }
}
if (regions.size !== 44) throw new Error(`Expected 44 economic regions, found ${regions.size}.`);
const regionRecords = [...regions.entries()]
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([dguid, totals]) => compactDistrict({ boundaryId: dguid, boundaryName: mapping.regions[dguid].name, ...totals }, source.firstYear));

writeFileSync(path.join(REPO_ROOT, REGION_RELEASE), `${JSON.stringify({
  schema: "witness-tree/phase3-economic-region-interval-measurements/1",
  builtFrom: { path: SOURCE, sha256: sha256(sourceBytes) },
  regionMapping: { path: MAPPING, sha256: sha256(mappingBytes), method: mapping.method },
  boundaryEdition: "statcan-2021-economic-regions",
  methodVersion: source.methodVersion,
  cellHectares: source.cellHectares,
  firstYear: source.firstYear,
  lastYear: source.lastYear,
  annualStepCount: STEPS,
  spanCount: SPANS,
  unionTerm: source.unionTerm,
  summedTerm: source.summedTerm,
  summedPercentAllowed: false,
  claims: { admitted: false, released: false, productionEligible: false, externalAction: false },
  note: "Each region is the sum of the census subdivisions inside it. Cell counts of areas that don't overlap add exactly.",
  regions: regionRecords,
})}\n`);

// Places: only the census subdivisions the place-name index publishes.
const published = new Set(index.places.map((place) => place.id));
const byId = new Map(source.districts.map((district) => [district.boundaryId, district]));
const places = {};
const perProvince = { BC: [], AB: [], ON: [], QC: [] };
for (const id of [...published].sort()) {
  const district = byId.get(id);
  if (!district) throw new Error(`Place ${id} has no census-subdivision measurement.`);
  const compact = compactDistrict(district, source.firstYear);
  // Span order runs by opening year, then closing year, so the span 1984 to
  // 2022 is the first opening year's last entry.
  const union = district.intervalUnionLossCells[STEPS - 1];
  const known = district.intervalKnownCells[STEPS - 1];
  const unknown = district.intervalUnknownCells[STEPS - 1];
  const summed = district.intervalSummedLossCells[STEPS - 1];
  places[id] = [union, known, unknown, summed, district.unmappedCells];
  perProvince[PROVINCE_FOR_PRUID[id.slice(0, 2)]].push(compact);
}
if (Object.keys(places).length !== 2291) throw new Error(`Expected 2,291 published places, built ${Object.keys(places).length}.`);

writeFileSync(path.join(REPO_ROOT, PLACE_RELEASE), `${JSON.stringify({
  schema: "witness-tree/place-whole-record-measurements/1",
  builtFrom: { path: SOURCE, sha256: sha256(sourceBytes) },
  boundaryEdition: "statcan-2021-census-subdivisions-cbf",
  methodVersion: source.methodVersion,
  cellHectares: source.cellHectares,
  span: { fromYear: 1984, toYear: 2022 },
  fields: ["unionLossCells", "knownForestCells", "unknownCells", "summedLossCells", "unmappedCells"],
  claims: { admitted: false, released: false, productionEligible: false, externalAction: false },
  note: "One row per place in data/place-name-index.json. Reserves, settlements and treaty or agreement lands are not published.",
  places,
})}\n`);

mkdirSync(path.join(DATA_ROOT, SITE_DIR), { recursive: true });
for (const [province, records] of Object.entries(perProvince)) {
  const file = path.join(DATA_ROOT, SITE_DIR, `census-subdivisions-${province}.json`);
  writeFileSync(file, `${JSON.stringify({
    schema: "witness-tree/census-subdivision-interval-measurements/1",
    province,
    builtFrom: { path: SOURCE, sha256: sha256(sourceBytes) },
    cellHectares: source.cellHectares,
    firstYear: source.firstYear,
    lastYear: source.lastYear,
    places: records,
  })}\n`);
}
console.log(`regions ${regionRecords.length}, places ${Object.keys(places).length}, province files ${Object.keys(perProvince).length}`);
