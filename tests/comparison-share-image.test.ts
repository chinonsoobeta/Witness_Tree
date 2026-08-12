import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { comparisonContext }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/comparison/fixtures.ts";
import { generateComparisonShareImage }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/comparison/share-image.ts";

test("comparison share SVG contains the complete English screenshot context deterministically", () => {
  const first = generateComparisonShareImage(comparisonContext, "en");
  const second = generateComparisonShareImage(comparisonContext, "en");
  assert.equal(first.svg, second.svg);
  assert.equal(first.id, "comparison-summary-en");
  assert.equal(first.filename, "comparison-summary-en.svg");
  assert.match(first.svg, /font-family="BC Sans, sans-serif"/);
  assert.match(first.svg, /aria-labelledby="comparison-summary-en-title comparison-summary-en-description"/);
  assert.match(first.svg, /<title id="comparison-summary-en-title">Witness Tree<\/title>/);
  assert.match(first.svg, /<desc id="comparison-summary-en-description">/);
  for (const value of ["Witness Tree", "2000–2024", "2023 Representation Order", "illustrative-1", "Share of forested hectares at the first year of the range.", "Satellite observation", "Rows are ordered by detected change as a share of forested area."]) assert.match(first.svg, new RegExp(value));
});

test("comparison share SVG uses localized context and XML-escapes all text", () => {
  const context = { ...comparisonContext, timeRange: `2000 < 2024 & "quoted"`, boundaryEdition: "A & B", dataVersion: "v'1", denominatorDefinition: { en: "x", fr: "Part < forêt" }, method: { en: "x", fr: "Méthode & sûre" } };
  const image = generateComparisonShareImage(context, "fr");
  for (const value of ["Arbre témoin", "2000 &lt; 2024 &amp; &quot;quoted&quot;", "A &amp; B", "v&apos;1", "Part &lt; forêt", "Observation satellitaire", "Méthode &amp; sûre"]) assert.match(image.svg, new RegExp(value));
  assert.doesNotMatch(image.id, /Witness Tree|Arbre témoin/);
  assert.doesNotMatch(image.filename, /Witness Tree|Arbre témoin/);
  assert.doesNotMatch(image.svg.match(/ id="([^"]+)"/g)?.join(" ") ?? "", /Witness Tree|Arbre témoin/);
});

test("share SVG colours are immutable named tokens, never direct template literals", () => {
  const source = readFileSync(new URL("../lib/comparison/share-image.ts", import.meta.url), "utf8");
  assert.match(source, /export const COMPARISON_SHARE_IMAGE_COLORS = Object\.freeze/);
  assert.match(source, /COMPARISON_SHARE_IMAGE_COLORS\.canvas/);
  assert.match(source, /COMPARISON_SHARE_IMAGE_COLORS\.text/);
  assert.doesNotMatch(source, /(?:fill|stroke)="#[a-f\d]{3,8}"/i);
});
