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
import { resolveDataRoot } from "./data-root.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const recordPath = resolve(repoRoot, "data/phase2-vlce2-mapped-extent-gap-measurement.json");
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

// Resolving the archive relative to the repository made the answer depend on where the
// worktree happened to sit: from a checkout that is not beside the data directory this read
// "not mounted" and skipped every byte, on a machine where the archive was attached the
// whole time. The shared helper is the one place that knows where the root actually is.
const dataRoot = resolveDataRoot();
assert.ok(isAbsolute(dataRoot), "data root must be absolute");
const rootPresent = existsSync(dataRoot);

// The sibling Hansen sample profile bound a tile that lay entirely outside the province it
// was labelled for. This record cannot repeat that exactly, because it clips one shared tile
// set rather than labelling a tile per province. Its version of the same defect is a province
// reaching past the tile set and being truncated, which would understate that province's gap
// with every number still well formed. The coverage audit measures the overlap; what follows
// makes it binding. It runs before the byte verification below so that a coverage failure
// reports in seconds rather than behind a full pass over the archive.
const coverage = record.tileCoverageAudit;
assert.ok(coverage && typeof coverage === "object",
  "the record carries no tileCoverageAudit, so nothing establishes that its tiles cover its provinces");
assert.equal(coverage.schema, "witness-tree/vlce2-gap-tile-coverage-audit/1");
assert.equal(coverage.builtBy, "scripts/audit-vlce2-gap-tile-coverage.py");

// Provinces come from the geometry the published map binds, not from a list written beside
// the audit, so coverage cannot be measured against a different Canada.
const mapRelease = JSON.parse(
  readFileSync(resolve(repoRoot, "data/phase8-province-map-release.json"), "utf8"),
);
assert.equal(coverage.geometrySource.boundRecord, "data/phase8-province-map-release.json");
assert.equal(
  coverage.geometrySource.sha256,
  mapRelease.browserCompatibilityOutput.displayGeometry.parentSha256,
  "coverage audit is not measured against the geometry the Phase 8 map release binds",
);

const overlaps = coverage.overlapHectaresByProvince;
assert.deepEqual(Object.keys(overlaps).sort(), PROVINCES,
  "coverage must be measured for exactly the provinces the record reports");
assert.ok(Number.isFinite(coverage.thresholdHectares) && coverage.thresholdHectares > 0,
  "coverage threshold must be a positive area");

// Recomputed from the table rather than read, so neither list can be trimmed on its own.
const maxByTile = new Map();
for (const [province, tilesForProvince] of Object.entries(overlaps)) {
  for (const [tile, hectares] of Object.entries(tilesForProvince)) {
    assert.ok(Number.isFinite(hectares) && hectares >= 0, `${province} ${tile} overlap`);
    maxByTile.set(tile, Math.max(maxByTile.get(tile) ?? 0, hectares));
  }
}
const required = [...maxByTile].filter(([, ha]) => ha > coverage.thresholdHectares).map(([t]) => t);
assert.deepEqual(coverage.requiredTiles.slice().sort(), required.slice().sort(),
  "requiredTiles does not follow from the measured overlaps");
const below = [...maxByTile].filter(([, ha]) => ha <= coverage.thresholdHectares);
assert.deepEqual(coverage.belowThresholdTiles, Object.fromEntries(below.slice().sort()),
  "belowThresholdTiles does not follow from the measured overlaps");

// The finding this record rests on.
const runTiles = new Set(tiles);
const omitted = required.filter((tile) => !runTiles.has(tile));
assert.deepEqual(omitted, [],
  `a province reaches ${omitted.join(", ")} in area, but the run never opened it`);
for (const tile of tiles) {
  assert.ok(maxByTile.has(tile), `the run opened ${tile}, which no covered province touches`);
}

// A threshold slid upward could excuse a genuinely missing tile. Requiring two orders of
// magnitude of clear air between the smallest tile kept and the largest one dropped means the
// cut has to stay in the gap between a real tile and a boundary sliver.
const smallestKept = Math.min(...required.map((tile) => maxByTile.get(tile)));
const largestDropped = below.length === 0 ? 0 : Math.max(...below.map(([, ha]) => ha));
assert.ok(smallestKept > largestDropped * 100,
  `the coverage threshold does not separate tiles from slivers: smallest kept ${smallestKept} ha, largest dropped ${largestDropped} ha`);

// Independent of the audit's arithmetic: derive each province envelope from the bound geometry
// here, and require every overlap the audit claims to be geometrically possible. A detached
// archive skips this; an attached archive that does not hold the geometry the map release binds
// is contradicting the record rather than withholding it, and fails.
let envelopesDerived = false;
if (rootPresent) {
  const geometryPath = resolve(
    dataRoot,
    `derived/phase8-province-map-geojson-v1/${coverage.geometrySource.sha256}/phase2-province-loss-2020-2022.geojson`,
  );
  assert.ok(existsSync(geometryPath),
    "the data root is attached but does not hold the province geometry the Phase 8 map release binds");
  const bytes = readFileSync(geometryPath);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), coverage.geometrySource.sha256,
    "province geometry does not match the checksum the Phase 8 map release binds");
  const derived = new Map();
  for (const feature of JSON.parse(bytes.toString("utf8")).features) {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    const walk = (node) => {
      if (typeof node[0] === "number") {
        box[0] = Math.min(box[0], node[0]);
        box[1] = Math.min(box[1], node[1]);
        box[2] = Math.max(box[2], node[0]);
        box[3] = Math.max(box[3], node[1]);
        return;
      }
      for (const child of node) walk(child);
    };
    walk(feature.geometry.coordinates);
    derived.set(feature.properties.province_name_en, box);
  }
  assert.deepEqual([...derived.keys()].sort(), PROVINCES,
    "the bound geometry does not hold exactly the provinces the record reports");
  for (const [province, box] of derived) {
    const recorded = coverage.provinceEnvelopesWgs84[province];
    assert.ok(Array.isArray(recorded) && recorded.length === 4, `${province} envelope`);
    for (let corner = 0; corner < 4; corner += 1) {
      assert.ok(Math.abs(recorded[corner] - box[corner]) < 1e-6,
        `${province} envelope corner ${corner} states ${recorded[corner]} but the bound geometry gives ${box[corner]}`);
    }
    const [minX, minY, maxX, maxY] = box;
    for (const [tile, hectares] of Object.entries(overlaps[province])) {
      if (hectares <= 0) continue;
      const match = /^(\d{2})N_(\d{3})W$/.exec(tile);
      assert.ok(match, `${tile} is not a Hansen grid tile name`);
      const tileMaxY = Number(match[1]);
      const tileMinX = -Number(match[2]);
      const overlapX = Math.min(tileMinX + 10, maxX) - Math.max(tileMinX, minX);
      const overlapY = Math.min(tileMaxY, maxY) - Math.max(tileMaxY - 10, minY);
      assert.ok(overlapX > 0 && overlapY > 0,
        `${province} claims ${hectares} ha in ${tile}, which its own bounds cannot reach`);
    }
  }
  envelopesDerived = true;
}

let verified = 0;
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
  `, ${coverage.requiredTiles.length} tiles required by area and all present` +
  (envelopesDerived ? ", envelopes derived from bound geometry" : "") +
  (rootPresent ? "" : " (data root not mounted)")
);
