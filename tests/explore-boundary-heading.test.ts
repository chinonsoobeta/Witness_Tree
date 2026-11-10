import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * F3: the boundary readout is headed with the kind of boundary and where it
 * lies ("Federal riding · Ontario"), in place of "Boundary" and a
 * "Jurisdiction: Canada" line; the exported image's caption is headed the same way.
 */
const map = readFileSync(new URL("../components/explore/ExploreMapClient.tsx", import.meta.url), "utf8");
const exporter = readFileSync(new URL("../components/explore/TimelapseExport.tsx", import.meta.url), "utf8");

test("F3: every boundary kind is named in both languages", () => {
  for (const [en, fr] of [
    ['"federal-ridings": "Federal riding"', '"federal-ridings": "Circonscription fédérale"'],
    ['"provincial-ridings": "Provincial riding"', '"provincial-ridings": "Circonscription provinciale"'],
    ['"economic-regions": "Economic region"', '"economic-regions": "Région économique"'],
    ['"census-subdivisions": "City or town"', '"census-subdivisions": "Ville ou municipalité"'],
    ['watersheds: "Watershed"', 'watersheds: "Bassin versant"'],
  ]) {
    assert.ok(map.includes(en), en);
    assert.ok(map.includes(fr), fr);
  }
  assert.doesNotMatch(map, /jurisdiction: "Jurisdiction"/);
  assert.doesNotMatch(map, /jurisdiction: "Autorité compétente"/);
});

test("F3: the heading names the province or territory, from the riding id for a federal riding", () => {
  // All thirteen, since the federal ridings cover all of Canada.
  for (const code of ["10", "11", "12", "13", "24", "35", "46", "47", "48", "59", "60", "61", "62"]) {
    assert.match(map, new RegExp(`"${code}": \\{ en: "[^"]+", fr: "[^"]+" \\},`));
  }
  assert.match(map, /"61": \{ en: "Northwest Territories", fr: "Territoires du Nord-Ouest" \},/);
  assert.match(map, /if \(boundary\.overlay === "watersheds"\) return null;/);
  assert.match(map, /const code = boundary\.boundaryId\.slice\(3, 5\);/);
  assert.match(map, /const province = boundaryProvince\(boundary\) \?\? boundary\.jurisdiction;/);
  assert.match(map, /return pruid \? `\$\{kind\} · \$\{PROVINCE_NAME_FOR_PRUID\[pruid\]!\[locale\]\}` : kind;/);
  assert.match(map, /<strong>\{boundaryHeading\(locale, boundary\)\}<\/strong>\n\s+<p>\{boundary\.name\}<\/p>/);
});

test("F3: the exported image is headed as the readout is", () => {
  assert.match(map, /boundaryHeading: boundaryHeading\(locale, timelapseBoundary\),/);
  assert.match(exporter, /boundary: `\$\{hooks\.boundaryHeading\}\. \$\{hooks\.boundarySource\}`\.trim\(\),/);
  assert.doesNotMatch(exporter, /boundary: "Boundary"/);
  assert.doesNotMatch(exporter, /boundary: "Limite"/);
});
