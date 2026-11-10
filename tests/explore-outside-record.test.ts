import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * F6: federal ridings are drawn across Canada, but the record covers four
 * provinces. A riding elsewhere says so in the readout, with no Unknown
 * figures, place link or animation offered for it; the ridings stay drawn.
 */
const map = readFileSync(new URL("../components/explore/ExploreMapClient.tsx", import.meta.url), "utf8");

test("F6: a federal riding outside the four provinces is found from its id", () => {
  const outside = map.match(/const outsideRecord = [\s\S]*?\n\};/)?.[0] ?? "";
  assert.match(outside, /if \(boundary\.overlay !== "federal-ridings"\) return false;/);
  assert.match(outside, /return pruid !== null && !\(pruid in PROVINCE_CODE_FOR_PRUID\);/);
  assert.match(map, /const PROVINCE_CODE_FOR_PRUID: Readonly<Record<string, string>> = \{ "59": "BC", "48": "AB", "35": "ON", "24": "QC" \};/);
});

test("F6: the readout says why there are no figures, in both languages, and offers nothing that would be empty", () => {
  assert.ok(map.includes('"No figures here. The record covers British Columbia, Alberta, Ontario and Québec only; this riding is drawn to show where it lies."'));
  assert.ok(map.includes('"Aucun chiffre ici. Le registre ne couvre que la Colombie-Britannique, l’Alberta, l’Ontario et le Québec\\u202F; cette circonscription est tracée pour montrer où elle se trouve."'));
  assert.match(map, /<p>\{boundary\.name\}<\/p>\n\s+\{outsideRecord\(boundary\) \? <p>\{text\[locale\]\.outsideRecord\}<\/p> : null\}/);
  assert.match(map, /const readout = boundary && !outsideRecord\(boundary\) && \(placeState === null/);
  assert.match(map, /pinnedBoundary && !outsideRecord\(pinnedBoundary\) &&\n\s+\(MEASURED_BOUNDARY_OVERLAYS/);
});

test("F6: the federal ridings are still drawn everywhere", () => {
  // No filter narrows the riding outline layers to the four provinces.
  assert.doesNotMatch(map, /outsideRecord\([^)]*\)[^\n]*setFilter/);
  assert.match(map, /const ridings = BOUNDARY_OVERLAYS\["federal-ridings"\];/);
});
