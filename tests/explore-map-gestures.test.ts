import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * D2 of the 2026-11-10 review: the map stops trapping the page's scroll wheel
 * and one-finger drag, says how to move it in the page's language, and gives
 * the gestures back in full screen.
 */

const map = readFileSync(new URL("../components/explore/ExploreMapClient.tsx", import.meta.url), "utf8");

test("the map is built with cooperative gestures and localized hints", () => {
  assert.match(map, /cooperativeGestures: true,/);
  for (const key of ["WindowsHelpText", "MacHelpText", "MobileHelpText"])
    assert.match(map, new RegExp(`"CooperativeGesturesHandler\\.${key}": text\\[locale\\]\\.gesture`));
  assert.match(map, /gestureWindows: "Hold Ctrl and scroll to zoom the map"/);
  assert.match(map, /gestureMac: "Hold ⌘ and scroll to zoom the map"/);
  assert.match(map, /gestureMobile: "Use two fingers to move the map"/);
  assert.match(map, /gestureWindows: "Maintenez Ctrl et faites défiler pour zoomer sur la carte"/);
  assert.match(map, /gestureMac: "Maintenez ⌘ et faites défiler pour zoomer sur la carte"/);
  assert.match(map, /gestureMobile: "Utilisez deux doigts pour déplacer la carte"/);
});

test("full screen turns the cooperative gestures off, and leaving it turns them back on", () => {
  assert.match(map, /if \(isFullscreen\) map\.cooperativeGestures\.disable\(\);\n\s*else map\.cooperativeGestures\.enable\(\);/);
});
