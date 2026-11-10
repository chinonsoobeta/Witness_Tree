import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatMapHash, readMapHash } from "../lib/explore/map-hash";

/*
 * D5: the map position in the address as #map=<zoom>/<lat>/<lng>, zoom to two
 * decimals, latitude and longitude to four. Place pages link with it.
 */
const map = readFileSync(new URL("../components/explore/ExploreMapClient.tsx", import.meta.url), "utf8");

test("D5: the hash has the agreed format and reads back", () => {
  assert.equal(formatMapHash({ zoom: 6.5, lat: 53.72671234, lng: -127.6476449 }), "#map=6.50/53.7267/-127.6476");
  assert.equal(formatMapHash({ zoom: 10, lat: 48.5, lng: -84.5 }), "#map=10.00/48.5000/-84.5000");
  assert.deepEqual(readMapHash("#map=6.50/53.7267/-127.6476"), { zoom: 6.5, lat: 53.7267, lng: -127.6476 });
  assert.deepEqual(readMapHash("#map=4/50/-90"), { zoom: 4, lat: 50, lng: -90 });
  const camera = { zoom: 7.25, lat: 46.8139, lng: -71.208 };
  assert.deepEqual(readMapHash(formatMapHash(camera)), camera);
});

test("D5: a hash that names no usable position is ignored", () => {
  for (const hash of ["", "#", "#map=", "#map=abc", "#map=5/50", "#map=5/50/-90/1", "#zoom=5/50/-90", "#map=99/1/2", "#map=5/91/0", "#map=5/0/181", "map=5/50/-90"])
    assert.equal(readMapHash(hash), null, hash);
});

test("D5: the map reads the hash when built and writes it with replaceState as it settles", () => {
  assert.match(map, /const hashCamera = readMapHash\(window\.location\.hash\);\n\s+if \(hashCamera\) \{\n\s+map\.jumpTo\(\{ center: \[hashCamera\.lng, hashCamera\.lat\], zoom: hashCamera\.zoom \}\);\n\s+readerMovedRef\.current = true;\n\s+\} else if \(focusRef\.current\)/);
  assert.match(map, /map\.on\("moveend", \(\) => \{[\s\S]*?History\.prototype\.replaceState\.call\(window\.history, window\.history\.state, "", `\$\{pathname\}\$\{search\}\$\{formatMapHash\(\{ zoom: map\.getZoom\(\), lat: centre\.lat, lng: centre\.lng \}\)\}`\);/);
  // The reader-moved flag is set on movestart, which is registered first.
  assert.ok(map.indexOf('map.on("movestart"') < map.indexOf('map.on("moveend"'));
  // The address writers keep the hash (tests/explore-province-address.test.tsx).
  const yearControl = readFileSync(new URL("../components/explore/ExploreYearControl.tsx", import.meta.url), "utf8");
  assert.match(yearControl, /keepAddressState\(url, window\.location\)/);
});

test("D5: only the reader's own position is written; a fit by the page writes none and clears a stale one", () => {
  const moveend = map.match(/map\.on\("moveend", \(\) => \{[\s\S]*?\n {8}\}\);/)?.[0] ?? "";
  // A reader move writes the hash.
  assert.match(moveend, /if \(readerMovedRef\.current\) \{\n\s+const centre = map\.getCenter\(\);\n\s+History\.prototype\.replaceState\.call\([^\n]*formatMapHash\(/);
  // A fit by the page takes a map hash out, and leaves any other hash alone.
  assert.match(moveend, /\} else if \(hash\.startsWith\("#map="\)\) \{\n\s+History\.prototype\.replaceState\.call\(window\.history, window\.history\.state, "", `\$\{pathname\}\$\{search\}`\);/);
  assert.equal(moveend.match(/formatMapHash\(/g)?.length, 1);
  // The page's own fits leave the flag false; the reader's moves set it.
  assert.match(map, /onSelect=\{\(mapView\) => \{[\s\S]*?readerMovedRef\.current = false;\n\s+fitMapToView\(mapView\);/);
  assert.match(map, /if \(!readerMovedRef\.current\) fitMapToView\(focusRef\.current\);/);
  assert.match(map, /if \(!\(event as \{ originalEvent\?: unknown \}\)\.originalEvent\) return;\n\s+readerMovedRef\.current = true;/);
  assert.match(map, /readerMovedRef\.current = true;\n\s+mapRef\.current\?\.zoomIn\(\);/);
  assert.match(map, /readerMovedRef\.current = true;\n\s+const target = patchZoomTarget\(/);
});
