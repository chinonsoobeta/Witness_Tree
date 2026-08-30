/**
 * Scale-bar arithmetic, kept out of the map component so it can be tested.
 *
 * A scale bar is only honest if the distance it names is the distance it
 * draws. The usual mistake is to draw a fixed-width bar and label it with
 * whatever distance happens to fall across it, which produces labels like
 * "137 km" that nobody can use. This picks a round distance first and then
 * measures how wide that distance is, so the bar is always a number a reader
 * can hold on to.
 */

/** Metres covered by one screen pixel in Web Mercator at a given latitude. */
export function metresPerPixel(latitude: number, zoom: number): number {
  if (!Number.isFinite(latitude) || !Number.isFinite(zoom)) {
    throw new Error("Latitude and zoom must be finite");
  }
  if (latitude < -85.051129 || latitude > 85.051129) {
    throw new Error("Latitude is outside the Web Mercator range");
  }
  // Circumference of the Earth at the equator, divided across the 256-pixel
  // tile grid, narrowed by the latitude's Mercator convergence.
  const EQUATORIAL_METRES_PER_PIXEL_AT_ZOOM_0 = 156543.03392804097;
  return (
    (EQUATORIAL_METRES_PER_PIXEL_AT_ZOOM_0 *
      Math.cos((latitude * Math.PI) / 180)) /
    2 ** zoom
  );
}

/*
 * The distances a scale bar is allowed to name. Keeping to 1, 2, 3 and 5 per
 * decade is the cartographic convention: they divide evenly by eye, so a
 * reader can halve or third the bar without arithmetic.
 */
const STEPS = [1, 2, 3, 5] as const;

export type ScaleBar = Readonly<{
  metres: number;
  pixels: number;
  value: number;
  unit: "m" | "km";
}>;

/**
 * The largest round distance that fits within `maxPixels`, and its true width.
 */
export function chooseScaleBar(
  metresPerPixelValue: number,
  maxPixels: number,
): ScaleBar {
  if (!Number.isFinite(metresPerPixelValue) || metresPerPixelValue <= 0) {
    throw new Error("Metres per pixel must be a positive finite number");
  }
  if (!Number.isFinite(maxPixels) || maxPixels <= 0) {
    throw new Error("Maximum width must be a positive finite number");
  }
  const budget = metresPerPixelValue * maxPixels;
  // Walk down from the decade above the budget until a step fits. Starting
  // above guarantees the loop passes the budget rather than starting inside
  // it, so the largest fitting step is always found.
  let decade = 10 ** Math.ceil(Math.log10(budget));
  for (let guard = 0; guard < 64; guard += 1) {
    for (let index = STEPS.length - 1; index >= 0; index -= 1) {
      const metres = STEPS[index]! * decade;
      if (metres <= budget) {
        return {
          metres,
          pixels: metres / metresPerPixelValue,
          // Below a kilometre a reader wants metres; above it, kilometres.
          // The threshold is the unit change, not a rounding decision, so the
          // value stays exact either way.
          value: metres >= 1000 ? metres / 1000 : metres,
          unit: metres >= 1000 ? "km" : "m",
        };
      }
    }
    decade /= 10;
  }
  throw new Error("No scale step fits the available width");
}
