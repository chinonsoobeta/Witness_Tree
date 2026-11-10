/*
 * The map's colours that are neither a class nor an event: the land outside
 * the four provinces, the dark-theme ground, and the light track under an
 * outline. They are kept here, beside the class colours in map-style.ts,
 * because a component file may not carry a raw colour (check:style-tokens).
 * The stylesheet's --map-ground-dark and --map-casing tokens hold the same
 * values for the still map; tests/explore-dark-ground.test.ts keeps the two
 * in step.
 */

/** A step darker than the light ground: land, not data. */
export const CANADA_LAND_COLOUR = "#dcdfd5";

/** The ground and the other land in dark theme (D8). */
export const MAP_GROUND_DARK = Object.freeze({ ground: "#211e19", land: "#36322b" });

/** The light track drawn under each outline (F2); fixed, so it reads in both themes. */
export const BOUNDARY_CASING_COLOUR = "#f6f7f2";
