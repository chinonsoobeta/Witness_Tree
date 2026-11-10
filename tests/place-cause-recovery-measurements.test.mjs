import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CAUSES, COUNT_FIELDS, LAYOUT, ROW_LENGTH, STATES, assertRowAdds } from "../scripts/build-place-cause-recovery-measurements.mjs";
import { checkRecord, field, phase3References, regrowth } from "../scripts/check-place-cause-recovery-measurements.mjs";

const record = JSON.parse(readFileSync(new URL("../data/place-cause-recovery-measurements.json", import.meta.url), "utf8"));
const refs = phase3References();
const copy = () => structuredClone(record);
const at = (name) => COUNT_FIELDS.indexOf(name);
const lostIndex = (period, state, cause) => LAYOUT.lostByPeriodStateCause[0] + (period * STATES.length + state) * CAUSES.length + cause;
const firstPlace = (r) => Object.keys(r.boundaries.places)[0];

test("the checked-in record passes all four checks", () => {
  const result = checkRecord(record, refs);
  assert.equal(result.check2.rows, 4 + 2291 + 44 + 280 + 431);
  for (const set of Object.values(result.check1)) assert.equal(set.differing, 0);
  assert.equal(result.check4.length >= 3, true);
});

test("the record claims nothing beyond a local measurement", () => {
  assert.equal(record.status, "local-nonproduction-measured");
  assert.ok(Object.values(record.claims).every((claim) => claim === false));
});

test("a row whose causes do not add to its lost cells is refused", () => {
  const r = copy();
  r.boundaries.places[firstPlace(r)][lostIndex(0, 1, 0)] += 1;
  assert.throws(() => checkRecord(r, refs), /lost cells are not the sum/);
});

test("a loss from 2018 on can never be treed again", () => {
  const r = copy();
  const row = r.boundaries.provinces["59"];
  assert.ok(row[lostIndex(1, 1, 2)] > 0);
  row[lostIndex(1, 1, 2)] -= 1;    // a 2018-on harvest loss with no return ...
  row[lostIndex(1, 0, 2)] += 1;    // ... moved to treed again
  assert.throws(() => checkRecord(r, refs), /from 2018 on/);
});

test("a union that drifts from the phase 3 record is refused", () => {
  const r = copy();
  const id = firstPlace(r);
  r.boundaries.places[id][at("phase3UnionLossCells")] += 1;
  r.boundaries.places[id][at("lostTreedIn1984Cells")] += 1;
  r.boundaries.places[id][at("lostCells")] += 1;
  r.boundaries.places[id][at("knownCells")] += 1;
  r.boundaries.places[id][at("cells")] += 1;
  r.boundaries.places[id][lostIndex(0, 1, 0)] += 1;
  assert.throws(() => checkRecord(r, refs), /phase 3 whole-record figures differ/);
});

test("an Unknown count that is not the phase 3 Unknown is refused", () => {
  const r = copy();
  const id = firstPlace(r);
  r.boundaries.places[id][at("phase3UnknownCells")] += 1;
  assert.throws(() => checkRecord(r, refs), /phase 3 whole-record figures differ/);
});

test("1984 has no harvest, fire or loss column", () => {
  const r = copy();
  r.disturbanceYears = [1984, 2022];
  assert.throws(() => checkRecord(r, refs), /Unknown, never zero/);
});

test("a province that leaves the published harvest series is refused", () => {
  const r = copy();
  r.boundaries.provinces["48"][LAYOUT.harvestCellsByYear[0] + 10] += 1;
  assert.throws(() => checkRecord(r, refs), /harvest by year differs|exceed/);
});

test("a spot check that disagrees with its row is refused", () => {
  const r = copy();
  r.spotChecks[0].row[at("lostCells")] += 1;
  assert.throws(() => checkRecord(r, refs), /direct count differs/);
});

test("regrowth splits every lost cell into exactly one of three parts", () => {
  const row = new Array(ROW_LENGTH).fill(0);
  row[lostIndex(0, 0, 1)] = 5;   // before 2018, treed again, fire
  row[lostIndex(0, 1, 2)] = 7;   // before 2018, no return, harvest
  row[lostIndex(0, 2, 0)] = 3;   // before 2018, return under way
  row[lostIndex(1, 1, 3)] = 2;   // from 2018, no return yet
  row[lostIndex(1, 2, 2)] = 4;   // from 2018, return under way
  assert.deepEqual(regrowth(row), { treedAgain: 5, notTreedAgain: 7, cannotBeJudged: 9 });
  row[at("lostCells")] = 21; row[at("knownCells")] = 21; row[at("cells")] = 21;
  assertRowAdds("synthetic", row);
  assert.equal(field(row, "lostCells"), 21);
});
