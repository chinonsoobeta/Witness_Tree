import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * C5: the controls above the map are tighter and the map takes more of the
 * first screen, at desktop and phone widths, in both languages.
 */
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const page = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("C5: both Explore pages use the shorter masthead", () => {
  for (const path of ["app/en/explore/page.tsx", "app/fr/explorer/page.tsx"])
    assert.match(page(path), /<header className="masthead explore-masthead">/);
  assert.match(css, /\.explore-masthead \{\n {2}padding-block: 32px 16px;\n\}/);
  assert.match(css, /\.explore-masthead h1 \{\n {2}margin-block: 0 8px;\n\}/);
  // The shared masthead is unchanged for every other page.
  assert.match(css, /\.masthead \{\n {2}padding: 72px 0 28px;/);
});

test("C5: the map is never shorter than before and grows with the screen, canvas and still image alike", () => {
  assert.match(css, /--explore-map-height: clamp\(430px, calc\(100svh - 320px\), 640px\);/);
  assert.match(css, /\.explore-map-canvas \{\n {2}width: 100%;\n {2}height: var\(--explore-map-height\);/);
  assert.match(css, /min-height: var\(--explore-map-height, 430px\);/);
});

test("C5: the toolbar is tighter; the phone's province buttons keep their pinned layout", () => {
  assert.match(css, /\.explore-toolbar \{\n {2}display: flex;\n {2}flex-direction: column;\n {2}gap: 8px;\n {2}padding: 10px 0 8px;/);
  // tests/browser/fallback.spec.ts pins All on its own row and the provinces two by two.
  const phone = css.match(/@media \(max-width: 760px\) \{[\s\S]*?\.explore-map-scale \{/)?.[0] ?? "";
  assert.match(phone, /\.province-bar--map \{\n {4}display: grid;\n {4}grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(phone, /\.province-bar--map button:first-child \{\n {4}grid-column: 1 \/ -1;/);
});
