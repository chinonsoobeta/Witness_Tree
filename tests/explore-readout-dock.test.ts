import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * F4: the pinned boundary readout is compact over a wide map, and docked under
 * the map on a narrow frame instead of covering a third of it. In the expanded
 * map it stays over the map, which fills the screen there.
 */
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const status = css.match(/\n\.explore-map-boundary-status \{[\s\S]*?\n\}/)?.[0] ?? "";

test("F4: compact over a wide map, and never taller than the map leaves room for", () => {
  assert.match(status, /max-width: min\(300px, calc\(100% - 24px\)\);/);
  assert.match(status, /max-height: calc\(100% - 140px\);\n {2}overflow-y: auto;/);
  assert.match(status, /display: flex;\n {2}flex-wrap: wrap;/);
  assert.match(status, /line-height: 1\.35;/);
  assert.match(css, /\.explore-map-boundary-status p \{\n {2}margin: 0;\n\}/);
});

test("F4: docked under the map on a narrow frame, with the map controls kept on the map", () => {
  const dock = css.match(/\/\* F4: on a narrow frame the boundary readout is docked under the map\. \*\/\n@media \(max-width: 760px\) \{[\s\S]*?\n\}\n/)?.[0] ?? "";
  assert.match(dock, /\.explore:not\(\.explore--expanded\) \.explore-map-boundary-status \{\n {4}position: static;\n {4}max-width: none;\n {4}max-height: none;/);
  assert.match(dock, /\.explore:not\(\.explore--expanded\) \.explore-map-controls \{\n {4}inset-block: var\(--explore-map-height\) auto;\n {4}translate: 0 calc\(-100% - 12px\);/);
  // The phone frame's height is the one variable the canvas, the still map and the controls read.
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*?\.explore-map \{\n {4}--explore-map-height: 30rem;\n {2}\}/);
  assert.doesNotMatch(css, /\.explore-map-canvas \{\n {4}height: 30rem;/);
});
