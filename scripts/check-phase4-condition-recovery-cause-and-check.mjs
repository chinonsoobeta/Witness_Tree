#!/usr/bin/env node
// Condition and recovery: what caused each loss, and does an independent source
// agree with our recovery calls? Both come from the v2 run recorded in
// data/phase4-condition-recovery-v2.json, and this checks the record of each.
//
// Cause of the latest loss is read from the NTEMS fire and harvest year rasters
// with a one-year window. A loss with no match is "cause not recorded", never
// "undisturbed", and the window's coverage is kept so it can be judged.
//
// The independent check is BC RESULTS forest cover, on a rule fixed before any
// figure was computed. It did not meet the owner's 80 percent target, and this
// record must keep saying so: the agreement is recomputed from the confusion
// counts, the target flag is recomputed from the agreement, and the figures the
// scoped decision publishes are held to the ones recorded here.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDataRoot } from "./data-root.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SHA256 = /^[a-f0-9]{64}$/;
const CELL_HECTARES = 0.09;
const PROVINCES = ["british-columbia", "alberta", "ontario", "quebec"];
const CAUSES = ["notRecorded", "fire", "harvest", "fireAndHarvest"];
const WORKER = "scripts/phase4_condition_recovery_results_check.py";
const DECISION_HEADING = "## Scoped decision: the treed-again rule for condition and recovery, 2026-09-23";

const read = (path) => readFileSync(resolve(repoRoot, path));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const record = JSON.parse(read("data/phase4-condition-recovery-cause-and-check.json"));
const v2 = JSON.parse(read(record.basedOn.record));

assert.equal(record.schema, "witness-tree/phase4-condition-recovery-cause-and-check-evidence/1");
assert.equal(record.status, "local-nonproduction-executed");
assert.equal(record.checkedBy, "scripts/check-phase4-condition-recovery-cause-and-check.mjs");
for (const claim of ["admitted", "released", "productionEligible", "ownerReviewed", "nfiForestClaimed", "agreementTargetMet"]) {
  assert.equal(record.claims[claim], false, `claims.${claim} must be false`);
}
assert.ok(Array.isArray(record.notMeasured) && record.notMeasured.length >= 4,
  "the record must keep saying what it did not measure");

// The record rests on the v2 run, so it must name the output that record binds.
assert.equal(record.basedOn.record, "data/phase4-condition-recovery-v2.json");
const v2Output = v2.outputs.find((output) => output.slug === "condition-recovery-v2");
assert.equal(record.basedOn.output, v2Output.path);
assert.equal(record.basedOn.outputSha256, v2Output.sha256, "the v2 run this record rests on was replaced");
const decisionDoc = read(record.decision.record).toString("utf8");
assert.ok(decisionDoc.includes(DECISION_HEADING), "the scoped decision this record relies on is gone");
assert.equal(record.decision.headlineSet, "A");

const count = (value, label) => assert.ok(Number.isInteger(value) && value >= 0, `${label} must be a non-negative count`);

// Cause of the latest loss partitions the lost cells of the v2 record exactly,
// and "not recorded" is its own row, never merged into anything else.
const cause = record.causeOfLatestLoss;
assert.equal(cause.windowYears, 1, "the owner fixed a one-year window in advance");
assert.match(cause.rule, /never 'undisturbed'/, "the rule must keep saying an unmatched loss is not undisturbed");
const staged = new Map(JSON.parse(read("data/staged-acquisitions.json")).entries.map((entry) => [entry.id, entry]));
assert.equal(cause.sourceRasters.length, 2);
for (const raster of cause.sourceRasters) {
  assert.equal(raster.sha256, staged.get(raster.stagedId)?.sha256, `${raster.stagedId} digest differs from the staging record`);
}
assert.deepEqual(Object.keys(cause.provinces).sort(), [...PROVINCES].sort());
for (const slug of PROVINCES) {
  for (const set of ["A", "B"]) {
    const rows = cause.provinces[slug][set];
    const label = `${slug}.${set}`;
    assert.deepEqual(Object.keys(rows), CAUSES, `${label}: cause rows`);
    for (const [name, row] of Object.entries(rows)) {
      count(row.lostCells, `${label}.${name}.lostCells`);
      count(row.recoveredCells, `${label}.${name}.recoveredCells`);
      assert.ok(row.recoveredCells <= row.lostCells, `${label}.${name}: more recovered than lost`);
    }
    const v2Total = v2.provinces[slug][set];
    assert.equal(CAUSES.reduce((n, c) => n + rows[c].lostCells, 0), v2Total.lostCells, `${label}: causes do not sum to lost`);
    assert.equal(CAUSES.reduce((n, c) => n + rows[c].recoveredCells, 0), v2Total.latestLoss.recoveredCells,
      `${label}: causes do not sum to recovered`);
    // Every loss the window attributes to fire is a fire or fire-and-harvest row,
    // so the window coverage and the cause table must agree to the cell.
    const w = cause.windowCoverage[slug][set];
    for (const [kind, rowName] of [["fire", "fire"], ["harvest", "harvest"]]) {
      const c = w[kind];
      assert.ok(c.offset0Cells <= c.withinOneYearCells && c.withinOneYearCells <= c.withinTwoYearsCells &&
        c.withinTwoYearsCells <= c.recordedCells, `${label}.${kind}: window counts are not nested`);
      assert.equal(c.withinOneYearCells, rows[rowName].lostCells + rows.fireAndHarvest.lostCells,
        `${label}.${kind}: window coverage disagrees with the cause table`);
    }
  }
}
for (const set of ["A", "B"]) {
  for (const name of CAUSES) {
    for (const field of ["lostCells", "recoveredCells"]) {
      assert.equal(cause.fourProvinces[set][name][field],
        PROVINCES.reduce((n, slug) => n + cause.provinces[slug][set][name][field], 0), `fourProvinces.${set}.${name}.${field}`);
    }
  }
}

// The independent check. Agreement is recomputed from the confusion counts, and
// "met" from the agreement, so neither can be edited into a pass.
const check = record.resultsCheck;
assert.equal(check.targetAgreement, 0.8);
assert.equal(check.run.worker, WORKER);
assert.equal(sha256(read(WORKER)), check.run.workerSha256, "the RESULTS worker changed after the recorded run");
assert.equal(check.source.licenceId, "ogl-bc");
assert.match(check.source.attribution, /Open Government Licence .{1,3} British Columbia/);
assert.equal(check.source.stagedAcquisition, false);
function agreementOf(confusion) {
  const eligible = confusion.regenerated[0] + confusion.regenerated[1] + confusion.notRestocked[0] + confusion.notRestocked[1];
  return {
    eligible,
    agreement: (confusion.regenerated[0] + confusion.notRestocked[1]) / eligible,
    regenerated: confusion.regenerated[0] / (confusion.regenerated[0] + confusion.regenerated[1]),
    notRestocked: confusion.notRestocked[1] / (confusion.notRestocked[0] + confusion.notRestocked[1]),
  };
}
const close = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-12, `${label}: recorded ${b}, recomputed ${a}`);
for (const set of ["A", "B"]) {
  const s = check.sets[set];
  const got = agreementOf(s.confusion);
  assert.equal(s.eligible, got.eligible, `${set}: eligible`);
  close(got.agreement, s.agreement, `${set}: agreement`);
  close(got.regenerated, s.agreementByReferenceClass.regenerated, `${set}: regenerated agreement`);
  close(got.notRestocked, s.agreementByReferenceClass.notRestocked, `${set}: not-restocked agreement`);
  const q = check.reference.qualifying;
  for (const cls of ["regenerated", "notRestocked"]) {
    assert.equal(s.confusion[cls][0] + s.confusion[cls][1] + s.tooFewLostCells[cls] + s.outsideRaster[cls], q[cls],
      `${set}.${cls}: qualifying polygons are not all accounted for`);
  }
  const post = s.postHoc.latestLossMostlyBeforeReferenceYear;
  assert.match(s.postHoc.label, /not a pass criterion/);
  close(agreementOf(post.confusion).agreement, post.agreement, `${set}: post-hoc agreement`);
  assert.ok(post.eligible <= s.eligible, `${set}: the post-hoc subset is larger than the whole`);
}
const headline = check.sets.A;
assert.equal(check.targetMet, headline.agreement >= check.targetAgreement, "targetMet does not follow from the agreement");
assert.equal(check.targetMet, false, "the recorded run did not meet the target; a pass needs a new run and a new record");
const ref = check.reference;
assert.equal(ref.uniqueObjectIds + ref.repeatedObjectIds, ref.featuresRead, "reference feature counts do not add up");

// The scoped decision publishes these figures. They must be the ones recorded here.
const pct = (x) => (x * 100).toFixed(1);
const fmt = (n) => n.toLocaleString("en-CA");
const flat = decisionDoc.replace(/\s+/g, " ");
const expectRow = (cls, n, x) => assert.ok(flat.includes(`| ${cls} | ${fmt(n)} | ${pct(x)} |`),
  `the decision's ${cls} row no longer matches the record (${fmt(n)}, ${pct(x)})`);
expectRow("All", headline.eligible, headline.agreement);
expectRow("Not restocked", headline.confusion.notRestocked[0] + headline.confusion.notRestocked[1],
  headline.agreementByReferenceClass.notRestocked);
expectRow("Regenerated", headline.confusion.regenerated[0] + headline.confusion.regenerated[1],
  headline.agreementByReferenceClass.regenerated);
assert.ok(flat.includes(`${fmt(ref.uniqueObjectIds)} features`), "the decision's feature count no longer matches the record");
const post = headline.postHoc.latestLossMostlyBeforeReferenceYear;
assert.ok(flat.includes(`In ${Math.round(post.latestLossMostlyAfterReferenceYear.regenerated.share * 100)} percent of regenerated`),
  "the decision's after-the-survey share no longer matches the record");
assert.ok(flat.includes(`to about ${Math.round(post.agreement * 100)} percent`),
  "the decision's post-hoc agreement no longer matches the record");

const outputs = Object.fromEntries(check.outputs.map((output) => [output.slug, output]));
const raw = check.raw;
for (const input of [raw.manifest, ...raw.fetchScripts, ...check.outputs]) {
  assert.match(input.sha256, SHA256, `${input.slug} sha256`);
  assert.ok(!input.path.startsWith("/"), `${input.slug} path must be relative to the data root`);
}

const dataRoot = resolveDataRoot();
const rootPresent = existsSync(dataRoot);
let verified = 0;
let rederived = false;
if (rootPresent) {
  for (const input of [raw.manifest, ...raw.fetchScripts, ...check.outputs]) {
    const path = resolve(dataRoot, input.path);
    assert.ok(existsSync(path), `the data root is attached but does not hold ${input.slug} at ${input.path}`);
    assert.equal(statSync(path).size, input.byteLength, `${input.slug} byte length changed`);
    assert.equal(sha256(readFileSync(path)), input.sha256, `${input.slug} content changed`);
    verified += 1;
  }
  // Every page the manifest lists is hashed, so a page swapped after the run fails.
  const pages = readFileSync(resolve(dataRoot, raw.manifest.path), "utf8").trim().split("\n")
    .map((line) => line.split(/ +/)).filter(([, name]) => name.startsWith("pages/"));
  assert.equal(pages.length, raw.pageFiles, "the manifest lists a different number of pages");
  let pageBytes = 0;
  for (const [digest, name] of pages) {
    const bytes = readFileSync(resolve(dataRoot, raw.directory, name));
    assert.equal(sha256(bytes), digest, `${name} content changed`);
    pageBytes += bytes.length;
    verified += 1;
  }
  assert.equal(pageBytes, raw.pageBytes, "the pages' total size changed");

  // Both halves are re-read from the run outputs rather than trusted.
  const v2Path = resolve(dataRoot, record.basedOn.output);
  assert.equal(sha256(readFileSync(v2Path)), record.basedOn.outputSha256, "the v2 run output changed");
  const run = JSON.parse(readFileSync(v2Path, "utf8"));
  for (const slug of PROVINCES) {
    for (const set of ["A", "B"]) {
      const s = run.provinces[slug].sets[set];
      assert.deepEqual(cause.provinces[slug][set], s.total.causeOfLatestLoss, `${slug}.${set}: cause differs from the run output`);
      const h = s.lossToDisturbanceOffsetHistogram;
      for (const kind of ["fire", "harvest"]) {
        const at = (offset) => h[kind][offset - h.offsetsFrom];
        const w = cause.windowCoverage[slug][set][kind];
        assert.equal(w.recordedCells, h[kind].reduce((n, v) => n + v, 0), `${slug}.${set}.${kind}: recorded`);
        assert.equal(w.offset0Cells, at(0), `${slug}.${set}.${kind}: offset 0`);
        assert.equal(w.withinOneYearCells, at(-1) + at(0) + at(1), `${slug}.${set}.${kind}: within one year`);
        assert.equal(w.withinTwoYearsCells, [-2, -1, 0, 1, 2].reduce((n, o) => n + at(o), 0), `${slug}.${set}.${kind}: within two years`);
      }
    }
  }
  const result = JSON.parse(readFileSync(resolve(dataRoot, outputs["results-agreement"].path), "utf8"));
  assert.equal(result.workerSha256, check.run.workerSha256, "the RESULTS run was not made by the bound worker");
  assert.equal(result.executedAt, check.run.executedAt);
  assert.deepEqual(result.reference, check.reference, "reference counts differ from the run output");
  assert.deepEqual(result.sets, check.sets, "agreement figures differ from the run output");
  rederived = true;
}

const four = cause.fourProvinces.A;
const lost = CAUSES.reduce((n, c) => n + four[c].lostCells, 0);
console.log(
  `check-phase4-condition-recovery-cause-and-check: ok, cause not recorded for ` +
  `${pct(four.notRecorded.lostCells / lost)}% of ${(lost * CELL_HECTARES / 1e6).toFixed(2)}M ha lost; RESULTS agreement ` +
  `${pct(headline.agreement)}% of ${fmt(headline.eligible)} polygons, below the ${pct(check.targetAgreement)}% target` +
  `, ${verified} files verified against bytes` +
  (rederived ? ", cause and agreement re-read from the runs" : "") +
  (rootPresent ? "" : " (data root not mounted)"),
);
