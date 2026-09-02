/**
 * Measuring a drawn area produces a number someone will quote. These are the
 * properties that keep it either right or visibly uncertain.
 *
 * Three failures here would all look like success. A count taken from the map
 * tiles instead of the grid would be plausible and wrong, because the rendered
 * tiles are simplified for drawing. An estimate printed without its bracket
 * would read as a measurement when a shape's edge blocks are guesses. And the
 * sum expressed as a percentage would double-count repeat disturbance into a
 * share, which is the one arithmetic the record does not support.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");
const fail = (message: string): never => {
  throw new Error(message);
};

const ROUTE = "/api/shape/measure";
const FLAG_HEADER = "x-witness-tree-shape";
const GRID_BINDING = "COARSE_GRID_BASE";

const route = read("worker/shape.ts");
const coverage = read("lib/shapes/coverage.ts");
const measure = read("lib/shapes/measure.ts");
const tiles = read("lib/shapes/tiles.ts");
const client = read("components/explore/ShapeMeasureClient.tsx");
const worker = read("worker/index.ts");
const draw = read("components/explore/ShapeDrawMap.tsx");

// 1. The counts come from the packed grid, never from the tiles being drawn on.
if (!route.includes("tileName(") || !route.includes("decodeTile(")) {
  fail("worker/shape.ts must read the packed grid tiles rather than any other source.");
}
for (const forbidden of ["maplibre", "pmtiles", "queryRenderedFeatures", "querySourceFeatures"]) {
  if (route.includes(forbidden) || measure.includes(forbidden) || coverage.includes(forbidden)) {
    fail(`the measurement must not read ${forbidden}: rendered tiles are simplified and would answer wrongly.`);
  }
}

// 2. A tile that does not agree with itself is refused, not partly decoded.
for (const guard of [
  "The tile is shorter than its own header.",
  "The tile is not a coarse-grid tile.",
  "The tile ends inside a block.",
  "The tile carries bytes after its last block.",
]) {
  if (!tiles.includes(guard)) fail(`lib/shapes/tiles.ts must refuse a tile that ${guard.toLowerCase()}`);
}
if (!tiles.includes("counts more cells than a block holds")) {
  fail("lib/shapes/tiles.ts must refuse a block claiming more cells than a block holds.");
}

// 3. The shape never enters a URL, a query string, or the page's history.
if (!route.includes("request.json()")) fail("worker/shape.ts must read the shape from the body.");
if (/url\.searchParams|new URLSearchParams/.test(route)) {
  fail("worker/shape.ts must not put any part of the shape in a query string.");
}
for (const forbidden of ["history.pushState", "history.replaceState", "router.push", "router.replace"]) {
  if (client.includes(forbidden)) fail(`the drawing control must not write the shape into history with ${forbidden}.`);
}
if (/<form[^>]*action=/.test(client)) fail("the drawing form must not navigate with the shape in the query.");
if (!client.includes('method: "POST"')) fail("the drawing control must POST the shape.");

// 4. The route answers nothing at all when the grid is not configured.
if (!route.includes(GRID_BINDING)) fail(`worker/shape.ts must read ${GRID_BINDING}.`);
if (!route.includes("Shape measurement is not configured.")) {
  fail("worker/shape.ts must refuse when the grid is not configured rather than answering from nothing.");
}
if (!route.includes('"Cache-Control": "no-store"')) fail("worker/shape.ts must answer no-store.");
if (!route.includes('request.method !== "POST"')) fail("worker/shape.ts must be POST only.");
if (!route.includes(`"${ROUTE}"`)) fail(`worker/shape.ts must serve ${ROUTE}.`);
if (!route.includes(`"${FLAG_HEADER}"`)) fail(`worker/shape.ts must define the ${FLAG_HEADER} flag.`);
if (!worker.includes("SHAPE_MEASURE_PATH") || !worker.includes("withShapeFlag(")) {
  fail("worker/index.ts must route the measurement and stamp the flag.");
}
if (worker.indexOf("SHAPE_MEASURE_PATH") > worker.indexOf("handler.fetch(stamped")) {
  fail("worker/index.ts must handle the measurement before the app router sees it.");
}

// 5. The answer carries its own precision, and the estimate never travels alone.
for (const field of ["low", "estimate", "high"]) {
  if (!measure.includes(`${field}:`)) fail(`lib/shapes/measure.ts must report ${field} with every amount.`);
}
if (!measure.includes("blocksWithoutData")) {
  fail("lib/shapes/measure.ts must count blocks it has no data for rather than treating them as no loss.");
}
if (!measure.includes("edgeShareOfEstimate")) {
  fail("lib/shapes/measure.ts must report how much of the estimate came from partial blocks.");
}
if (!client.includes("precisionEdge") || !client.includes("precisionExact")) {
  fail("the drawing control must state whether its answer is a count or an estimate.");
}
if (!client.includes("bracket(measurement.unionHectares)")) {
  fail("the drawing control must show the union's range beside its estimate.");
}

// 6. The union may be a share of the forest. The sum may never be.
if (!measure.includes("unionShareOfForest")) fail("lib/shapes/measure.ts must name the share as being of the union.");
if (/sum\w*Share|shareOfForest.*sum/i.test(measure)) {
  fail("the sum double-counts repeat disturbance and must never be expressed as a share.");
}
if (!client.includes("counted twice") || !client.includes("counted once")) {
  fail("the drawing control must say plainly that the two numbers count differently.");
}
if (!client.includes("compté une seule fois") || !client.includes("compté deux fois")) {
  fail("the French copy must draw the same distinction between the two numbers.");
}

// 7. A shape the grid cannot answer is refused by kind, not answered badly.
for (const kind of ["too-few-vertices", "not-finite", "off-grid", "too-large", "too-spread-out", "no-area"]) {
  if (!coverage.includes(`"${kind}"`)) fail(`lib/shapes/coverage.ts must be able to refuse a shape as ${kind}.`);
}
if (!coverage.includes("MAX_SHAPE_HECTARES") || !coverage.includes("MAX_SHAPE_BLOCKS")) {
  fail("lib/shapes/coverage.ts must cap both the area and the reach of a shape.");
}
if (!route.includes("MAX_SHAPE_TILES") || !route.includes("MAX_SHAPE_VERTICES")) {
  fail("worker/shape.ts must cap the tiles fetched and the vertices accepted.");
}

// 8. An edge block is weighted by its exact intersection, not rounded in or out.
if (!/function clipToBox\(/.test(coverage) || !/function shoelaceArea\(/.test(coverage)) {
  fail("lib/shapes/coverage.ts must measure an edge block by exact intersection.");
}
if (coverage.includes("Math.round(fraction)")) {
  fail("an edge block must not be rounded wholly in or out of the shape.");
}

// 9. The pointer surface is an extra way in, never the only one, and it feeds
// the same fields rather than a second path to the measurement.
if (!/\bonPolygon\b/.test(draw) || !/\bonRectangle\b/.test(draw)) {
  fail("the drawing map must hand its corners back to the fields rather than hold a shape of its own.");
}
if (draw.includes("fetch(") || draw.includes(ROUTE)) {
  fail("the drawing map must not measure anything itself; the form owns the one request.");
}
if (!draw.includes("maxCorners") || !client.includes("MAX_CORNERS")) {
  fail("the pointer path must stop at the same vertex cap the worker enforces.");
}
const unavailable = [...draw.matchAll(/^\s*unavailable:\s*"([^"]*)"/gm)].map((match) => match[1]);
if (unavailable.length !== 2) {
  fail("the drawing map must say in both languages what a reader can still do when it fails to load.");
}
if (!/fields/.test(unavailable[0] ?? "") || !/champs/.test(unavailable[1] ?? "")) {
  fail("a map that fails to load must say the corner fields still work, in each language's own words.");
}
for (const key of ["caption", "hintPolygon", "hintRectangleStart", "undo", "reset"]) {
  const written = draw.match(new RegExp(`^\\s*${key}:`, "gm")) ?? [];
  if (written.length !== 2) fail(`the drawing map must carry ${key} in both languages.`);
}
if (/addProtocol|removeProtocol/.test(draw)) {
  fail("the drawing map must not touch the global tile-protocol registry the explore map owns.");
}
if (!/setTimeout\([\s\S]{0,300}setState\("unavailable"\)[\s\S]{0,80}\}, LOAD_TIMEOUT_MS\)/.test(draw)) {
  fail("the drawing map must give itself a load budget and fall back to the fields when it runs out.");
}
if (/on\("error"[\s\S]{0,200}setState\("unavailable"\)/.test(draw)) {
  fail("a single source error must not condemn the drawing map; the load budget is what decides.");
}
if (!draw.includes("compatibilityGeoJsonUrl")) {
  fail("the drawing map's ground must come from the checksum-pinned outline rather than an unpinned basemap.");
}
if (!draw.includes('role="status"')) {
  fail("the drawing map must announce each placed corner to a screen reader.");
}
if (!draw.includes("EXPLORE_MAP_COLOURS.ink") || draw.includes("EXPLORE_MAP_COLOURS.harvest") || draw.includes("EXPLORE_MAP_COLOURS.wildfire")) {
  fail("a drawn shape must not be painted in a colour the legend has already spent on a disturbance cause.");
}

console.log(`Shape measurement contract passed: ${ROUTE} reads the grid, brackets its estimate, and refuses by kind.`);
