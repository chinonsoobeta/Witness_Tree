import { useState } from "react";
import { ShapeDrawMap } from "witness-tree";

/*
 * The optional drawing surface beside the corner fields. Two things about it
 * matter more than the basemap.
 *
 * First, it is never the only way in. The caption says so, and when the basemap
 * does not draw itself within its ten-second budget the component says "The map
 * did not load. The corner fields above still work" rather than leaving an empty
 * square. A preview has no tile network, and the capture happens well inside
 * that ten-second budget, so these cells show the loading state that precedes
 * that message: the hint, the controls and the caption, with the canvas blank.
 * Everything a design composes around is therefore visible here; only the tiles
 * are missing.
 *
 * Second, `kind` changes the instructions and the controls, not just the
 * geometry: a rectangle is two clicks and offers only Start over, a polygon adds
 * corners one at a time and offers Remove the last corner.
 */
const CORNERS = [
  { latitude: 45.44, longitude: -75.72 },
  { latitude: 45.44, longitude: -75.66 },
  { latitude: 45.4, longitude: -75.66 },
];

function Draw({ kind, locale }: { kind: "rectangle" | "polygon"; locale: "en" | "fr" }) {
  const [corners, setCorners] = useState(kind === "polygon" ? CORNERS : []);
  return (
    <ShapeDrawMap
      locale={locale}
      kind={kind}
      corners={corners}
      maxCorners={12}
      onPolygon={setCorners}
      onRectangle={() => undefined}
    />
  );
}

export const Rectangle = () => <Draw kind="rectangle" locale="en" />;

/** Polygon adds the undo control that rectangle does not have. */
export const Polygon = () => <Draw kind="polygon" locale="en" />;

export const French = () => <Draw kind="polygon" locale="fr" />;
