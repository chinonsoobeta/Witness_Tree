import assert from "node:assert/strict"; import { readFile } from "node:fs/promises"; import test from "node:test";
import { FOREST_DEFINITION }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/domain/forest.ts";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

// The glossary publishes the forest definition as prose, separately from the constant that drives every
// computation. Prose and constant can drift apart silently, so the published parameters are pinned here.
const publishedParagraph = (source: string, heading: string): string => {
  // Matched on structure, not on formatting: the entry may be written on one line or wrapped.
  const start = source.search(new RegExp(`heading: "${heading}",\\s*paragraphs: \\[`));
  assert.notEqual(start, -1, `The glossary must publish a "${heading}" entry.`);
  const end = source.indexOf("]", source.indexOf("paragraphs: [", start));
  assert.notEqual(end, -1, `The "${heading}" glossary entry must be well formed.`);
  return source.slice(start, end);
};

test("the glossary publishes the forest definition in English and French", async () => {
  const source = await read("../components/governance/GovernancePage.tsx");
  for (const heading of ["Forest", "Forêt"]) {
    const paragraph = publishedParagraph(source, heading);
    assert.ok(paragraph.includes(String(FOREST_DEFINITION.minimumAreaHectares)), `The ${heading} entry must publish the ${FOREST_DEFINITION.minimumAreaHectares} hectare minimum area.`);
    assert.ok(paragraph.includes(String(FOREST_DEFINITION.minimumCrownClosurePercent)), `The ${heading} entry must publish the ${FOREST_DEFINITION.minimumCrownClosurePercent} percent crown closure minimum.`);
    assert.ok(paragraph.includes(String(FOREST_DEFINITION.minimumMatureTreeHeightMetres)), `The ${heading} entry must publish the ${FOREST_DEFINITION.minimumMatureTreeHeightMetres} metre mature height minimum.`);
  }
});

test("the canonical definition carries the same parameters in both languages", () => {
  for (const locale of ["en", "fr"] as const) {
    const text = FOREST_DEFINITION.text[locale];
    assert.ok(text.trim().length > 0, `The canonical forest definition needs ${locale} text.`);
    for (const value of [FOREST_DEFINITION.minimumAreaHectares, FOREST_DEFINITION.minimumCrownClosurePercent, FOREST_DEFINITION.minimumMatureTreeHeightMetres]) {
      assert.ok(text.includes(String(value)), `The ${locale} definition must state ${value}.`);
    }
  }
  assert.notEqual(FOREST_DEFINITION.text.en, FOREST_DEFINITION.text.fr, "The definition must be genuinely translated.");
});

test("both glossary routes are citable and anchor the forest entry", async () => {
  for (const locale of ["en", "fr"] as const) {
    const anchor = FOREST_DEFINITION.glossaryPath[locale];
    assert.match(anchor, /^\/(en|fr)\//, `The ${locale} glossary anchor must be a site-relative route.`);
    assert.ok(anchor.includes("#"), `The ${locale} glossary anchor must address the forest entry directly.`);
  }
  assert.match(await read("../app/en/glossary/page.tsx"), /kind="glossary"[\s\S]*locale="en"|locale="en"[\s\S]*kind="glossary"/);
  assert.match(await read("../app/fr/glossaire/page.tsx"), /kind="glossary"[\s\S]*locale="fr"|locale="fr"[\s\S]*kind="glossary"/);
});
