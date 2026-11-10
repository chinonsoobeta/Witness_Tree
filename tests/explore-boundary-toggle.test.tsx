import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  syncBoundaryLayers,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../components/explore/ExploreMapClient.tsx";

/*
 * F1 of the 2026-11-10 review: Show and Hide change the outlines in place and
 * rewrite the address, and each control keeps a real link.
 */

type Layer = { id: string; source?: string };

// The stand-in records only what syncBoundaryLayers calls.
const sync = (map: ReturnType<typeof fakeMap>, overlays: Parameters<typeof syncBoundaryLayers>[1]) =>
  syncBoundaryLayers(map as unknown as Parameters<typeof syncBoundaryLayers>[0], overlays);

function fakeMap(initialLayers: string[] = ["ground", "province-fill", "per-cell-fill"]) {
  const layers: Layer[] = initialLayers.map((id) => ({ id }));
  const sources = new Map<string, unknown>();
  const calls: string[] = [];
  return {
    layers,
    sources,
    calls,
    getLayer: (id: string) => layers.find((layer) => layer.id === id),
    removeLayer: (id: string) => {
      calls.push(`removeLayer ${id}`);
      layers.splice(layers.findIndex((layer) => layer.id === id), 1);
    },
    getSource: (id: string) => sources.get(id),
    removeSource: (id: string) => {
      calls.push(`removeSource ${id}`);
      sources.delete(id);
    },
    addSource: (id: string, source: unknown) => {
      calls.push(`addSource ${id}`);
      sources.set(id, source);
    },
    addLayer: (layer: Layer) => {
      layers.push({ id: layer.id, source: layer.source });
    },
  };
}

test("showing an outline adds its source and layers on top, in drawing order", () => {
  const map = fakeMap();
  sync(map, ["provincial-ridings"]);
  assert.deepEqual(map.layers.map((layer) => layer.id), [
    "ground",
    "province-fill",
    "per-cell-fill",
    "boundary-provincial-ridings-fill",
    "boundary-provincial-ridings-casing",
    "boundary-provincial-ridings-line",
    "boundary-provincial-ridings-selected",
  ]);
  assert.deepEqual([...map.sources.keys()], ["boundary-provincial-ridings"]);
});

test("showing a second outline keeps the first one's source, and draws every fill under every line", () => {
  const map = fakeMap();
  sync(map, ["provincial-ridings"]);
  map.calls.length = 0;
  sync(map, ["provincial-ridings", "watersheds"]);
  assert.ok(!map.calls.includes("removeSource boundary-provincial-ridings"));
  assert.ok(!map.calls.includes("addSource boundary-provincial-ridings"));
  assert.ok(map.calls.includes("addSource boundary-watersheds"));
  const ids = map.layers.map((layer) => layer.id);
  assert.ok(ids.indexOf("boundary-watersheds-fill") < ids.indexOf("boundary-provincial-ridings-casing"));
  assert.ok(ids.indexOf("boundary-provincial-ridings-casing") < ids.indexOf("boundary-watersheds-line"));
  assert.deepEqual(ids.slice(0, 3), ["ground", "province-fill", "per-cell-fill"]);
});

test("hiding an outline removes its layers and its source and touches nothing else", () => {
  const map = fakeMap();
  sync(map, ["provincial-ridings", "watersheds"]);
  sync(map, ["watersheds"]);
  assert.ok(!map.layers.some((layer) => layer.id.startsWith("boundary-provincial-ridings")));
  assert.deepEqual([...map.sources.keys()], ["boundary-watersheds"]);
  sync(map, []);
  assert.deepEqual(map.layers.map((layer) => layer.id), ["ground", "province-fill", "per-cell-fill"]);
  assert.equal(map.sources.size, 0);
});

test("the federal-riding and economic-region outlines read the sources already on the map and never open an archive a second time", () => {
  // Two sources on one archive ask for the same byte ranges together, and
  // Chromium then fails one of the requests on about every second load.
  const map = fakeMap();
  map.sources.set("canada-land", {});
  sync(map, ["federal-ridings", "watersheds"]);
  assert.deepEqual([...map.sources.keys()], ["canada-land", "boundary-watersheds"]);
  const riding = map.layers.filter((layer) => layer.id.startsWith("boundary-federal-ridings"));
  assert.equal(riding.length, 4);
  for (const layer of riding) assert.equal(layer.source, "canada-land");
  sync(map, []);
  // Hiding the outlines leaves the land tone its source.
  assert.deepEqual([...map.sources.keys()], ["canada-land"]);
  assert.ok(!map.calls.includes("removeSource canada-land"));
  const source = readFileSync(new URL("../components/explore/ExploreMapClient.tsx", import.meta.url), "utf8");
  assert.equal(source.match(/pmtiles:\/\/\$\{ridings\.url\}/g)?.length, 1);
  assert.equal(source.match(/pmtiles:\/\/\$\{REGION_OVERLAY\.url\}/g)?.length, 1);

  const regions = fakeMap();
  regions.sources.set("forest-regions", {});
  sync(regions, ["economic-regions"]);
  assert.deepEqual([...regions.sources.keys()], ["forest-regions"]);
  for (const layer of regions.layers.filter((item) => item.id.startsWith("boundary-economic-regions"))) assert.equal(layer.source, "forest-regions");
  sync(regions, []);
  assert.deepEqual([...regions.sources.keys()], ["forest-regions"]);
});

test("each Show or Hide keeps its link and, on a plain click, toggles in place with replaceState", () => {
  const view = readFileSync(new URL("../components/explore/ExploreView.tsx", import.meta.url), "utf8");
  const toggle = view.slice(view.indexOf('className="segment-option overlay-toggle"'), view.indexOf("{active ? text.hide : text.show}"));
  assert.match(toggle, /href=\{withProvince\(href\(\s*mode,\s*presentation,\s*data,\s*activeYear,\s*toggleBoundaryOverlay\(overlays, id\),\s*activeFrom,\s*\)\)\}/);
  // A modified or middle click still follows the link.
  assert.match(toggle, /if \(event\.button !== 0 \|\| event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey\) return;/);
  assert.match(toggle, /event\.preventDefault\(\);/);
  assert.match(toggle, /setOverlays\(next\);/);
  // The address keeps the map position in its hash.
  assert.match(toggle, /replaceAddress\(`\$\{window\.location\.pathname\}\$\{href\(mode, presentation, data, activeYear, next, activeFrom\)\}\$\{window\.location\.hash\}`\)/);
  // Native replaceState, with the province and the map position carried over (C6).
  assert.match(view, /History\.prototype\.replaceState\.call\(window\.history, window\.history\.state, "", keepAddressState\(url, window\.location\)\)/);
  // Everything that carries the outlines forward reads the same state.
  assert.match(view, /const \[overlays, setOverlays\] = useState\(routeOverlays\);/);
});
