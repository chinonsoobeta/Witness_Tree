#!/usr/bin/env node
// Recorded harvest, recorded fire, cause of the latest loss and regrowth, in
// 30 m cells, for every boundary the place pages have: the 2,291 published
// census subdivisions, the 44 economic regions, the 280 federal ridings of the
// four provinces and the 431 provincial ridings, plus the four provinces from
// the same masks the published province figures used.
//
// The inputs are the seven measurement files scripts/run-place-cause-recovery-zonal.sh
// wrote to derived/place-cause-recovery-zonal-v1/ on the data root, the
// census-subdivision to economic-region assignment the place pages already use,
// and the hand spot checks written by scripts/place_cause_recovery_spot_check.py.
// An economic region is the sum of all of its census subdivisions (3,033, so
// reserves and settlements count toward their region); a subdivision is
// published on its own only if data/place-name-index.json lists it.
//
// The output holds integer cell counts only. Nothing here is hectares, a
// share, or a published claim: the record is a measurement, not expert
// reviewed, not a release, and not production eligible.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDataRoot } from "./data-root.mjs";

export const OUTPUT = "data/place-cause-recovery-measurements.json";
export const BUILDER = "scripts/build-place-cause-recovery-measurements.mjs";
export const PRODUCT = "derived/place-cause-recovery-zonal-v1";
export const MAPPING = "derived/phase3-interval-place-zonal-v1/csd-to-economic-region.json";
export const SPOT_CHECKS = `${PRODUCT}/spot-checks.json`;
export const FIRST_YEAR = 1984;
export const LAST_YEAR = 2022;
export const DISTURBANCE_YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR }, (_, i) => FIRST_YEAR + 1 + i);
export const CANNOT_RECOVER_FROM = 2018;
export const CAUSES = ["notRecorded", "fire", "harvest", "fireAndHarvest"];
export const STATES = ["recovered", "noReturn", "unconfirmedReturn"];
export const PERIODS = ["latestLossBefore2018", "latestLossFrom2018"];

export const PROVINCES = [
  { id: "59", slug: "british-columbia", code: "BC" },
  { id: "48", slug: "alberta", code: "AB" },
  { id: "35", slug: "ontario", code: "ON" },
  { id: "24", slug: "quebec", code: "QC" },
];

// One measurement file per boundary file, in run order.
export const SETS = [
  { key: "provinces", file: "provinces-2021", boundarySet: "provinces", count: 4 },
  { key: "censusSubdivisions", file: "census-subdivisions-2021", boundarySet: "csd", count: 3033 },
  { key: "federal-2023", file: "federal-ridings-2023", boundarySet: "federal", count: 280 },
  { key: "bc-2023", file: "bc-provincial-ridings-2023", boundarySet: "bc", count: 93 },
  { key: "ab-2019", file: "ab-provincial-ridings-2019-goa", boundarySet: "ab", count: 87 },
  { key: "on-2022", file: "on-provincial-ridings-2022", boundarySet: "on", count: 124 },
  { key: "qc-2026", file: "qc-provincial-ridings-2026-published", boundarySet: "qc", count: 127 },
];

export const COUNT_FIELDS = [
  "cells", "unmappedCells", "unknownCells", "knownCells",
  "neverTreedCells", "treedNotLostCells", "lostCells", "lostTreedIn1984Cells", "recoveredAnyLossCells",
  "phase3UnionLossCells", "phase3KnownForestCells", "phase3UnknownCells",
];
const LOST_LENGTH = PERIODS.length * STATES.length * CAUSES.length;
export const LAYOUT = {
  counts: [0, COUNT_FIELDS.length],
  lostByPeriodStateCause: [COUNT_FIELDS.length, COUNT_FIELDS.length + LOST_LENGTH],
  harvestCellsByYear: [COUNT_FIELDS.length + LOST_LENGTH, COUNT_FIELDS.length + LOST_LENGTH + DISTURBANCE_YEARS.length],
  fireCellsByYear: [COUNT_FIELDS.length + LOST_LENGTH + DISTURBANCE_YEARS.length, COUNT_FIELDS.length + LOST_LENGTH + 2 * DISTURBANCE_YEARS.length],
};
export const ROW_LENGTH = LAYOUT.fireCellsByYear[1];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sum = (values) => values.reduce((a, b) => a + b, 0);

/** The flat integer row for one measured boundary. */
export function rowOf(district) {
  const lost = new Array(LOST_LENGTH).fill(0);
  const cross = district.lostByLatestYearStateCause;
  if (cross.length !== DISTURBANCE_YEARS.length * STATES.length * CAUSES.length) throw new Error(`${district.boundaryId}: cross-tabulation length`);
  DISTURBANCE_YEARS.forEach((year, y) => {
    const period = year >= CANNOT_RECOVER_FROM ? 1 : 0;
    for (let s = 0; s < STATES.length; s += 1) {
      for (let c = 0; c < CAUSES.length; c += 1) {
        lost[(period * STATES.length + s) * CAUSES.length + c] += cross[(y * STATES.length + s) * CAUSES.length + c];
      }
    }
  });
  const counts = {
    ...district,
    phase3UnionLossCells: district.phase3.unionLossCells,
    phase3KnownForestCells: district.phase3.knownForestCells,
    phase3UnknownCells: district.phase3.unknownCells,
  };
  const row = [...COUNT_FIELDS.map((field) => counts[field]), ...lost, ...district.harvestCellsByYear, ...district.fireCellsByYear];
  if (row.length !== ROW_LENGTH || !row.every((n) => Number.isInteger(n) && n >= 0)) throw new Error(`${district.boundaryId}: not a row of counts`);
  return row;
}

/** Throws unless a row's parts add to its whole, cell for cell. */
export function assertRowAdds(id, row) {
  const c = Object.fromEntries(COUNT_FIELDS.map((field, i) => [field, row[i]]));
  const lost = row.slice(...LAYOUT.lostByPeriodStateCause);
  const fail = (what) => { throw new Error(`${id}: ${what}`); };
  if (c.cells !== c.unknownCells + c.knownCells) fail("cells are not unknown plus known");
  if (c.knownCells !== c.neverTreedCells + c.treedNotLostCells + c.lostCells) fail("known cells are not never treed, treed and not lost, and lost");
  if (sum(lost) !== c.lostCells) fail("lost cells are not the sum of their period, state and cause");
  // Recovery needs five treed years, so a loss from 2018 on cannot be treed again by 2022.
  for (let c2 = 0; c2 < CAUSES.length; c2 += 1) if (lost[(1 * STATES.length + 0) * CAUSES.length + c2] !== 0) fail("a loss from 2018 on is counted as treed again");
  if (c.lostTreedIn1984Cells > c.lostCells) fail("more lost cells treed in 1984 than lost cells");
  if (c.unmappedCells > c.unknownCells) fail("unmapped cells are not all Unknown");
  if (c.phase3UnknownCells > c.cells || c.phase3UnionLossCells > c.phase3KnownForestCells) fail("phase 3 parts exceed their whole");
  for (const key of ["harvestCellsByYear", "fireCellsByYear"]) if (sum(row.slice(...LAYOUT[key])) > c.cells) fail(`${key} exceed the cells`);
}

const addInto = (total, row) => { row.forEach((n, i) => { total[i] += n; }); return total; };

function readJson(root, relative, builtFrom) {
  const bytes = readFileSync(resolve(root, relative));
  builtFrom.push({ path: relative, byteLength: bytes.length, sha256: sha256(bytes) });
  return JSON.parse(bytes);
}

export function buildRecord({ root, repoRoot }) {
  const builtFrom = [];
  const index = JSON.parse(readFileSync(resolve(repoRoot, "data/place-name-index.json"), "utf8"));
  const digests = readJson(root, `${PRODUCT}/input-digests.json`, builtFrom);
  const sets = {};
  const diagnostics = {};
  const runs = {};
  let methodVersion = null;
  for (const set of SETS) {
    const doc = readJson(root, `${PRODUCT}/${set.file}.json`, builtFrom);
    const sidecar = readJson(root, `${PRODUCT}/${set.file}.provenance.json`, builtFrom);
    if (doc.boundarySet !== set.boundarySet) throw new Error(`${set.file}: boundary set ${doc.boundarySet}`);
    if (doc.firstYear !== FIRST_YEAR || doc.lastYear !== LAST_YEAR || doc.confirmYears !== 5 || doc.causeWindowYears !== 1) throw new Error(`${set.file}: not the v3 rules`);
    if (JSON.stringify(doc.causeNames) !== JSON.stringify(CAUSES) || JSON.stringify(doc.latestLossStateNames) !== JSON.stringify(STATES)) throw new Error(`${set.file}: names changed`);
    if (doc.districts.length !== set.count) throw new Error(`${set.file}: ${doc.districts.length} boundaries, expected ${set.count}`);
    if (sidecar.outputSha256 !== builtFrom.at(-2).sha256) throw new Error(`${set.file}: the provenance names another output`);
    if (sidecar.inputs.some((input) => !input.sha256)) throw new Error(`${set.file}: an input was not hashed`);
    methodVersion ??= doc.methodVersion;
    if (doc.methodVersion !== methodVersion) throw new Error(`${set.file}: method version differs`);
    runs[set.key] = { file: `${PRODUCT}/${set.file}.json`, boundaryEdition: doc.boundaryEdition, workers: sidecar.workers, elapsedSeconds: sidecar.elapsedSeconds };
    const diag = { unknownClass0Cells: 0, unknownNodataCells: 0, harvestOtherValueCells: 0, fireOtherValueCells: 0, harvestInUnknownCells: 0, fireInUnknownCells: 0, harvestInUnmappedCells: 0, fireInUnmappedCells: 0, phase3UnionMismatchCells: 0, phase3UnknownMismatchCells: 0 };
    const rows = {};
    for (const district of doc.districts) {
      const id = set.key === "provinces" ? PROVINCES.find((p) => p.slug === district.boundaryId)?.id : String(district.boundaryId);
      if (!id || rows[id]) throw new Error(`${set.file}: boundary ${district.boundaryId} unknown or repeated`);
      const row = rowOf(district);
      assertRowAdds(`${set.key} ${id}`, row);
      rows[id] = row;
      for (const key of Object.keys(diag)) {
        if (key === "phase3UnionMismatchCells") diag[key] += district.phase3.unionVersusLostTreedIn1984MismatchCells;
        else if (key === "phase3UnknownMismatchCells") diag[key] += district.phase3.unknownVersusUnknownMismatchCells;
        else diag[key] += district[key];
      }
    }
    sets[set.key] = rows;
    diagnostics[set.key] = diag;
  }
  // Integer-like keys keep ascending order in a JavaScript object, so compare the set.
  if (JSON.stringify(Object.keys(sets.provinces).sort()) !== JSON.stringify(PROVINCES.map((p) => p.id).sort())) throw new Error("not the four provinces");

  // Economic regions: every census subdivision added into its region.
  const mapping = readJson(root, MAPPING, builtFrom);
  if ((mapping.unmatched ?? []).length !== 0) throw new Error("a census subdivision has no economic region");
  const regions = {};
  for (const [id, row] of Object.entries(sets.censusSubdivisions)) {
    const region = mapping.csdToRegion[id];
    if (!region) throw new Error(`${id} has no economic region`);
    if (mapping.regions[region].eruid.slice(0, 2) !== id.slice(0, 2)) throw new Error(`${id} is assigned to a region in another province`);
    regions[region] ??= new Array(ROW_LENGTH).fill(0);
    addInto(regions[region], row);
  }
  if (Object.keys(regions).length !== 44) throw new Error(`expected 44 economic regions, found ${Object.keys(regions).length}`);
  for (const [id, row] of Object.entries(regions)) assertRowAdds(`economic region ${id}`, row);

  // Only the published places.
  const places = {};
  for (const id of index.places.map((place) => place.id).sort()) {
    if (!sets.censusSubdivisions[id]) throw new Error(`place ${id} was not measured`);
    places[id] = sets.censusSubdivisions[id];
  }
  if (Object.keys(places).length !== 2291) throw new Error(`expected 2,291 places, found ${Object.keys(places).length}`);

  const spot = readJson(root, SPOT_CHECKS, builtFrom);
  const spotChecks = spot.checks.map((check) => ({ set: check.set, id: check.id, method: check.method, row: check.row }));

  const builderBytes = readFileSync(resolve(repoRoot, BUILDER));
  const sorted = (rows) => Object.fromEntries(Object.entries(rows).sort(([a], [b]) => (a < b ? -1 : 1)));
  return {
    schema: "witness-tree/place-cause-recovery-measurements/1",
    status: "local-nonproduction-measured",
    claims: { admitted: false, released: false, expertReviewed: false, ownerReviewed: false, productionEligible: false, externalAction: false },
    methodVersion,
    methodNote: "docs/PLACE_CAUSE_RECOVERY_MEASUREMENTS.md",
    builder: { path: BUILDER, sha256: sha256(builderBytes) },
    checkedBy: "scripts/check-place-cause-recovery-measurements.mjs",
    builtFrom,
    inputRasters: Object.values(digests).length,
    provinces: PROVINCES.map((p) => p.id),
    firstYear: FIRST_YEAR,
    lastYear: LAST_YEAR,
    disturbanceYears: [DISTURBANCE_YEARS[0], DISTURBANCE_YEARS.at(-1)],
    baselineYear: FIRST_YEAR,
    baselineRule: "1984 is the first image, so no harvest, fire or loss can be dated to it: it is Unknown, never zero, and has no column.",
    rules: {
      treed: "VLCE2 classes 210, 220 and 230 (set A of the v3 record). Classes 20, 31, 32, 33, 40, 50, 80, 81 and 100 are not treed. Any other value in any year makes the cell Unknown for the whole record.",
      loss: "A cell treed in one year and not treed the next; the loss year is the later year. Only the latest loss of a cell is classified.",
      cause: "Fire or harvest when that raster's recorded year is within one year of the latest loss year; both when both are; not recorded otherwise. The four causes are disjoint; there is no precedence.",
      treedAgain: "Five consecutive treed years after the latest loss. A latest loss from 2018 on cannot have five treed years by 2022.",
      harvestAndFire: "Cells whose recorded harvest (or fire) year is that year, whatever their land cover, as the province series counts them.",
      phase3: "phase3UnionLossCells, phase3KnownForestCells and phase3UnknownCells are recomputed from the phase 3 rasters (forest mask 1984, the 38 annual loss rasters and the mapped extent) for the span 1984 to 2022.",
    },
    fields: {
      layout: LAYOUT,
      counts: COUNT_FIELDS,
      lostByPeriodStateCause: "index (period * 3 + state) * 4 + cause; period " + PERIODS.join(", ") + "; state " + STATES.join(", ") + "; cause " + CAUSES.join(", "),
      harvestCellsByYear: `${DISTURBANCE_YEARS[0]} to ${DISTURBANCE_YEARS.at(-1)}`,
      fireCellsByYear: `${DISTURBANCE_YEARS[0]} to ${DISTURBANCE_YEARS.at(-1)}`,
    },
    runs,
    diagnostics,
    spotChecks,
    boundaries: {
      provinces: sets.provinces,
      places,
      economicRegions: sorted(regions),
      "federal-2023": sets["federal-2023"],
      "bc-2023": sets["bc-2023"],
      "ab-2019": sets["ab-2019"],
      "on-2022": sets["on-2022"],
      "qc-2026": sets["qc-2026"],
    },
  };
}

/** One boundary per line, so a change shows as a line in review. */
export function serialize(record) {
  const { boundaries, ...head } = record;
  const blocks = Object.entries(boundaries).map(([key, rows]) =>
    `  ${JSON.stringify(key)}: {\n${Object.entries(rows).map(([id, row]) => `   ${JSON.stringify(id)}: ${JSON.stringify(row)}`).join(",\n")}\n  }`);
  const headText = JSON.stringify(head, null, 1);
  return `${headText.slice(0, -2)},\n "boundaries": {\n${blocks.join(",\n")}\n }\n}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const record = buildRecord({ root: resolveDataRoot(), repoRoot });
  writeFileSync(resolve(repoRoot, OUTPUT), serialize(record));
  const counts = Object.entries(record.boundaries).map(([key, rows]) => `${key} ${Object.keys(rows).length}`).join(", ");
  console.log(`wrote ${OUTPUT}: ${counts}`);
}
