#!/usr/bin/env node
// Checks data/place-cause-recovery-measurements.json against the records the
// site already publishes, using checked-in files only.
//
//   1. Lost cells reproduce the phase 3 whole-record union. phase3UnionLossCells
//      was recounted from the phase 3 rasters and must equal unionLossCells in
//      the place, economic-region, riding and province span records; the
//      Unknown and unmapped cells must equal theirs too. The v3 rule counts a
//      loss of a cell that was not treed in 1984 and the union does not, so the
//      union must equal lostTreedIn1984Cells, and the run must report no cell
//      where the two masks disagree.
//   2. Every row's parts add to its whole exactly.
//   3. The economic regions of a province add up to the province figures.
//      The province row must equal the v3 record, the cause record and the
//      harvest and fire series; the region sums must equal the province row,
//      field by field, or differ only as the record's reconciliation states.
//   4. Each hand spot check, counted by a script that shares no code with the
//      measuring worker, equals its boundary's row.
//
// With the data root attached the record is also rebuilt from its inputs and
// must match byte for byte. Without it, nothing is skipped: every check above
// reads only the repository.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CAUSES, COUNT_FIELDS, DISTURBANCE_YEARS, LAYOUT, OUTPUT, PRODUCT, PROVINCES, ROW_LENGTH, SETS, STATES,
  assertRowAdds, buildRecord, serialize,
} from "./build-place-cause-recovery-measurements.mjs";
import { resolveDataRoot } from "./data-root.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (path) => JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));
const sum = (values) => values.reduce((a, b) => a + b, 0);

export const field = (row, name) => row[COUNT_FIELDS.indexOf(name)];
const lostAt = (row, period, state, cause) => row[LAYOUT.lostByPeriodStateCause[0] + (period * STATES.length + state) * CAUSES.length + cause];

/** Treed again, not treed again, and cannot be judged, from a row. */
export function regrowth(row) {
  const by = (period, state) => sum(CAUSES.map((_, c) => lostAt(row, period, state, c)));
  return {
    treedAgain: by(0, 0) + by(1, 0),
    notTreedAgain: by(0, 1),
    cannotBeJudged: by(0, 2) + by(1, 0) + by(1, 1) + by(1, 2),
  };
}

export function causes(row) {
  return Object.fromEntries(CAUSES.map((name, c) => [name, sum([0, 1].flatMap((p) => STATES.map((_, s) => lostAt(row, p, s, c))))]));
}

export function latestLoss(row) {
  return Object.fromEntries(STATES.map((name, s) => [name, sum([0, 1].flatMap((p) => CAUSES.map((_, c) => lostAt(row, p, s, c))))]));
}

const wholeSpan = (district) => ({
  union: sum(district.unionLossCellDeltas.slice(0, DISTURBANCE_YEARS.length)),
  known: district.knownForestCellsByStartYear[0],
  unknown: district.unknownCellsByStartYear[0],
  unmapped: district.unmappedCells,
});

/** The phase 3 whole-record figures of every boundary, by set and id. */
export function phase3References() {
  const places = readJson("data/place-whole-record-measurements.json").places;
  const regions = readJson("data/phase3-economic-region-interval-measurements.json").regions;
  const ridings = readJson("data/phase3-riding-interval-measurements.json").jurisdictions;
  const spans = readJson("data/phase3-province-interval-spans-1984-2022.json").boundariesSummed;
  const refs = {
    places: Object.fromEntries(Object.entries(places).map(([id, [union, known, unknown, , unmapped]]) => [id, { union, known, unknown, unmapped }])),
    economicRegions: Object.fromEntries(regions.map((d) => [d.boundaryId, wholeSpan(d)])),
    provinces: Object.fromEntries(spans.map((b) => [b.boundaryId, {
      union: b.intervalUnionLossCells[DISTURBANCE_YEARS.length - 1],
      known: b.intervalKnownCells[DISTURBANCE_YEARS.length - 1],
      unknown: b.intervalUnknownCells[DISTURBANCE_YEARS.length - 1],
      unmapped: b.unmappedCells,
    }])),
  };
  const byJurisdiction = { "federal-2023": "CA", "bc-2023": "BC", "ab-2019": "AB", "on-2022": "ON", "qc-2026": "QC" };
  for (const [key, jurisdiction] of Object.entries(byJurisdiction)) {
    const found = ridings.find((j) => j.jurisdiction === jurisdiction);
    refs[key] = Object.fromEntries(found.districts
      .filter((d) => key !== "federal-2023" || PROVINCES.some((p) => d.boundaryId.startsWith(p.id)))
      .map((d) => [d.boundaryId, wholeSpan(d)]));
  }
  return refs;
}

/** Runs the four checks; throws on the first failure, returns the numbers. */
export function checkRecord(record, refs = phase3References()) {
  const out = { check1: {}, check2: {}, check3: {}, check4: [] };
  assert.equal(record.schema, "witness-tree/place-cause-recovery-measurements/1");
  assert.equal(record.status, "local-nonproduction-measured");
  assert.deepEqual(record.claims, { admitted: false, released: false, expertReviewed: false, ownerReviewed: false, productionEligible: false, externalAction: false });
  assert.deepEqual(record.provinces, PROVINCES.map((p) => p.id));
  assert.deepEqual([record.firstYear, record.lastYear, record.baselineYear], [1984, 2022, 1984]);
  assert.deepEqual(record.disturbanceYears, [1985, 2022], "1984 must have no column: it is Unknown, never zero");
  assert.ok(!/hectare/i.test(JSON.stringify(record.fields)), "the record holds cells only");
  const expected = { provinces: 4, places: 2291, economicRegions: 44, "federal-2023": 280, "bc-2023": 93, "ab-2019": 87, "on-2022": 124, "qc-2026": 127 };
  assert.deepEqual(Object.fromEntries(Object.entries(record.boundaries).map(([k, rows]) => [k, Object.keys(rows).length])), expected);

  // Check 2: the parts add to the whole, for every row.
  let rows = 0;
  for (const [key, set] of Object.entries(record.boundaries)) {
    for (const [id, row] of Object.entries(set)) {
      assert.equal(row.length, ROW_LENGTH, `${key} ${id}: row length`);
      assert.ok(row.every((n) => Number.isInteger(n) && n >= 0), `${key} ${id}: not counts`);
      assertRowAdds(`${key} ${id}`, row);
      const r = regrowth(row);
      assert.equal(r.treedAgain + r.notTreedAgain + r.cannotBeJudged, field(row, "lostCells"), `${key} ${id}: regrowth parts`);
      rows += 1;
    }
  }
  out.check2 = { rows, failures: 0 };

  // Check 1: the phase 3 union and Unknown, boundary by boundary.
  for (const [key, set] of Object.entries(record.boundaries)) {
    const ref = refs[key];
    let unionCells = 0; let differing = 0; let gap = 0;
    for (const [id, row] of Object.entries(set)) {
      const r = ref[id];
      assert.ok(r, `${key} ${id}: no phase 3 record`);
      const ours = { union: field(row, "phase3UnionLossCells"), known: field(row, "phase3KnownForestCells"), unknown: field(row, "phase3UnknownCells"), unmapped: field(row, "unmappedCells") };
      if (JSON.stringify(ours) !== JSON.stringify(r)) differing += 1;
      assert.deepEqual(ours, r, `${key} ${id}: phase 3 whole-record figures differ`);
      assert.equal(field(row, "lostTreedIn1984Cells"), ours.union, `${key} ${id}: the union is not the lost cells treed in 1984`);
      unionCells += ours.union;
      gap += field(row, "lostCells") - ours.union;
    }
    out.check1[key] = { boundaries: Object.keys(set).length, differing, unionCells, lostNotTreedIn1984Cells: gap };
  }
  for (const set of SETS) {
    const d = record.diagnostics[set.key];
    assert.equal(d.phase3UnionMismatchCells, 0, `${set.key}: cells where the union and the lost-and-treed-in-1984 mask disagree`);
    assert.equal(d.phase3UnknownMismatchCells, 0, `${set.key}: cells where the two Unknown masks disagree`);
    assert.equal(d.harvestInUnmappedCells + d.fireInUnmappedCells, 0, `${set.key}: harvest or fire dated where land cover is unmapped`);
  }

  // Check 3: provinces against the published province figures, then regions against provinces.
  const v3 = readJson("data/phase4-condition-recovery-v3.json").provinces;
  const cause = readJson("data/phase4-condition-recovery-cause-and-check.json").causeOfLatestLoss.provinces;
  const series = readJson("data/harvest-fire-province-annual-series.json").provinces;
  const reconciliation = record.reconciliation ?? {};
  for (const province of PROVINCES) {
    const row = record.boundaries.provinces[province.id];
    const a = v3[province.slug].A;
    const ll = latestLoss(row);
    assert.deepEqual({
      maskCells: field(row, "cells"), unknownCells: field(row, "unknownCells"), knownCells: field(row, "knownCells"),
      neverTreedCells: field(row, "neverTreedCells"), everTreedCells: field(row, "treedNotLostCells") + field(row, "lostCells"), lostCells: field(row, "lostCells"),
      recoveredCells: ll.recovered, notRecoveredCells: ll.noReturn + ll.unconfirmedReturn, unconfirmedCells: ll.unconfirmedReturn,
      anyLossRecoveredCells: field(row, "recoveredAnyLossCells"),
    }, {
      maskCells: a.maskCells, unknownCells: a.unknownCells, knownCells: a.knownCells,
      neverTreedCells: a.neverTreedCells, everTreedCells: a.everTreedCells, lostCells: a.lostCells,
      recoveredCells: a.latestLoss.recoveredCells, notRecoveredCells: a.latestLoss.notRecoveredCells, unconfirmedCells: a.latestLoss.unconfirmedCells,
      anyLossRecoveredCells: a.anyLoss.recoveredCells,
    }, `${province.code}: differs from the v3 record`);
    // The cause record's recovered counts used the three-year rule of v2; its lost counts do not depend on it.
    assert.deepEqual(causes(row), Object.fromEntries(CAUSES.map((name) => [name, cause[province.slug].A[name].lostCells])), `${province.code}: differs from the cause record`);
    const s = series.find((p) => p.id === province.id);
    assert.equal(field(row, "cells"), s.landCells, `${province.code}: land cells differ from the harvest and fire series`);
    assert.equal(field(row, "unmappedCells"), s.unknownCells, `${province.code}: unmapped cells differ from the series' Unknown`);
    assert.deepEqual(row.slice(...LAYOUT.harvestCellsByYear), s.years.slice(1).map((y) => y.harvestCells), `${province.code}: harvest by year differs from the series`);
    assert.deepEqual(row.slice(...LAYOUT.fireCellsByYear), s.years.slice(1).map((y) => y.fireCells), `${province.code}: fire by year differs from the series`);

    const regionRows = Object.entries(record.boundaries.economicRegions).filter(([id]) => id.slice(9, 11) === province.id).map(([, r]) => r);
    const total = new Array(ROW_LENGTH).fill(0);
    for (const r of regionRows) r.forEach((n, i) => { total[i] += n; });
    const difference = total.map((n, i) => n - row[i]);
    const named = (vector) => ({
      ...Object.fromEntries(COUNT_FIELDS.map((name, i) => [name, vector[i]])),
      lostByPeriodStateCauseCells: sum(vector.slice(...LAYOUT.lostByPeriodStateCause).map(Math.abs)),
      harvestCellsAllYears: sum(vector.slice(...LAYOUT.harvestCellsByYear)),
      fireCellsAllYears: sum(vector.slice(...LAYOUT.fireCellsByYear)),
    });
    const stated = reconciliation[province.id];
    if (stated) {
      assert.deepEqual(difference, stated.regionsMinusProvince, `${province.code}: the region sums differ other than as the reconciliation states`);
      assert.ok(stated.cause && stated.cause.length > 20, `${province.code}: the difference has no stated cause`);
    } else {
      assert.ok(difference.every((n) => n === 0), `${province.code}: the region sums do not reproduce the province figures`);
    }
    out.check3[province.code] = { regions: regionRows.length, exact: difference.every((n) => n === 0), regionsMinusProvince: named(difference) };
  }
  assert.equal(sum(Object.values(out.check3).map((p) => p.regions)), 44);

  // Check 4: the hand spot checks.
  const kinds = new Set();
  for (const spot of record.spotChecks) {
    const row = record.boundaries[spot.set]?.[spot.id];
    assert.ok(row, `spot check ${spot.set} ${spot.id}: no such boundary`);
    assert.deepEqual(spot.row, row, `spot check ${spot.set} ${spot.id}: the direct count differs`);
    kinds.add(spot.set === "places" ? "censusSubdivision" : spot.set === "federal-2023" ? "federalRiding" : "provincialRiding");
    out.check4.push({ set: spot.set, id: spot.id, cells: field(row, "cells"), lostCells: field(row, "lostCells"), identicalValues: row.length });
  }
  assert.ok(record.spotChecks.length >= 3 && kinds.size === 3, "three spot checks on three kinds of boundary");
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bytes = readFileSync(resolve(repoRoot, OUTPUT), "utf8");
  const record = JSON.parse(bytes);
  const result = checkRecord(record);
  const root = resolveDataRoot();
  const rootPresent = existsSync(resolve(root, PRODUCT, "input-digests.json"));
  if (rootPresent) assert.equal(serialize(buildRecord({ root, repoRoot })), bytes, "the record differs from a rebuild from its inputs");
  const unionTotal = sum(Object.values(result.check1).map((s) => s.unionCells));
  console.log(
    `check-place-cause-recovery-measurements: ok, not reviewed and not released; ${result.check2.rows} rows add exactly; ` +
    `phase 3 union reproduced for every boundary (${unionTotal} cells, 0 differing); ` +
    `regions against provinces ${Object.entries(result.check3).map(([code, p]) => `${code} ${p.exact ? "exact" : "reconciled"}`).join(", ")}; ` +
    `${result.check4.length} spot checks identical` + (rootPresent ? "; rebuilt from the data root" : " (data root not mounted)"),
  );
}
