"use client";

import { useEffect, useRef, useState } from "react";
import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { PlaceExtent } from "@/lib/place-pages/map-view";
import type { TerrainPrototype } from "@/lib/place-pages/terrain-prototype";

/**
 * PROTOTYPE. A tilted view of one place: the loss patches Explore draws, draped
 * over a ground model, with the place's outline. See
 * lib/place-pages/terrain-prototype.ts for what the ground model is and where
 * it comes from.
 *
 * One elevation source feeds both the surface and its shading: two sources on
 * one archive make two identical range requests, and Chromium drops one of
 * them on some loads (the fault fixed in Explore's outlines on 2026-11-10).
 */

const MAPLIBRE_WORKER_URL = "/maplibre/6.9.0/maplibre-gl-worker.mjs";
const LOAD_TIMEOUT_MS = 30_000;
const TILT = 62;
const TURN_STEP = 30;

type State = "static" | "waiting" | "loading" | "ready" | "failed";

export type PlaceTerrainProps = Readonly<{
  extent: PlaceExtent;
  terrain: TerrainPrototype;
  boundary: Readonly<{ url: string; sourceLayer: string; featureId: string }>;
  patches: Readonly<{ url: string; sourceLayer: string; yearProperty: string; minZoom: number; maxZoom: number }>;
  colours: Readonly<{ ground: string; outline: string; patch: string; shadow: string }>;
  text: Readonly<{
    label: string; key: string; says: string; turnLeft: string; turnRight: string; flat: string; tilted: string;
    reset: string; showLoss: string; hint: string; failed: string; attribution: string;
  }>;
}>;

export function PlaceTerrain({ extent, terrain, boundary, patches, colours, text }: PlaceTerrainProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [state, setState] = useState<State>("static");
  const [tilted, setTilted] = useState(true);
  const [showLoss, setShowLoss] = useState(true);

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
          attributionControl: false,
          cooperativeGestures: true,
          bounds: [extent[0], extent[1], extent[2], extent[3]],
          fitBoundsOptions: { padding: 24, maxZoom: patches.maxZoom, pitch: TILT, bearing: terrain.bearing },
          maxBounds: [[terrain.bounds[0], terrain.bounds[1]], [terrain.bounds[2], terrain.bounds[3]]],
          minZoom: terrain.minZoom,
          maxZoom: patches.maxZoom,
          maxPitch: 75,
          style: {
            version: 8,
            sources: {
              terrain: {
                type: "raster-dem",
                url: `pmtiles://${new URL(terrain.url, window.location.origin).href}`,
                encoding: "terrarium",
                tileSize: terrain.tileSize,
              },
              boundary: { type: "vector", url: `pmtiles://${boundary.url}` },
              patches: { type: "vector", url: `pmtiles://${patches.url}` },
            },
            terrain: { source: "terrain", exaggeration: 1 },
            sky: {
              "sky-color": "#cfd9d6",
              "horizon-color": "#e6e9e2",
              "fog-color": "#e6e9e2",
              "sky-horizon-blend": 0.6,
              "horizon-fog-blend": 0.7,
              "fog-ground-blend": 0.35,
              "atmosphere-blend": 0,
            },
            layers: [
              { id: "ground", type: "background", paint: { "background-color": colours.ground } },
              {
                id: "shade",
                type: "hillshade",
                source: "terrain",
                paint: {
                  "hillshade-shadow-color": colours.shadow,
                  "hillshade-highlight-color": "#ffffff",
                  "hillshade-accent-color": colours.shadow,
                  "hillshade-exaggeration": 0.3,
                  "hillshade-illumination-anchor": "map",
                },
              },
              // Above the shading, so a patch keeps the colour its key shows.
              {
                id: "patches",
                type: "fill",
                source: "patches",
                "source-layer": patches.sourceLayer,
                minzoom: patches.minZoom,
                filter: ["all", [">", ["get", patches.yearProperty], 1984], ["<=", ["get", patches.yearProperty], 2022]],
                paint: { "fill-color": colours.patch, "fill-opacity": 0.9 },
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
        mapRef.current = map;
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
          setState("ready");
        });
        cleanup = () => {
          clearTimeout(timeout);
          mapRef.current = null;
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
  }, [extent, terrain, boundary, patches, colours]);

  const turn = (degrees: number) => mapRef.current?.easeTo({ bearing: mapRef.current.getBearing() + degrees, duration: 500 });
  const tilt = () => {
    const next = !tilted;
    setTilted(next);
    mapRef.current?.easeTo({ pitch: next ? TILT : 0, duration: 600 });
  };
  const reset = () => {
    setTilted(true);
    mapRef.current?.fitBounds([extent[0], extent[1], extent[2], extent[3]], { padding: 24, maxZoom: patches.maxZoom, pitch: TILT, bearing: terrain.bearing, duration: 600 });
  };
  const loss = (next: boolean) => {
    setShowLoss(next);
    mapRef.current?.setLayoutProperty("patches", "visibility", next ? "visible" : "none");
  };

  const ready = state === "ready";
  return (
    <figure className="place-terrain" data-state={state}>
      <div ref={frameRef} className="place-terrain-frame" role="img" aria-label={text.label} />
      {ready ? (
        <div className="place-terrain-controls">
          <button type="button" className="btn btn--outline" onClick={() => turn(-TURN_STEP)}>{text.turnLeft}</button>
          <button type="button" className="btn btn--outline" onClick={() => turn(TURN_STEP)}>{text.turnRight}</button>
          <button type="button" className="btn btn--outline" onClick={tilt}>{tilted ? text.flat : text.tilted}</button>
          <button type="button" className="btn btn--outline" onClick={reset}>{text.reset}</button>
          <label className="place-terrain-toggle">
            <input type="checkbox" checked={showLoss} onChange={(event) => loss(event.target.checked)} /> {text.showLoss}
          </label>
        </div>
      ) : null}
      <figcaption className="place-map-caption">
        {ready ? <span className="place-map-key"><span className="place-map-swatch" aria-hidden="true" style={{ background: colours.patch }} /> {text.key}</span> : null}
        {state === "failed" ? <span role="status">{text.failed}</span> : null}
        <span>{text.says}</span>
        {ready ? <span className="place-terrain-hint">{text.hint}</span> : null}
        <small>{text.attribution}</small>
      </figcaption>
    </figure>
  );
}
