import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { panLimitFor, type MapBounds } from "../lib/explore/map-camera.ts";

const ENVELOPE: MapBounds = [-139.1, 41.5, -57, 62.1];
const PADDING = 36;
const mercatorY = (latitude: number) => Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));

/** What MapLibre shows when the envelope is fitted into the frame, in radians of Web Mercator. */
function fittedView(width: number, height: number) {
  const spanX = ((ENVELOPE[2] - ENVELOPE[0]) * Math.PI) / 180;
  const spanY = mercatorY(ENVELOPE[3]) - mercatorY(ENVELOPE[1]);
  const scale = Math.min((width - 2 * PADDING) / spanX, (height - 2 * PADDING) / spanY);
  return { width: width / scale, height: height / scale };
}

function limitSpan(limit: MapBounds) {
  return {
    width: ((limit[2] - limit[0]) * Math.PI) / 180,
    height: mercatorY(limit[3]) - mercatorY(limit[1]),
  };
}

test("the pan limit holds the whole fitted view, so the envelope is never cropped", () => {
  // A phone, a tablet, the desktop map column, and a wide full-screen frame.
  for (const [width, height] of [[333, 478], [726, 430], [820, 432], [1920, 500], [1920, 1080]]) {
    const view = fittedView(width, height);
    const limit = limitSpan(panLimitFor(ENVELOPE, width, height, PADDING));
    assert.ok(limit.width >= view.width, `${width}x${height}: the limit is narrower than the view`);
    assert.ok(limit.height >= view.height, `${width}x${height}: the limit is shorter than the view`);
  }
});

test("the pan limit is never smaller than the envelope and stays centred on it", () => {
  for (const [width, height] of [[333, 478], [820, 432], [4000, 300]]) {
    const [west, south, east, north] = panLimitFor(ENVELOPE, width, height, PADDING);
    assert.ok(west <= ENVELOPE[0] && east >= ENVELOPE[2], `${width}x${height}: longitude cropped`);
    assert.ok(south <= ENVELOPE[1] && north >= ENVELOPE[3], `${width}x${height}: latitude cropped`);
    assert.ok(Math.abs((west + east) / 2 - (ENVELOPE[0] + ENVELOPE[2]) / 2) < 1e-9);
    assert.ok(Math.abs((mercatorY(south) + mercatorY(north)) / 2 - (mercatorY(ENVELOPE[1]) + mercatorY(ENVELOPE[3])) / 2) < 1e-9);
  }
});

test("a tall phone frame widens the latitude range but stays inside Web Mercator", () => {
  const [, south, , north] = panLimitFor(ENVELOPE, 333, 478, PADDING);
  assert.ok(south < ENVELOPE[1] && north > ENVELOPE[3]);
  assert.ok(south >= -85.051129 && north <= 85.051129);
});

test("a frame with no size yet gets the envelope itself", () => {
  assert.deepEqual(panLimitFor(ENVELOPE, 0, 0, PADDING), ENVELOPE);
  assert.deepEqual(panLimitFor(ENVELOPE, Number.NaN, 400, PADDING), ENVELOPE);
});
