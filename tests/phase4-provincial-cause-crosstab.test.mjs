import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CROSSTAB_PATH, validateCauseCrosstab } from "../scripts/check-phase4-provincial-cause-crosstab.mjs";

const record = JSON.parse(readFileSync(new URL(`../${CROSSTAB_PATH}`, import.meta.url), "utf8"));
const report = JSON.parse(readFileSync(new URL("../data/phase4-provincial-matching-report.json", import.meta.url), "utf8"));
const copy = () => JSON.parse(JSON.stringify(record));

test("the committed table reconciles with the admitted run", () => {
  assert.deepEqual(validateCauseCrosstab(record, report), []);
});

test("a table that no longer adds up is refused", () => {
  const edited = copy();
  edited.byProvince.BC.intervals["2021-2022"]["no-provincial-match"].none += 1;
  assert.ok(validateCauseCrosstab(edited, report).some((message) => message.includes("totals do not equal")));
  const shifted = copy();
  shifted.byProvince.QC.overlapCells += 1;
  assert.ok(validateCauseCrosstab(shifted, report).some((message) => message.includes("but the run assessed")));
});

test("a table that does not reproduce the admitted run is refused", () => {
  const edited = copy();
  edited.byProvince.QC.reproduction.matchedChanges += 1;
  assert.ok(validateCauseCrosstab(edited, report).some((message) => message.includes("admitted change counts")));
});

test("the table cannot claim a review, a different status, or a kind the run never matched", () => {
  const reviewed = copy();
  reviewed.basis.separatelyReviewed = true;
  assert.ok(validateCauseCrosstab(reviewed, report).some((message) => message.includes("separate review")));
  const admitted = copy();
  admitted.status = "admitted-production";
  assert.ok(validateCauseCrosstab(admitted, report).some((message) => message.includes("view of the admitted run")));
  const insectInBc = copy();
  insectInBc.byProvince.BC.intervals["2021-2022"].insect.none += 5;
  insectInBc.byProvince.BC.totals.insect.none += 5;
  insectInBc.byProvince.BC.overlapCells += 5;
  assert.ok(validateCauseCrosstab(insectInBc, report).some((message) => message.includes("never matched")));
});
