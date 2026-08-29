import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { chooseScaleBar, metresPerPixel } from "../lib/explore/map-scale.ts";

test("metres per pixel halves with each zoom level and narrows toward the pole", () => {
  const equator = metresPerPixel(0, 0);
  assert.ok(Math.abs(equator - 156543.03392804097) < 1e-6);
  assert.ok(Math.abs(metresPerPixel(0, 1) - equator / 2) < 1e-9);
  assert.ok(Math.abs(metresPerPixel(0, 10) - equator / 1024) < 1e-9);

  // Canada is read at high latitude, where the Mercator projection stretches
  // the map and a fixed pixel therefore covers less ground. A scale bar that
  // ignored this would overstate every distance on the page.
  const sixty = metresPerPixel(60, 5);
  assert.ok(sixty < metresPerPixel(0, 5));
  assert.ok(Math.abs(sixty - metresPerPixel(0, 5) * Math.cos(Math.PI / 3)) < 1e-6);
  assert.ok(Math.abs(metresPerPixel(-60, 5) - sixty) < 1e-9);
});

test("the bar names a round distance and is drawn exactly that wide", () => {
  // 10 m per pixel across 100 pixels is a 1000 m budget, and 1000 m is round.
  const exact = chooseScaleBar(10, 100);
  assert.deepEqual(exact, { metres: 1000, pixels: 100, value: 1, unit: "km" });

  // A budget of 1200 m must round down to 1000, never up past the width.
  const under = chooseScaleBar(12, 100);
  assert.equal(under.metres, 1000);
  assert.ok(under.pixels < 100);

  // Every step used is one of 1, 2, 3, 5 times a power of ten, and the drawn
  // width never exceeds what it was given.
  for (let mpp = 0.05; mpp < 5000; mpp *= 1.37) {
    for (const maxPixels of [60, 100, 160]) {
      const bar = chooseScaleBar(mpp, maxPixels);
      assert.ok(bar.pixels > 0 && bar.pixels <= maxPixels, `${mpp} ${maxPixels}`);
      assert.ok(Math.abs(bar.pixels - bar.metres / mpp) < 1e-9);
      const mantissa = bar.metres / 10 ** Math.floor(Math.log10(bar.metres));
      assert.ok(
        [1, 2, 3, 5].some((step) => Math.abs(mantissa - step) < 1e-9),
        `${bar.metres} m is not a round step`,
      );
    }
  }
});

test("the unit changes at a kilometre without changing the distance", () => {
  const metres = chooseScaleBar(1, 500);
  assert.equal(metres.unit, "m");
  assert.equal(metres.metres, 500);
  assert.equal(metres.value, 500);

  // Just under the threshold stays in metres rather than reading "0.5 km".
  const justUnder = chooseScaleBar(1, 999);
  assert.deepEqual(justUnder, { metres: 500, pixels: 500, value: 500, unit: "m" });

  const kilometres = chooseScaleBar(4, 500);
  assert.equal(kilometres.unit, "km");
  assert.equal(kilometres.metres, 2000);
  assert.equal(kilometres.value, 2);
});

test("nonsense inputs are refused rather than drawn", () => {
  assert.throws(() => metresPerPixel(Number.NaN, 5), /finite/);
  assert.throws(() => metresPerPixel(0, Number.POSITIVE_INFINITY), /finite/);
  assert.throws(() => metresPerPixel(89, 5), /Mercator/);
  assert.throws(() => chooseScaleBar(0, 100), /positive/);
  assert.throws(() => chooseScaleBar(-1, 100), /positive/);
  assert.throws(() => chooseScaleBar(10, 0), /positive/);
});
