import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

/*
 * "Within 10 km" on the Draw page (audit 2026-11-10, L6). The map was a 320px
 * strip; it is now at least 380px and at most 560px tall, and once a centre is
 * set it frames the circle. There is no "use my location" control, because the
 * permissions policy refuses geolocation and this item does not change it.
 */
test("the drawing map is tall enough to show the circle it frames", () => {
  const styles = read("../app/globals.css");
  const rule = styles.match(/\.shape-draw-canvas \{([^}]*)\}/)?.[1] ?? "";
  const [, low, , high] = rule.match(/height: clamp\((\d+)px, (\d+)vh, (\d+)px\);/) ?? [];
  assert.ok(Number(low) >= 380, "at least 380px tall");
  assert.ok(Number(high) >= Number(low));
});

test("setting a centre frames the circle on the map", () => {
  const source = read("../components/explore/ShapeDrawMap.tsx");
  const circle = source.slice(source.indexOf('if (kind === "circle") {\n      source.setData'), source.indexOf("const shown ="));
  assert.match(circle, /instance\.fitBounds\(\[\[west, south\], \[east, north\]\]/);
  // Framed only when the circle itself changes, not on every render.
  assert.match(circle, /framed !== framedRef\.current/);
});

test("the site still refuses geolocation, and no page asks for it", () => {
  const config = read("../next.config.ts");
  assert.match(config, /"geolocation=\(\)"/);
  for (const file of ["../components/explore/ShapeDrawMap.tsx", "../components/explore/ShapeMeasureClient.tsx", "../components/explore/ShapeCircle.tsx", "../components/site/HomeSearch.tsx"]) {
    assert.doesNotMatch(read(file), /navigator\.geolocation/, file);
  }
});
