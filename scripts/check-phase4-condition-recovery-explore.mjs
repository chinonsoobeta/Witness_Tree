#!/usr/bin/env node
// The figures Explore "Condition and recovery" would show. They are built, not
// admitted, so this checks two things: that nothing in the file or the module
// claims otherwise, and that every figure agrees with the records it came from.
//
// Without the data root, the province, four-province and cause figures are
// compared with the committed v2 and cause-and-check records, and the per-cell
// tile counts are compared with the figures. With it, the whole file is rebuilt
// from the run output by the same function that wrote it and must match byte for
// byte, and the tile archive is hashed.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CELL_HECTARES, MINIMUM_LOST_HECTARES, OUTPUT, REGION_NAMES, RUN_OUTPUT, buildExploreFigures, serialize } from "./build-phase4-condition-recovery-explore.mjs";
import { resolveDataRoot } from "./data-root.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(repoRoot, path));
const bytes = read(OUTPUT);
const figures = JSON.parse(bytes);
const v2 = JSON.parse(read("data/phase4-condition-recovery-v2.json"));
const causeAndCheck = JSON.parse(read("data/phase4-condition-recovery-cause-and-check.json"));
const SLUGS = { "59": "british-columbia", "48": "alberta", "35": "ontario", "24": "quebec" };
const DECADES = ["1985-1994", "1995-2004", "2005-2014", "2015-2022"];
const CAUSES = ["notRecorded", "fire", "harvest", "fireAndHarvest"];

assert.equal(figures.schema, "witness-tree/phase4-condition-recovery-explore/1");
assert.equal(figures.status, "local-nonproduction");
assert.equal(figures.checkedBy, "scripts/check-phase4-condition-recovery-explore.mjs");
for (const [claim, value] of Object.entries(figures.claims)) assert.equal(value, false, `claims.${claim} must be false`);
assert.deepEqual(Object.keys(figures.claims).sort(), ["admitted", "frenchReviewed", "ownerReviewed", "productionEligible", "released"]);

// The WP3 determination keeps the mode empty until admission happens as an
// event. The module must still fail closed, and the view's empty state must
// still stand.
const moduleSource = read("lib/explore/condition-recovery.ts").toString("utf8");
assert.match(moduleSource, /claims\?\.admitted !== true \|\| release\.claims\?\.ownerReviewed !== true\) return null/);
assert.ok(read("lib/explore/per-cell.ts").toString("utf8").includes("condition-recovery"), "per-cell.ts no longer mentions the mode");

// Both records must describe the same run output.
assert.equal(figures.basedOn.outputSha256, causeAndCheck.basedOn.outputSha256, "the figures and the cause record read different runs");
assert.equal(figures.basedOn.output, RUN_OUTPUT);
assert.equal(figures.set, "A");
assert.deepEqual(figures.treedClasses, v2.run.treedClassSets.A);
assert.equal(figures.cellHectares, CELL_HECTARES);
assert.equal(figures.minimumLostHectares, 500);
assert.equal(MINIMUM_LOST_HECTARES, 500);

const floor = (lost) => lost * CELL_HECTARES < 500;
function checkRow(row) {
  assert.equal(row.unknownCells + row.knownCells, row.maskCells, `${row.id}: unknown plus known is not the whole`);
  assert.ok(row.lostCells <= row.everTreedCells && row.everTreedCells <= row.knownCells, `${row.id}: lost exceeds treed`);
  assert.equal(row.belowFloor, floor(row.lostCells), `${row.id}: floor`);
  for (const key of ["latestRecoveredCells", "anyRecoveredCells", "unconfirmedCells"]) {
    assert.equal(row[key] === null, row.belowFloor, `${row.id}: ${key} must be withheld exactly when below the floor`);
  }
  assert.deepEqual(row.decades.map((d) => d.decade), DECADES);
  assert.deepEqual(row.causes.map((c) => c.cause), CAUSES);
  assert.equal(row.decades.reduce((n, d) => n + d.lostCells, 0), row.lostCells, `${row.id}: decades do not partition lost`);
  assert.equal(row.causes.reduce((n, c) => n + c.lostCells, 0), row.lostCells, `${row.id}: causes do not partition lost`);
  for (const part of [...row.decades, ...row.causes]) {
    assert.equal(part.belowFloor, floor(part.lostCells), `${row.id}: part floor`);
    assert.equal(part.recoveredCells === null, part.belowFloor, `${row.id}: part withheld`);
  }
  const recent = row.decades.find((d) => d.decade === "2015-2022");
  assert.match(recent.note.en, /^Too recent to judge/);
  assert.match(recent.note.fr, /^Trop récent pour conclure/);
  assert.match(row.decades[2].note.en, /^Partial follow-up/);
}

assert.equal(figures.provinces.length, 4);
assert.equal(figures.regions.length, 44);
const all = [figures.fourProvinces, ...figures.provinces, ...figures.regions];
all.forEach(checkRow);

// Provinces equal the committed v2 record and sum exactly to the four-province row.
for (const province of figures.provinces) {
  const slug = SLUGS[province.id];
  const a = v2.provinces[slug].A;
  for (const key of ["maskCells", "unknownCells", "knownCells", "everTreedCells", "lostCells"]) assert.equal(province[key], a[key], `${slug}.${key}`);
  assert.equal(province.latestRecoveredCells, a.latestLoss.recoveredCells, `${slug}: latest`);
  assert.equal(province.anyRecoveredCells, a.anyLoss.recoveredCells, `${slug}: any`);
  assert.equal(province.unconfirmedCells, a.latestLoss.unconfirmedCells, `${slug}: unconfirmed`);
  for (const d of province.decades) assert.equal(d.lostCells, a.byLatestLossDecade[d.decade].lostCells, `${slug} ${d.decade}`);
  for (const c of province.causes) assert.deepEqual(c.lostCells, causeAndCheck.causeOfLatestLoss.provinces[slug].A[c.cause].lostCells, `${slug} ${c.cause}`);
  assert.equal(province.treedWetlandCells, v2.provinces[slug].B.everTreedCells - a.everTreedCells, `${slug}: treed wetland`);
  // Each province's regions hold no more than the province, and all 44 regions
  // are in exactly one province.
  const regions = figures.regions.filter((r) => r.provinceId === province.id);
  assert.equal(regions.length, v2.regions[slug].inProvinceRegions, `${slug}: region count`);
  const regionMask = regions.reduce((n, r) => n + r.maskCells, 0);
  assert.ok(regionMask <= province.maskCells && province.maskCells - regionMask <= v2.regions[slug].cellsInNoRegion + v2.regions[slug].spillRows * v2.regions[slug].maxSpillCells,
    `${slug}: regions leave more of the province uncounted than the v2 record allows`);
}
for (const key of ["maskCells", "unknownCells", "knownCells", "everTreedCells", "lostCells", "latestRecoveredCells", "anyRecoveredCells", "unconfirmedCells"]) {
  assert.equal(figures.fourProvinces[key], figures.provinces.reduce((n, p) => n + p[key], 0), `four provinces: ${key}`);
}
for (const region of figures.regions) {
  assert.match(region.id, /^(59|48|35|24)\d\d$/);
  assert.equal(region.provinceId, region.id.slice(0, 2));
  assert.ok(region.name.en && region.name.fr && !region.name.en.includes(" / ") && !region.name.fr.includes(" / "), region.id);
}

// The RESULTS note carries the recorded figure and never claims the target.
const check = causeAndCheck.resultsCheck;
assert.equal(figures.resultsAgreement.agreement, check.sets.A.agreement);
assert.equal(figures.resultsAgreement.eligiblePolygons, check.sets.A.eligible);
assert.equal(figures.resultsAgreement.target, check.targetAgreement);
assert.equal(figures.resultsAgreement.targetMet, false);
const pctRounded = Math.round(check.sets.A.agreement * 100);
assert.ok(figures.resultsAgreement.note.en.includes(`${pctRounded}%`) && figures.resultsAgreement.note.fr.includes(`${pctRounded} %`));
for (const text of [JSON.stringify(figures), moduleSource]) assert.ok(!text.includes("\u2014"), "no em dashes");

// The per-cell tiles are built locally and never uploaded. Their cell counts,
// taken while polygonizing, must equal the figures: unknown, and each state by
// decade of latest loss.
const tiles = figures.perCellTiles;
assert.ok(tiles, "the per-cell tiles are not recorded");
assert.equal(tiles.uploaded, false);
assert.equal(tiles.layer, "condition_recovery");
assert.equal(tiles.minZoom, 8);
assert.equal(tiles.maxZoom, 14);
assert.equal(tiles.builder, "scripts/phase4_condition_recovery_tiles.py");
assert.equal(createHash("sha256").update(read(tiles.builder)).digest("hex"), tiles.builderSha256, "the tile builder changed after the recorded build");
const code = (c) => tiles.cellsByCode[String(c)] ?? 0;
const four = figures.fourProvinces;
assert.equal(code(10), four.unknownCells, "tiles: unknown cells");
DECADES.forEach((decade, d) => {
  const row = four.decades[d];
  assert.equal(code(40 + d) + code(50 + d) + code(60 + d), row.lostCells, `tiles: lost in ${decade}`);
  assert.equal(code(40 + d), row.recoveredCells, `tiles: recovered in ${decade}`);
  assert.equal(code(60 + d), row.unconfirmedCells, `tiles: unconfirmed in ${decade}`);
});
assert.deepEqual(Object.keys(tiles.cellsByCode).map(Number).sort((x, y) => x - y), [10, 40, 41, 42, 43, 50, 51, 52, 53, 60, 61, 62, 63]);

// An absent data root is unavailable evidence, not contradicted evidence.
const dataRoot = resolveDataRoot();
const rootPresent = existsSync(resolve(dataRoot, RUN_OUTPUT));
let archiveVerified = false;
if (rootPresent) {
  const runBytes = readFileSync(resolve(dataRoot, RUN_OUTPUT));
  const rebuilt = buildExploreFigures({
    run: JSON.parse(runBytes),
    regionFeatures: JSON.parse(readFileSync(resolve(dataRoot, REGION_NAMES))).features,
    causeAndCheck,
    runOutputSha256: createHash("sha256").update(runBytes).digest("hex"),
    tilesManifest: JSON.parse(readFileSync(resolve(dataRoot, tiles.manifest))),
  });
  assert.equal(serialize(rebuilt), bytes.toString("utf8"), "the figures differ from a rebuild from the run output");
  const archive = resolve(dataRoot, tiles.archive.path);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(archive, { highWaterMark: 1 << 24 })) hash.update(chunk);
  assert.equal(hash.digest("hex"), tiles.archive.sha256, "the tile archive differs from the recorded build");
  archiveVerified = true;
}

const share = (row) => ((row.latestRecoveredCells / row.lostCells) * 100).toFixed(1);
console.log(
  `check-phase4-condition-recovery-explore: ok, not admitted; ${figures.provinces.length} provinces and ${figures.regions.length} regions, ` +
  `${figures.regions.filter((r) => r.belowFloor).length} regions withheld under the ${MINIMUM_LOST_HECTARES} ha floor; ` +
  `four provinces ${share(four)}% treed again after the latest loss; tiles recorded, not uploaded` +
  (rootPresent ? `, figures rebuilt from the run output${archiveVerified ? " and tile archive hashed" : ""}` : " (data root not mounted)"),
);
