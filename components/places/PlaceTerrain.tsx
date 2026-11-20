"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { PlaceExtent } from "@/lib/place-pages/map-view";
import type { TerrainPrototype } from "@/lib/place-pages/terrain-prototype";

/**
 * PROTOTYPE. A tilted view of one place: the loss patches Explore draws, draped
 * over the land, with the place's outline. In the close-up area the land is a
 * 1 m laser survey (treetops and roofs, or bare ground) under an air photo. See
 * lib/place-pages/terrain-prototype.ts for what each source is.
 *
 * Shading comes from two places. The far 30 m archive shades everything at every
 * zoom. From zoom 12 the elevation source that is the surface adds its own finer
 * shading, which exists only inside the close-up area: its archive has no tiles
 * past zoom 11 anywhere else, and a missing tile draws nothing. The surface and
 * its shading share one source, never two sources on one archive: those make
 * identical range requests, and Chromium drops one of them on some loads (the
 * fault fixed in Explore's outlines on 2026-11-10). The other elevation source
 * is not loaded until it is chosen.
 */

const MAPLIBRE_WORKER_URL = "/maplibre/6.9.0/maplibre-gl-worker.mjs";
const LOAD_TIMEOUT_MS = 30_000;
const TILT = 62;
const TURN_STEP = 30;
/** The first zoom the finer elevation tiles exist at. */
const CLOSE_SHADE_FROM = 12;

type State = "static" | "waiting" | "loading" | "ready" | "failed";
type Shape = "surface" | "ground";

export type PlaceTerrainProps = Readonly<{
  extent: PlaceExtent;
  terrain: TerrainPrototype;
  boundary: Readonly<{ url: string; sourceLayer: string; featureId: string }>;
  patches: Readonly<{ url: string; sourceLayer: string; yearProperty: string; minZoom: number; maxZoom: number }>;
  colours: Readonly<{ ground: string; outline: string; patch: string; shadow: string; highlight: string; sky: string; horizon: string }>;
  text: Readonly<{
    label: string; key: string; says: string; closeUpSays: string; turnLeft: string; turnRight: string; flat: string; tilted: string;
    reset: string; closeUp: string; zoomIn: string; zoomOut: string; surfaceGroup: string; surface: string; ground: string;
    layersGroup: string; showPhoto: string; showHeight: string; showLoss: string; heightKey: string;
    heightNote: string; closeUpArea: string; hint: string; failed: string; attribution: string;
  }>;
  /** The height classes, lowest first, each with the colour its tiles were built with and its wording. */
  heights: readonly Readonly<{ colour: string; label: string }>[];
}>;

export function PlaceTerrain({ extent, terrain, boundary, patches, colours, text, heights }: PlaceTerrainProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const shapeName = useId();
  const [state, setState] = useState<State>("static");
  const [tilted, setTilted] = useState(true);
  const [shape, setShape] = useState<Shape>("surface");
  const [showPhoto, setShowPhoto] = useState(true);
  const [showHeight, setShowHeight] = useState(false);
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
        const archive = (path: string) => `pmtiles://${new URL(path, window.location.origin).href}`;
        const outline: ExpressionSpecification = ["==", ["get", "id"], boundary.featureId];
        const [west, south, east, north] = terrain.closeUp.bounds;
        const shade = (id: string, source: Shape | "far", visible: boolean) => ({
          id,
          type: "hillshade" as const,
          source,
          ...(source === "far" ? {} : { minzoom: CLOSE_SHADE_FROM }),
          layout: { visibility: visible ? ("visible" as const) : ("none" as const) },
          paint: {
            "hillshade-shadow-color": colours.shadow,
            "hillshade-highlight-color": colours.highlight,
            "hillshade-accent-color": colours.shadow,
            "hillshade-exaggeration": 0.3,
            "hillshade-illumination-anchor": "map" as const,
          },
        });
        const map = new maplibre.Map({
          container: frame,
          attributionControl: false,
          cooperativeGestures: true,
          bounds: [extent[0], extent[1], extent[2], extent[3]],
          fitBoundsOptions: { padding: 24, maxZoom: patches.maxZoom, pitch: TILT, bearing: terrain.bearing },
          maxBounds: [[terrain.bounds[0], terrain.bounds[1]], [terrain.bounds[2], terrain.bounds[3]]],
          minZoom: terrain.minZoom,
          maxZoom: terrain.maxZoom,
          maxPitch: 80,
          style: {
            version: 8,
            sources: {
              far: { type: "raster-dem", url: archive(terrain.far), encoding: "terrarium", tileSize: terrain.tileSize },
              surface: { type: "raster-dem", url: archive(terrain.surface), encoding: "terrarium", tileSize: terrain.tileSize },
              ground: { type: "raster-dem", url: archive(terrain.ground), encoding: "terrarium", tileSize: terrain.tileSize },
              photo: { type: "raster", url: archive(terrain.closeUp.photo), tileSize: 256 },
              height: { type: "raster", url: archive(terrain.closeUp.height), tileSize: 256 },
              boundary: { type: "vector", url: `pmtiles://${boundary.url}` },
              patches: { type: "vector", url: `pmtiles://${patches.url}` },
              closeup: {
                type: "geojson",
                data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[west, south], [east, south], [east, north], [west, north], [west, south]] } },
              },
            },
            terrain: { source: "surface", exaggeration: 1 },
            sky: {
              "sky-color": colours.sky,
              "horizon-color": colours.horizon,
              "fog-color": colours.horizon,
              "sky-horizon-blend": 0.6,
              "horizon-fog-blend": 0.7,
              "fog-ground-blend": 0.35,
              "atmosphere-blend": 0,
            },
            layers: [
              { id: "ground", type: "background", paint: { "background-color": colours.ground } },
              shade("shade-far", "far", true),
              shade("shade-surface", "surface", true),
              shade("shade-ground", "ground", false),
              { id: "photo", type: "raster", source: "photo", paint: { "raster-fade-duration": 0 } },
              // Classed tiles: nearest keeps a class's own colour at its edge.
              { id: "height", type: "raster", source: "height", layout: { visibility: "none" }, paint: { "raster-opacity": 0.85, "raster-resampling": "nearest", "raster-fade-duration": 0 } },
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
              { id: "closeup", type: "line", source: "closeup", paint: { "line-color": colours.outline, "line-width": 1.5, "line-dasharray": [3, 2] } },
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
  const closeUp = () => {
    setTilted(true);
    const view = terrain.closeUp.view;
    mapRef.current?.flyTo({ center: [view.center[0], view.center[1]], zoom: view.zoom, bearing: view.bearing, pitch: view.pitch, duration: 2500 });
  };
  const show = (layer: string, visible: boolean) => mapRef.current?.setLayoutProperty(layer, "visibility", visible ? "visible" : "none");
  const chooseShape = (next: Shape) => {
    setShape(next);
    const map = mapRef.current;
    if (!map) return;
    // The surface and its shading change together, so only one elevation archive is being read.
    show(`shade-${shape}`, false);
    map.setTerrain({ source: next, exaggeration: 1 });
    show(`shade-${next}`, true);
  };

  const ready = state === "ready";
  return (
    <figure className="place-terrain" data-state={state}>
      <div ref={frameRef} className="place-terrain-frame" role="img" aria-label={text.label} />
      {ready ? (
        <>
          <div className="place-terrain-controls">
            <button type="button" className="btn btn--outline" onClick={closeUp}>{text.closeUp}</button>
            <button type="button" className="btn btn--outline" onClick={reset}>{text.reset}</button>
            <button type="button" className="btn btn--outline" onClick={() => mapRef.current?.zoomIn()}>{text.zoomIn}</button>
            <button type="button" className="btn btn--outline" onClick={() => mapRef.current?.zoomOut()}>{text.zoomOut}</button>
            <button type="button" className="btn btn--outline" onClick={() => turn(-TURN_STEP)}>{text.turnLeft}</button>
            <button type="button" className="btn btn--outline" onClick={() => turn(TURN_STEP)}>{text.turnRight}</button>
            <button type="button" className="btn btn--outline" onClick={tilt}>{tilted ? text.flat : text.tilted}</button>
          </div>
          <div className="place-terrain-controls">
            <fieldset className="place-terrain-group">
              <legend>{text.surfaceGroup}</legend>
              <label className="place-terrain-toggle">
                <input type="radio" name={shapeName} aria-label={text.surface} checked={shape === "surface"} onChange={() => chooseShape("surface")} /> {text.surface}
              </label>
              <label className="place-terrain-toggle">
                <input type="radio" name={shapeName} aria-label={text.ground} checked={shape === "ground"} onChange={() => chooseShape("ground")} /> {text.ground}
              </label>
            </fieldset>
            <fieldset className="place-terrain-group">
              <legend>{text.layersGroup}</legend>
              <label className="place-terrain-toggle">
                <input type="checkbox" aria-label={text.showPhoto} checked={showPhoto} onChange={(event) => { setShowPhoto(event.target.checked); show("photo", event.target.checked); }} /> {text.showPhoto}
              </label>
              <label className="place-terrain-toggle">
                <input type="checkbox" aria-label={text.showHeight} checked={showHeight} onChange={(event) => { setShowHeight(event.target.checked); show("height", event.target.checked); }} /> {text.showHeight}
              </label>
              <label className="place-terrain-toggle">
                <input type="checkbox" aria-label={text.showLoss} checked={showLoss} onChange={(event) => { setShowLoss(event.target.checked); show("patches", event.target.checked); }} /> {text.showLoss}
              </label>
            </fieldset>
          </div>
        </>
      ) : null}
      <figcaption className="place-map-caption">
        {ready ? <span className="place-map-key"><span className="place-map-swatch" aria-hidden="true" style={{ background: colours.patch }} /> {text.key}</span> : null}
        {ready ? <span className="place-map-key"><span className="place-terrain-dash" aria-hidden="true" /> {text.closeUpArea}</span> : null}
        {ready && showHeight ? (
          <span className="place-terrain-heights">
            <span>{text.heightKey}</span>
            <span className="place-terrain-height-classes">
              {heights.map((entry) => (
                <span className="place-map-key" key={entry.colour}>
                  <span className="place-map-swatch" aria-hidden="true" style={{ background: entry.colour }} /> {entry.label}
                </span>
              ))}
            </span>
            <span>{text.heightNote}</span>
          </span>
        ) : null}
        {state === "failed" ? <span role="status">{text.failed}</span> : null}
        <span>{text.says}</span>
        <span>{text.closeUpSays}</span>
        {ready ? <span className="place-terrain-hint">{text.hint}</span> : null}
        <small>{text.attribution}</small>
      </figcaption>
    </figure>
  );
}
