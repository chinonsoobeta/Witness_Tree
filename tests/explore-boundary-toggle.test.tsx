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
  sync(map, ["federal-ridings"]);
  assert.deepEqual(map.layers.map((layer) => layer.id), [
    "ground",
    "province-fill",
    "per-cell-fill",
    "boundary-federal-ridings-fill",
    "boundary-federal-ridings-casing",
    "boundary-federal-ridings-line",
    "boundary-federal-ridings-selected",
  ]);
  assert.deepEqual([...map.sources.keys()], ["boundary-federal-ridings"]);
});

test("showing a second outline keeps the first one's source, and draws every fill under every line", () => {
  const map = fakeMap();
  sync(map, ["federal-ridings"]);
  map.calls.length = 0;
  sync(map, ["federal-ridings", "watersheds"]);
  assert.ok(!map.calls.includes("removeSource boundary-federal-ridings"));
  assert.ok(!map.calls.includes("addSource boundary-federal-ridings"));
  assert.ok(map.calls.includes("addSource boundary-watersheds"));
  const ids = map.layers.map((layer) => layer.id);
  assert.ok(ids.indexOf("boundary-watersheds-fill") < ids.indexOf("boundary-federal-ridings-casing"));
  assert.ok(ids.indexOf("boundary-federal-ridings-casing") < ids.indexOf("boundary-watersheds-line"));
  assert.deepEqual(ids.slice(0, 3), ["ground", "province-fill", "per-cell-fill"]);
});

test("hiding an outline removes its layers and its source and touches nothing else", () => {
  const map = fakeMap();
  sync(map, ["federal-ridings", "watersheds"]);
  sync(map, ["watersheds"]);
  assert.ok(!map.layers.some((layer) => layer.id.startsWith("boundary-federal-ridings")));
  assert.deepEqual([...map.sources.keys()], ["boundary-watersheds"]);
  sync(map, []);
  assert.deepEqual(map.layers.map((layer) => layer.id), ["ground", "province-fill", "per-cell-fill"]);
  assert.equal(map.sources.size, 0);
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
