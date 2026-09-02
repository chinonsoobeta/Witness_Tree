"use client";

import { useEffect, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
  StyleSpecification,
} from "maplibre-gl";
import type { Locale } from "@/lib/domain";
import { EXPLORE_MAP_COLOURS, EXPLORE_PRODUCTION_LAYER } from "@/lib/explore";
import {
  appendCorner,
  cornerFromPoint,
  rectangleFromCorners,
  removeLastCorner,
  type Corner,
  type Edges,
} from "@/lib/shapes/draw";

type MapState = "loading" | "ready" | "unavailable";

// The same version-pinned worker the explore map serves from `public/`. MapLibre
// resolves its worker relative to its own chunk, which the bundler does not emit,
// so both maps have to name this file rather than take the default.
const MAPLIBRE_WORKER_VERSION = "6.3.0";
const MAPLIBRE_WORKER_URL = `/maplibre/${MAPLIBRE_WORKER_VERSION}/maplibre-gl-worker.mjs`;
const NATIONAL_BOUNDS: [number, number, number, number] = [-141, 41, -52, 70];
const DRAWN_SOURCE = "shape-drawn";
const GROUND_SOURCE = "shape-ground";
// The map has ten seconds to draw itself before the fields are declared the
// only way in. The same budget the explore map gives its own basemap.
const LOAD_TIMEOUT_MS = 10_000;
// A drawn shape is the reader's own mark, not a measurement, so it is drawn in
// the boundary ink and dashed rather than in any colour the legend has already
// spent on a disturbance cause.
const DRAWN_LINE_WIDTH = 2;
const CORNER_RADIUS = 5;

const copy = {
  en: {
    label: "Map for drawing an area",
    caption:
      "Optional. Click the map to place corners. The corner fields above do the same thing with the keyboard, and they always show what the map has drawn.",
    hintPolygon: "Click the map to add a corner.",
    hintRectangleStart: "Click one corner of the rectangle.",
    hintRectangleFinish: "Click the opposite corner.",
    undo: "Remove the last corner",
    reset: "Start over",
    added: (index: number, latitude: string, longitude: string) =>
      `Corner ${index} placed at ${latitude}, ${longitude}.`,
    removed: (index: number) => `Corner ${index} removed.`,
    rectangleSet: "Rectangle set from the two corners you clicked.",
    cleared: "Corners cleared.",
    unavailable: "The map did not load. The corner fields above still work.",
  },
  fr: {
    label: "Carte pour dessiner une zone",
    caption:
      "Facultatif. Cliquez sur la carte pour placer des coins. Les champs de coins ci-dessus font la même chose au clavier, et ils montrent toujours ce que la carte a dessiné.",
    hintPolygon: "Cliquez sur la carte pour ajouter un coin.",
    hintRectangleStart: "Cliquez sur un coin du rectangle.",
    hintRectangleFinish: "Cliquez sur le coin opposé.",
    undo: "Retirer le dernier coin",
    reset: "Recommencer",
    added: (index: number, latitude: string, longitude: string) =>
      `Coin ${index} placé à ${latitude}, ${longitude}.`,
    removed: (index: number) => `Coin ${index} retiré.`,
    rectangleSet: "Rectangle défini à partir des deux coins cliqués.",
    cleared: "Coins effacés.",
    unavailable: "La carte n'a pas pu être chargée. Les champs de coins ci-dessus fonctionnent toujours.",
  },
} as const;

function drawStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      // The province outline is here to orient a reader placing corners, not to
      // carry a measurement, so it is read from the checksum-pinned compatibility
      // GeoJSON rather than through the custom tile protocol. That keeps this map
      // off the global protocol registry the explore map registers and removes,
      // and it keeps a drawing surface from depending on the one path in this
      // codebase already known to time out.
      [GROUND_SOURCE]: { type: "geojson", data: EXPLORE_PRODUCTION_LAYER.compatibilityGeoJsonUrl },
      [DRAWN_SOURCE]: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    },
    layers: [
      { id: "ground", type: "background", paint: { "background-color": EXPLORE_MAP_COLOURS.ground } },
      {
        id: `${GROUND_SOURCE}-fill`,
        type: "fill",
        source: GROUND_SOURCE,
        paint: { "fill-color": EXPLORE_MAP_COLOURS.loss0, "fill-opacity": 0.9 },
      },
      {
        id: `${GROUND_SOURCE}-edge`,
        type: "line",
        source: GROUND_SOURCE,
        paint: { "line-color": EXPLORE_MAP_COLOURS.observation, "line-width": 1 },
      },
      {
        id: `${DRAWN_SOURCE}-fill`,
        type: "fill",
        source: DRAWN_SOURCE,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": EXPLORE_MAP_COLOURS.ink, "fill-opacity": 0.12 },
      },
      {
        id: `${DRAWN_SOURCE}-line`,
        type: "line",
        source: DRAWN_SOURCE,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "line-color": EXPLORE_MAP_COLOURS.ink,
          "line-width": DRAWN_LINE_WIDTH,
          "line-dasharray": [3, 2],
        },
      },
      {
        id: `${DRAWN_SOURCE}-corner`,
        type: "circle",
        source: DRAWN_SOURCE,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": CORNER_RADIUS,
          "circle-color": EXPLORE_MAP_COLOURS.ink,
          "circle-stroke-color": EXPLORE_MAP_COLOURS.ground,
          "circle-stroke-width": 2,
        },
      },
    ],
  };
}

// The drawn ring and its corners are one feature collection so a single source
// update moves both together and they can never disagree about the shape.
function drawnFeatures(corners: readonly Corner[]) {
  const points = corners.map((corner) => ({
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Point" as const, coordinates: [corner.longitude, corner.latitude] },
  }));
  if (corners.length < 3) return { type: "FeatureCollection" as const, features: points };
  const ring = corners.map((corner) => [corner.longitude, corner.latitude]);
  ring.push(ring[0]);
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Polygon" as const, coordinates: [ring] },
      },
      ...points,
    ],
  };
}

export function ShapeDrawMap({
  locale,
  kind,
  corners,
  maxCorners,
  onPolygon,
  onRectangle,
}: {
  locale: Locale;
  kind: "rectangle" | "polygon";
  corners: readonly Corner[];
  maxCorners: number;
  onPolygon: (corners: Corner[]) => void;
  onRectangle: (edges: Edges) => void;
}) {
  const words = copy[locale];
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [state, setState] = useState<MapState>("loading");
  const [announcement, setAnnouncement] = useState("");
  const [anchor, setAnchor] = useState<Corner | null>(null);

  // A click is answered from refs rather than from the last rendered props. Two
  // clicks in quick succession are one gesture to a reader and would otherwise
  // be two clicks against the same stale state, which loses the first one: the
  // second corner of a rectangle would land as another first corner.
  const cornersRef = useRef<readonly Corner[]>(corners);
  const anchorRef = useRef<Corner | null>(null);
  const click = useRef<(corner: Corner) => void>(() => {});

  const handleClick = (corner: Corner) => {
    if (kind === "polygon") {
      const added = appendCorner(cornersRef.current, corner, maxCorners);
      if (!added) return;
      cornersRef.current = added.corners;
      onPolygon(added.corners);
      setAnnouncement(
        words.added(added.index, corner.latitude.toString(), corner.longitude.toString()),
      );
      return;
    }
    const anchored = anchorRef.current;
    if (!anchored) {
      anchorRef.current = corner;
      setAnchor(corner);
      setAnnouncement(words.added(1, corner.latitude.toString(), corner.longitude.toString()));
      return;
    }
    anchorRef.current = null;
    onRectangle(rectangleFromCorners(anchored, corner));
    setAnchor(null);
    setAnnouncement(words.rectangleSet);
  };

  useEffect(() => {
    click.current = handleClick;
    // The fields are the shape's home. When a reader types in one, the map's
    // own copy has to follow, or the next click would append to a list the
    // reader has already changed.
    cornersRef.current = corners;
  });

  useEffect(() => {
    let active = true;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      timer = setTimeout(() => {
        if (!active || settled) return;
        settled = true;
        setState("unavailable");
      }, LOAD_TIMEOUT_MS);
      try {
        const maplibre = await import("maplibre-gl");
        if (!active || !container.current) return;
        maplibre.setWorkerUrl(MAPLIBRE_WORKER_URL);
        const instance = new maplibre.Map({
          container: container.current,
          style: drawStyle(),
          bounds: NATIONAL_BOUNDS,
          attributionControl: false,
        });
        instance.on("click", (event: MapMouseEvent) => {
          click.current(cornerFromPoint(event.lngLat.lat, event.lngLat.lng));
        });
        // MapLibre reports a refused tile, a slow source and a fatal failure
        // through the same event, so a single one of them must not condemn a
        // map that is otherwise about to draw. The timeout above is what
        // decides, exactly as it does for the explore map.
        instance.on("error", (event: { error?: { message?: string } }) => {
          console.warn("Shape drawing map source problem", event.error?.message ?? event);
        });
        instance.on("load", () => {
          if (!active || settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          setState("ready");
        });
        map.current = instance;
      } catch {
        if (!active || settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        setState("unavailable");
      }
    })();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || state !== "ready") return;
    const source = instance.getSource<GeoJSONSource>(DRAWN_SOURCE);
    if (!source) return;
    const shown = kind === "rectangle" && anchor && corners.length === 0 ? [anchor] : corners;
    source.setData(drawnFeatures(shown));
  }, [corners, anchor, kind, state]);

  const hint =
    kind === "polygon" ? words.hintPolygon : anchor ? words.hintRectangleFinish : words.hintRectangleStart;

  return (
    <figure className="shape-draw" role="group" aria-label={words.label}>
      <div className="shape-draw-canvas" ref={container} role="img" aria-label={words.label} />
      <p className="shape-draw-hint">{state === "unavailable" ? words.unavailable : hint}</p>
      <p className="shape-draw-live" role="status">
        {announcement}
      </p>
      <div className="shape-draw-actions">
        {kind === "polygon" ? (
          <button
            type="button"
            onClick={() => {
              const removed = removeLastCorner(cornersRef.current);
              if (!removed) return;
              cornersRef.current = removed.corners;
              onPolygon(removed.corners);
              setAnnouncement(words.removed(removed.index));
            }}
          >
            {words.undo}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            anchorRef.current = null;
            setAnchor(null);
            if (kind === "polygon") {
              cornersRef.current = [];
              onPolygon([]);
            }
            setAnnouncement(words.cleared);
          }}
        >
          {words.reset}
        </button>
      </div>
      <figcaption className="shape-draw-caption">{words.caption}</figcaption>
    </figure>
  );
}
