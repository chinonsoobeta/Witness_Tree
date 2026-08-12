"use client";

import { useEffect, useRef } from "react";
import type { Locale } from "@/lib/domain";
import { EXPLORE_MAP_COLOURS, type ExploreEvent } from "@/lib/explore";

const text = {
  en: { label: "Illustrative interactive map", unavailable: "Verified PMTiles are not yet published." },
  fr: { label: "Carte interactive illustrative", unavailable: "Les PMTiles vérifiés ne sont pas encore publiés." },
} as const;

export function ExploreMapClient({ events, locale }: Readonly<{ events: readonly ExploreEvent[]; locale: Locale }>) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    let cancelled = false;
    let map: import("maplibre-gl").Map | undefined;
    let protocol: import("pmtiles").Protocol | undefined;
    void Promise.all([import("maplibre-gl"), import("pmtiles")]).then(([maplibre, pmtiles]) => {
      if (cancelled || !container.current) return;
      protocol = new pmtiles.Protocol();
      maplibre.addProtocol("pmtiles", protocol.tile);
      map = new maplibre.Map({
        container: container.current,
        center: [-96, 56],
        zoom: 2.6,
        attributionControl: false,
        style: {
          version: 8,
          sources: { fixtures: { type: "geojson", data: { type: "FeatureCollection", features: events.map((event) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: event.coordinates }, properties: { id: event.id, mode: event.mode, label: event.name[locale], year: event.year } })) } } },
          layers: [
            { id: "ground", type: "background", paint: { "background-color": EXPLORE_MAP_COLOURS.ground } },
            { id: "fixtures", type: "circle", source: "fixtures", paint: { "circle-radius": 9, "circle-color": ["match", ["get", "mode"], "recorded-harvest", EXPLORE_MAP_COLOURS.harvest, "wildfire", EXPLORE_MAP_COLOURS.wildfire, "condition-recovery", EXPLORE_MAP_COLOURS.recovery, EXPLORE_MAP_COLOURS.observation], "circle-stroke-color": EXPLORE_MAP_COLOURS.ink, "circle-stroke-width": 2 } },
          ],
        },
      });
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
    }).catch(() => {
      if (container.current) container.current.dataset.state = "unavailable";
    });
    return () => {
      cancelled = true;
      map?.remove();
      if (protocol) void import("maplibre-gl").then((maplibre) => maplibre.removeProtocol("pmtiles"));
    };
  }, [events, locale]);
  return <section aria-label={text[locale].label}><div ref={container} className="explore-map" role="region" aria-label={text[locale].label} /><p className="explore-map-status">{text[locale].unavailable}</p></section>;
}
