#!/usr/bin/env node
// The land-cover product maps forested ecosystems, not Canada, so part of every
// covered province carries Unknown rather than a measurement. This checks the
// record that measures that gap with an independent global product.
//
// The record is only ever allowed to say how big the gap is. It may not close
// it, may not be added to a land-cover figure, and may not be admitted. Those
// are the assertions that matter here; the arithmetic is checked so a number
// cannot drift away from the hectares it was derived from.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const recordPath = resolve(repoRoot, "data/phase2-vlce2-mapped-extent-gap-measurement.json");
const DEFAULT_DATA_ROOT = resolve(repoRoot, "../../Witness_Tree-data");
const SHA256 = /^[a-f0-9]{64}$/;
const THRESHOLDS = ["10", "20", "30", "50"];
const PROVINCES = ["Alberta", "British Columbia", "Ontario", "Quebec"];
const ACQUISITIONS = new Set(["2026-08-25", "2026-09-02"]);

function fail(message) {
  console.error(`check-vlce2-mapped-extent-gap-measurement: ${message}`);
  process.exit(1);
}

const record = JSON.parse(readFileSync(recordPath, "utf8"));

assert.equal(record.schema, "witness-tree/vlce2-mapped-extent-gap-measurement/1");
assert.equal(record.status, "local-nonproduction-executed");

// A measurement of the gap is not coverage of it, and Hansen figures are not
// land-cover figures. If any of these ever reads true, the record is claiming
// something it did not do.
for (const claim of ["admitted", "released", "productionEligible", "summedWithVlce2", "closesTheGap"]) {
  assert.equal(record.claims[claim], false, `claims.${claim} must be false`);
}
assert.match(record.source.attribution, /Hansen\/UMD\/Google\/USGS\/NASA/);
assert.equal(record.source.licence, "CC BY 4.0");

// Hansen begins in 2001, so the earlier years carry no independent measurement
// and must not be implied to.
assert.equal(record.window.fromYear, 2001);
assert.equal(record.window.toYear, 2022);
assert.match(record.window.note, /1984-2000 has no independent measurement/);

assert.deepEqual(Object.keys(record.provinces).sort(), PROVINCES);

for (const [name, p] of Object.entries(record.provinces)) {
  for (const side of ["insideMappedExtent", "outsideMappedExtent"]) {
    const s = p[side];
    assert.ok(Number.isFinite(s.landHectares) && s.landHectares >= 0, `${name} ${side} land`);
    assert.deepEqual(Object.keys(s.forestHectaresByThreshold).sort(), THRESHOLDS.slice().sort());
    assert.deepEqual(Object.keys(s.lossHectaresByThreshold).sort(), THRESHOLDS.slice().sort());
    let previousForest = Infinity;
    for (const t of THRESHOLDS) {
      const forest = s.forestHectaresByThreshold[t];
      const loss = s.lossHectaresByThreshold[t];
      assert.ok(forest >= 0 && loss >= 0, `${name} ${side} ${t} must not be negative`);
      assert.ok(loss <= forest + 1e-6, `${name} ${side} ${t} loses more forest than it has`);
      assert.ok(forest <= s.landHectares + 1e-6, `${name} ${side} ${t} forest exceeds land`);
      // A higher tree-cover threshold selects a subset, so forest can only shrink.
      assert.ok(forest <= previousForest + 1e-6, `${name} ${side} forest grew at threshold ${t}`);
      previousForest = forest;
    }
  }
  // The published ratio must follow from the hectares beside it, so a headline
  // number cannot drift away from the measurement it summarises.
  for (const t of THRESHOLDS) {
    const inside = p.insideMappedExtent.lossHectaresByThreshold[t];
    const outside = p.outsideMappedExtent.lossHectaresByThreshold[t];
    const stated = p.gapLossAsPercentOfInsideLossByThreshold[t];
    if (inside === 0) {
      assert.equal(stated, null, `${name} ${t} has no denominator and must state null`);
      continue;
    }
    const computed = (outside / inside) * 100;
    assert.ok(Math.abs(computed - stated) < 1e-6,
      `${name} ${t} states ${stated} but its hectares give ${computed}`);
  }
}

// Every layer file the run opened must be bound, or an input could change
// without the record noticing.
const tiles = record.tiles;
assert.ok(Array.isArray(tiles) && tiles.length > 0, "tiles must be a non-empty list");
const expected = [];
for (const tile of tiles) {
  for (const layer of ["lossyear", "datamask", "treecover2000"]) {
    expected.push(`Hansen_GFC-2024-v1.12_${layer}_${tile}.tif`);
  }
}
assert.deepEqual(Object.keys(record.tileChecksums).sort(), expected.slice().sort(),
  "tileChecksums must cover exactly the three layers of every tile read");

const dataRoot = resolve(process.env.WITNESS_TREE_DATA_ROOT ?? DEFAULT_DATA_ROOT);
assert.ok(isAbsolute(dataRoot), "data root must be absolute");
let verified = 0;
const rootPresent = existsSync(dataRoot);
for (const [name, bound] of Object.entries(record.tileChecksums)) {
  assert.match(bound.sha256, SHA256, `${name} sha256`);
  assert.ok(Number.isInteger(bound.bytes) && bound.bytes > 0, `${name} bytes`);
  assert.ok(ACQUISITIONS.has(bound.acquisition), `${name} acquisition ${bound.acquisition}`);
  const path = resolve(dataRoot, `raw/hansen-gfc-v1.12-2024/${bound.acquisition}/${name}`);
  if (!rootPresent || !existsSync(path)) continue;
  if (statSync(path).size !== bound.bytes) fail(`${name} byte length changed`);
  if (createHash("sha256").update(readFileSync(path)).digest("hex") !== bound.sha256) {
    fail(`${name} content changed`);
  }
  verified += 1;
}

// An absent data root is unavailable evidence, not contradicted evidence. The
// structural assertions above still ran, so this reports rather than passes
// silently or fails on a machine that never had the archive.
console.log(
  `check-vlce2-mapped-extent-gap-measurement: ok, ${Object.keys(record.tileChecksums).length} ` +
  `inputs bound across ${tiles.length} tiles, ${verified} verified against bytes` +
  (rootPresent ? "" : " (data root not mounted)")
);
