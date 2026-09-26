#!/usr/bin/env node
// Harvest and fire by province and year. The file is published on the site by
// owner decision, unreviewed, so this checks that nothing claims review or
// release, that every figure is shaped as the decision allows, and that the
// provinces agree with the province span release the Explore page reads.
//
// Without the data root, the inputs are held to their staging entries by
// checksum. With it, the whole file is rebuilt from the four inputs by the same
// function that wrote it and must match byte for byte.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BASELINE_YEAR, CELL_HECTARES, DECISION, FIRST_YEAR, LAST_YEAR, OUTPUT, PROVINCES,
  buildSeries, inputPath, manifestId, readInputs, serialize,
} from "./build-harvest-fire-province-series.mjs";
import { resolveDataRoot } from "./data-root.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(repoRoot, path));
const bytes = read(OUTPUT);
const series = JSON.parse(bytes);
const manifest = JSON.parse(read("data/staged-acquisitions.json"));
const spans = JSON.parse(read("data/phase3-province-span-release.json"));

assert.equal(series.schema, "witness-tree/harvest-fire-province-annual-series/1");
assert.equal(series.status, "owner-published-unreviewed");
assert.equal(series.checkedBy, "scripts/check-harvest-fire-province-series.mjs");
assert.deepEqual(series.claims, { ownerPublished: true, expertReviewed: false, frenchReviewed: false, groundTruthed: false, released: false, productionEligible: false });
assert.equal(series.ownerDecision.record, DECISION);
assert.equal(series.sumRule.record, DECISION);
assert.equal(series.sumRule.allowed, "within-one-product");
assert.ok(existsSync(resolve(repoRoot, DECISION)), "the decision record is missing");
const decision = read(DECISION).toString("utf8");
assert.match(decision, /harvest and fire view only/i, "the decision no longer limits its scope");
assert.match(decision, /never added to each other/i, "the decision no longer forbids adding harvest to fire");
assert.equal(series.cellHectares, CELL_HECTARES);
assert.deepEqual([series.baselineYear, series.firstYear, series.lastYear], [BASELINE_YEAR, FIRST_YEAR, LAST_YEAR]);
assert.equal(series.limits.length, 5);
for (const limit of series.limits) assert.ok(limit.en && limit.fr, "a limit is missing a language");

// Every input is the staged file, by checksum and length.
assert.equal(series.sources.inputs.length, 4);
for (const [i, province] of PROVINCES.entries()) {
  const input = series.sources.inputs[i];
  const entry = manifest.entries.find((candidate) => candidate.id === manifestId(province.key));
  assert.ok(entry, `${province.key}: no staging entry`);
  assert.deepEqual(input, { province: province.id, path: inputPath(province.key), manifestId: entry.id, sha256: entry.sha256, byteLength: entry.byteLength });
  assert.equal(entry.productionEligible, false);
}

assert.deepEqual(series.provinces.map((p) => p.id), PROVINCES.map((p) => p.id));
for (const province of series.provinces) {
  // The same land and the same unmapped part as the span release.
  const span = spans.provinces.find((p) => p.id === province.id);
  assert.ok(span, `${province.code}: not in the span release`);
  assert.equal(province.landCells, span.cells, `${province.code}: land cells differ from the span release`);
  assert.equal(province.unknownCells, span.unmappedCells, `${province.code}: unmapped cells differ from the span release`);

  assert.equal(province.years.length, LAST_YEAR - BASELINE_YEAR + 1);
  const [baseline, ...dated] = province.years;
  assert.equal(baseline.year, BASELINE_YEAR);
  assert.equal(baseline.harvestCells, null, `${province.code}: 1984 must be Unknown, never zero`);
  assert.equal(baseline.fireCells, null, `${province.code}: 1984 must be Unknown, never zero`);
  assert.ok(baseline.unknownReason.en && baseline.unknownReason.fr);
  let datedCells = 0;
  dated.forEach((row, i) => {
    assert.equal(row.year, FIRST_YEAR + i);
    assert.equal(row.coverageGrade, row.year < 2000 ? "extended-record-sparse-official-matching" : "national-baseline");
    for (const key of ["harvestCells", "fireCells"]) assert.ok(Number.isInteger(row[key]) && row[key] >= 0, `${province.code} ${row.year}: ${key}`);
    datedCells += row.harvestCells;
  });
  // Harvest cells can only lie in the mapped part.
  assert.ok(datedCells <= province.landCells - province.unknownCells, `${province.code}: more harvest than mapped land`);
}
for (const text of [bytes.toString("utf8"), decision]) assert.ok(!text.includes("—"), "no em dashes");

// An absent data root is unavailable evidence, not contradicted evidence.
const dataRoot = resolveDataRoot();
const rootPresent = PROVINCES.every((p) => existsSync(resolve(dataRoot, inputPath(p.key))));
if (rootPresent) {
  assert.equal(serialize(buildSeries(readInputs(dataRoot, manifest))), bytes.toString("utf8"), "the series differs from a rebuild from its inputs");
}

const total = (kind, from, to) => series.provinces.map((p) =>
  `${p.code} ${Math.round(p.years.filter((r) => r.year >= from && r.year <= to).reduce((n, r) => n + r[kind], 0) * CELL_HECTARES).toLocaleString("en-CA")}`).join(", ");
console.log(
  `check-harvest-fire-province-series: ok, owner-published and unreviewed; 4 provinces, ${FIRST_YEAR}-${LAST_YEAR}, 1984 Unknown; ` +
  `fire 2015-2019 ha: ${total("fireCells", 2015, 2019)}` +
  (rootPresent ? "; rebuilt from the staged inputs" : " (data root not mounted)"),
);
