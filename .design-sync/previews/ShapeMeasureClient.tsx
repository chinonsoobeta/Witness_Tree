import { ShapeMeasureClient } from "witness-tree";

/*
 * The whole draw-an-area-and-measure-it surface: a title field, the rectangle or
 * polygon choice, the corner fields, the year range, the drawing map, and the
 * result once a measurement returns. It owns all of that state itself, so a cell
 * needs nothing but a locale.
 *
 * The corner fields are the point of the layout. They are not a fallback bolted
 * on beside the map; they are the keyboard path to the same shape, they always
 * show what the map has drawn, and the map is captioned "Optional". A design that
 * makes the map the primary input inverts that, which is why both cells show the
 * fields and the map together rather than cropping to the map.
 */
export const English = () => <ShapeMeasureClient locale="en" />;

export const French = () => <ShapeMeasureClient locale="fr" />;
