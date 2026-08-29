import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The legend swatch is CSS and the map fill is a MapLibre paint expression,
// so the ramp is necessarily written twice. This is the only thing stopping
// the two copies from drifting apart.
const css = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const source = readFileSync(
  new URL("../lib/explore/map-style.ts", import.meta.url),
  "utf8",
);

test("the CSS loss ramp matches the map colours it sits beside", () => {
  for (const band of [0, 1, 2, 3]) {
    const token = new RegExp(`--loss-${band}: (#[0-9a-f]{6});`).exec(css);
    const paint = new RegExp(`loss${band}: "(#[0-9a-f]{6})"`).exec(source);
    assert.ok(token, `--loss-${band} is not declared in the palette`);
    assert.ok(paint, `loss${band} is not declared in EXPLORE_MAP_COLOURS`);
    assert.equal(
      token[1],
      paint[1],
      `band ${band} drifted between the legend and the map`,
    );
  }
});

test("the per-cell patch colours match the map fill they sit beside", () => {
  for (const [token, paint] of [
    ["patch-harvest", "harvest"],
    ["patch-fire", "wildfire"],
  ]) {
    const declared = new RegExp(`--${token}: (#[0-9a-f]{6});`).exec(css);
    const painted = new RegExp(`${paint}: "(#[0-9a-f]{6})"`).exec(source);
    assert.ok(declared, `--${token} is not declared in the palette`);
    assert.ok(painted, `${paint} is not declared in EXPLORE_MAP_COLOURS`);
    assert.equal(declared[1], painted[1], `${token} drifted between the legend and the map`);
  }
});

test("the ramp is declared once, in the unthemed palette block", () => {
  assert.equal(css.match(/--loss-0:/g).length, 1);
  // Four legend swatches for the four bands, plus .patch-none, which reuses
  // band 3 on purpose: a detected patch with nothing in the official record
  // is still observed loss, not a fifth category needing a fifth colour.
  assert.equal(css.match(/background: var\(--loss-\d\);/g).length, 5);
  assert.equal(css.match(/\.patch-none \{\n  background: var\(--loss-3\);/g).length, 1);
});
