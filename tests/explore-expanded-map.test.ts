import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const map = read("../components/explore/ExploreMapClient.tsx");
const view = read("../components/explore/ExploreView.tsx");
const css = read("../app/globals.css");
const rule = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} has a rule`);
  return css.slice(start, css.indexOf("}", start));
};

test("G1: the Explore section goes full screen, so the controls come with the map", () => {
  // The section is the stage; the map frame is used only where no stage is given.
  assert.match(view, /<section\n\s*ref=\{stageRef\}\n\s*className=\{expanded \? "explore explore--expanded" : "explore"\}\n\s*data-expanded=\{expanded \?\? undefined\}/);
  assert.match(view, /stageRef=\{stageRef\}\n\s*onExpandedChange=\{setExpanded\}/);
  assert.match(map, /const frame = stageRef\?\.current \?\? mapFrameRef\.current;\n\s*const available = Boolean\(/);
  assert.match(map, /const frame = stageRef\?\.current \?\? mapFrameRef\.current;\n\s*if \(!frame\) return;\n\s*if \(expanded === "page"\)/);
  // Kept on screen: the toolbar (years, Play, Boundaries) and the map section,
  // whose stack holds the province buttons and the legend.
  const hidden = rule(".explore--expanded > :not(.explore-toolbar):not(.explore-workspace),\n.explore--expanded .explore-workspace > :not(.explore-canvas),\n.explore--expanded .explore-canvas > .explore-note,\n.explore--expanded .explore-modes,\n.explore--expanded .explore-mode-status,\n.explore--expanded .query-notice,\n.explore--expanded .year-help");
  assert.match(hidden, /display: none/);
  assert.doesNotMatch(css, /\.explore--expanded[^{]*\.(?:explore-window|explore-year|year-control|year-play|explore-boundaries|province-bar--map)[^{]*\{\s*display: none/);
  assert.match(rule(".explore--expanded > .explore-toolbar"), /order: 0/);
  assert.match(rule(".explore--expanded > .explore-workspace"), /order: 1/);
  assert.match(rule(".explore--expanded .explore-map"), /flex: 1 1 auto/);
  assert.match(rule(".explore--expanded"), /overflow-y: auto/);
  assert.match(rule(".explore--expanded"), /background: var\(--ground\)/);
});

test("G1: the legend folds away and never floats over the map", () => {
  assert.match(map, /id=\{LAYER_PANEL_ID\}\n\s*className="explore-map-layer-panel"\n\s*hidden=\{isFullscreen && !legendOpen\}/);
  assert.match(map, /aria-expanded=\{legendOpen\} aria-controls=\{LAYER_PANEL_ID\} onClick=\{\(\) => setLegendOpen\(\(open\) => !open\)\}/);
  assert.match(map, /legendOpen \? text\[locale\]\.hideLegend : text\[locale\]\.showLegend/);
  assert.match(map, /showLegend: "Show the legend",\n\s*hideLegend: "Hide the legend",/);
  assert.match(map, /showLegend: "Afficher la légende",\n\s*hideLegend: "Masquer la légende",/);
  // A phone starts with it folded.
  assert.match(map, /setLegendOpen\(!window\.matchMedia\("\(max-width: 759px\)"\)\.matches\)/);
  // Beside the map on a wide screen, under it on a narrow one: in flow either way.
  for (const block of css.match(/\.explore--expanded [^{]*explore-map-layer-panel \{[^}]*\}/g) ?? []) {
    assert.doesNotMatch(block, /position: (?:absolute|fixed)/);
  }
  assert.match(css, /\.explore--expanded \.explore-map-stack > \.explore-map-layer-panel \{\n\s*grid-column: 2;\n\s*grid-row: 2;/);
});

test("G2: entering and leaving refit the selection unless the reader moved the map", () => {
  assert.match(map, /if \(!readerMovedRef\.current\) fitMapToView\(focusRef\.current\);/);
  // A drag, wheel or pinch marks the map as moved; code-driven fits do not.
  // Only a move the reader made (one with an input event) counts.
  assert.match(map, /map\.on\("movestart", \(event\) => \{\n\s*if \(!\(event as \{ originalEvent\?: unknown \}\)\.originalEvent\) return;\n\s*readerMovedRef\.current = true;/);
  assert.match(map, /readerMovedRef\.current = true;\n\s*mapRef\.current\?\.zoomIn\(\);/);
  assert.match(map, /readerMovedRef\.current = true;\n\s*mapRef\.current\?\.zoomOut\(\);/);
  assert.match(map, /const zoomToPatches = \(\) => \{\n\s*const map = mapRef\.current;\n\s*if \(!map\) return;\n\s*readerMovedRef\.current = true;/);
  // A province button frames the map again, so it counts as not moved.
  assert.match(map, /setHoveredRegion\(null\);\n\s*readerMovedRef\.current = false;\n\s*fitMapToView\(mapView\);/);
});

test("G3: the in-page map closes with a visible button or Escape, returns focus, and holds the page still", () => {
  assert.match(map, /if \(!fullscreenAvailable\) \{\n\s*expandInPage\(\);/);
  // The page comes back where the reader left it.
  assert.match(map, /const scrolled = pageScrollRef\.current;/);
  assert.match(map, /<button type="button" onClick=\{\(\) => void toggleFullscreen\(\)\}>\{text\[locale\]\.exitFullscreen\}<\/button>/);
  assert.match(map, /if \(expanded !== "page"\) return;\n\s*const closeOnEscape = \(event: KeyboardEvent\) => \{\n\s*if \(event\.key === "Escape"\) setExpanded\(null\);/);
  assert.match(map, /if \(expanded === null\) fullscreenButtonRef\.current\?\.focus\(\{ preventScroll: true \}\);/);
  assert.match(map, /if \(expanded === "page"\) root\.style\.overflow = "hidden";\n\s*restoreScroll = \(\) => \{\n\s*root\.style\.overflow = before;\n\s*window\.scrollTo\(0, scrolled\);/);
  const page = rule('.explore--expanded[data-expanded="page"]');
  assert.match(page, /position: fixed/);
  assert.match(page, /inset: 0/);
  // Leaving the browser's full screen by its own means clears the state too.
  assert.match(map, /setExpanded\(on \? "fullscreen" : current === "fullscreen" \? null : current\);/);
  // The stage hears of every change in the same update as the map.
  assert.match(map, /setExpandedState\(next\);\n\s*onExpandedChangeRef\.current\?\.\(next\);/);
});
