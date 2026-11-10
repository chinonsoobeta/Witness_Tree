"use client";

import { useEffect, useRef, useState } from "react";
import type { ExpressionSpecification } from "maplibre-gl";
import type { PlaceExtent } from "@/lib/place-pages/map-view";

/**
 * A small map of one place: its outline over the loss patches Explore draws,
 * from the same tile archives. It is not Explore's map and shares none of its
 * code. The map library is fetched only when the map nears the screen, so a
 * page read without scrolling down pays nothing for it. The link below the map
 * is plain HTML: without JavaScript, or when the tiles fail, it is all that
 * shows.
 */

/** The same worker Explore serves; see components/explore/ExploreMapClient.tsx. */
const MAPLIBRE_WORKER_URL = "/maplibre/6.9.0/maplibre-gl-worker.mjs";
const LOAD_TIMEOUT_MS = 20_000;

type State = "static" | "waiting" | "loading" | "ready" | "failed";

export type PlaceMapProps = Readonly<{
  extent: PlaceExtent;
  /** The outline archive, its layer, and this place's `id` in it. */
  boundary: Readonly<{ url: string; sourceLayer: string; featureId: string }>;
  /** The loss-patch archive, as Explore reads it. */
  patches: Readonly<{ url: string; sourceLayer: string; yearProperty: string; minZoom: number; maxZoom: number }>;
  colours: Readonly<{ ground: string; outline: string; neighbour: string; patch: string }>;
  exploreHref: string;
  text: Readonly<{ label: string; open: string; key: string; zoomedOut: string; failed: string; attribution: string }>;
}>;

export function PlaceMap({ extent, boundary, patches, colours, exploreHref, text }: PlaceMapProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("static");
  const [zoomedOut, setZoomedOut] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof IntersectionObserver === "undefined") return;
    let active = true;
    let cleanup: (() => void) | null = null;
    setState("waiting");

    const start = async () => {
      setState("loading");
      try {
        const [maplibre, pmtiles] = await Promise.all([import("maplibre-gl"), import("pmtiles")]);
        if (!active) return;
        const protocol = new pmtiles.Protocol();
        maplibre.setWorkerUrl(MAPLIBRE_WORKER_URL);
        maplibre.addProtocol("pmtiles", protocol.tile);
        const outline: ExpressionSpecification = ["==", ["get", "id"], boundary.featureId];
        const map = new maplibre.Map({
          container: frame,
          interactive: false,
          attributionControl: false,
          bounds: [extent[0], extent[1], extent[2], extent[3]],
          fitBoundsOptions: { padding: 16, maxZoom: patches.maxZoom },
          maxZoom: patches.maxZoom,
          style: {
            version: 8,
            sources: {
              boundary: { type: "vector", url: `pmtiles://${boundary.url}` },
              patches: { type: "vector", url: `pmtiles://${patches.url}` },
            },
            layers: [
              { id: "ground", type: "background", paint: { "background-color": colours.ground } },
              {
                id: "patches",
                type: "fill",
                source: "patches",
                "source-layer": patches.sourceLayer,
                minzoom: patches.minZoom,
                filter: ["all", [">", ["get", patches.yearProperty], 1984], ["<=", ["get", patches.yearProperty], 2022]],
                paint: { "fill-color": colours.patch, "fill-opacity": 1 },
              },
              {
                id: "neighbours",
                type: "line",
                source: "boundary",
                "source-layer": boundary.sourceLayer,
                filter: ["!", outline],
                paint: { "line-color": colours.neighbour, "line-width": 0.75, "line-opacity": 0.6 },
              },
              {
                id: "outline",
                type: "line",
                source: "boundary",
                "source-layer": boundary.sourceLayer,
                filter: outline,
                paint: { "line-color": colours.outline, "line-width": 2.5 },
              },
            ],
          },
        });
        // A tile error, a timeout, or an outline that never arrived all leave
        // the plain link alone: a map without this place's outline says nothing.
        let failed = false;
        const fail = () => {
          failed = true;
          if (active) setState("failed");
        };
        const timeout = setTimeout(fail, LOAD_TIMEOUT_MS);
        map.on("error", fail);
        map.once("idle", () => {
          clearTimeout(timeout);
          if (!active || failed) return;
          if (map.querySourceFeatures("boundary", { sourceLayer: boundary.sourceLayer, filter: outline }).length === 0) return fail();
          setZoomedOut(map.getZoom() < patches.minZoom);
          setState("ready");
        });
        cleanup = () => {
          clearTimeout(timeout);
          map.remove();
          maplibre.removeProtocol("pmtiles");
        };
      } catch {
        if (active) setState("failed");
      }
    };

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void start();
    }, { rootMargin: "200px 0px" });
    observer.observe(frame);
    return () => {
      active = false;
      observer.disconnect();
      cleanup?.();
    };
  }, [extent, boundary, patches, colours]);

  return (
    <figure className="place-map" data-state={state}>
      <div ref={frameRef} className="place-map-frame" role="img" aria-label={text.label} />
      <figcaption className="place-map-caption">
        {state === "ready" && !zoomedOut ? <span className="place-map-key"><span className="place-map-swatch" aria-hidden="true" style={{ background: colours.patch }} /> {text.key}</span> : null}
        {state === "ready" && zoomedOut ? <span>{text.zoomedOut}</span> : null}
        {state === "failed" ? <span role="status">{text.failed}</span> : null}
        <a href={exploreHref}>{text.open}</a>
        <small>{text.attribution}</small>
      </figcaption>
    </figure>
  );
}
