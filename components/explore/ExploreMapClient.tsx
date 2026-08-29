"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { PRODUCT_NAME, type Locale } from "@/lib/domain";
import {
  BOUNDARY_OVERLAYS,
  EXPLORE_MAP_COLOURS,
  EXPLORE_PER_CELL_LAYER,
  EXPLORE_PRODUCTION_LAYER,
  perCellArchiveForYear,
  perCellSourceLayer,
  type BoundaryOverlayId,
  type ExploreMode,
  type PerCellArchive,
} from "@/lib/explore";

const text = {
  en: {
    label: "Verified province forest-loss map",
    loading: "Loading the verified 2020–2022 province aggregate map.",
    ready:
      "Showing the verified 2020–2022 province aggregate. Display boundaries are simplified and omit small islands.",
    readyPerCell:
      "Showing detected forest-loss patches for the selected interval, traced from the 30 m grid.",
    readyBoth:
      "Showing the verified 2020–2022 province aggregate, with detected forest-loss patches as you zoom in. Province display boundaries are simplified and omit small islands.",
    fallback:
      "The interactive PMTiles layer was unavailable, so this map is showing the verified GeoJSON compatibility fallback.",
    unavailable:
      "A verified geographic layer is not available for this mode. Choose Forest change to view the 2020–2022 province aggregate.",
    unavailableYear:
      "The verified province aggregate covers 2020–2022 and is not shown for an earlier selected year. Choose 2022 or later to view it.",
    error:
      "The verified map layer could not be loaded. The list and table alternatives remain available.",
    attribution: "Map sources",
    perCell:
      "Zoom in to see individual patches of detected forest loss, traced from the 30 m grid rather than generalized from it.",
    perCellLimits:
      "These patches are drawn, not counted. Below the closest zoom the map simplifies them and leaves out the smallest ones, and no figure on this site is derived from them. They have not been expert-reviewed. An area with no patch is not a claim that no loss happened there.",
    perCellLegend: "Detected loss patch, by what the official record shows",
    perCellHarvest: "A harvest is recorded in the same interval",
    perCellFire: "A fire is recorded in the same interval",
    perCellNeither:
      "Neither is recorded. The disturbance record cannot distinguish nothing recorded from outside the area it maps, so this is not evidence that neither happened.",
    legend: "Observed forest loss, percent of known forested hectares",
    province: "Province",
    period: "Period",
    lossHectares: "Observed loss (ha)",
    lossPercent: "Observed loss (%)",
    coverage: "Coverage",
    complete: "Complete required-input coverage",
  },
  fr: {
    label: "Carte vérifiée des pertes forestières provinciales",
    loading:
      "Chargement de la carte vérifiée de l’agrégat provincial de 2020 à 2022.",
    ready:
      "Affichage de l’agrégat provincial vérifié de 2020 à 2022. Les limites d’affichage sont simplifiées et omettent les petites îles.",
    readyPerCell:
      "Affichage des parcelles de perte forestière détectée pour l’intervalle choisi, tracées à partir de la grille de 30 m.",
    readyBoth:
      "Affichage de l’agrégat provincial vérifié de 2020 à 2022, avec les parcelles de perte forestière détectée au fur et à mesure du zoom. Les limites provinciales affichées sont simplifiées et omettent les petites îles.",
    fallback:
      "La couche PMTiles interactive n’était pas disponible; cette carte affiche donc la solution de repli GeoJSON vérifiée.",
    unavailable:
      "Aucune couche géographique vérifiée n’est disponible pour ce mode. Choisissez Changement forestier pour voir l’agrégat provincial de 2020 à 2022.",
    unavailableYear:
      "L’agrégat provincial vérifié couvre la période de 2020 à 2022 et n’est pas affiché pour une année antérieure. Choisissez 2022 ou une année ultérieure pour le voir.",
    error:
      "La couche cartographique vérifiée n’a pas pu être chargée. Les autres présentations en liste et en tableau demeurent disponibles.",
    attribution: "Sources de la carte",
    perCell:
      "Faites un zoom avant pour voir chaque parcelle de perte forestière détectée, tracée à partir de la grille de 30 m plutôt que généralisée.",
    perCellLimits:
      "Ces parcelles sont dessinées, et non comptées. Sous le zoom le plus rapproché, la carte les simplifie et omet les plus petites, et aucun chiffre de ce site n’en est tiré. Elles n’ont pas fait l’objet d’un examen par des experts. Une zone sans parcelle n’affirme pas qu’aucune perte n’y est survenue.",
    perCellLegend: "Parcelle de perte détectée, selon ce que montre le registre officiel",
    perCellHarvest: "Une récolte est consignée pour le même intervalle",
    perCellFire: "Un incendie est consigné pour le même intervalle",
    perCellNeither:
      "Ni l’un ni l’autre n’est consigné. Le registre des perturbations ne distingue pas l’absence de mention de l’extérieur de la zone qu’il cartographie; ce n’est donc pas une preuve que rien ne s’est produit.",
    legend:
      "Perte forestière observée, en pourcentage des hectares forestiers connus",
    province: "Province",
    period: "Période",
    lossHectares: "Perte observée (ha)",
    lossPercent: "Perte observée (%)",
    coverage: "Couverture",
    complete: "Couverture complète des entrées requises",
  },
} as const;

type MapSource = "pmtiles" | "geojson";
type MapState = "loading" | "ready" | "unavailable" | "error";
type Position = [number, number];
const PMTILES_LOAD_TIMEOUT_MS = 10_000;

// MapLibre resolves its worker as `new URL("./maplibre-gl-worker.mjs",
// import.meta.url)` relative to its own bundled chunk. The bundler does not
// emit that sibling module, so the default URL 404s and the map fails before
// any tile request is made. Serve the version-pinned worker from `public/`
// instead. `scripts/check-maplibre-worker-asset.mjs` proves these files are
// byte-identical to the installed maplibre-gl distribution.
const MAPLIBRE_WORKER_VERSION = "6.3.0";
const MAPLIBRE_WORKER_URL = `/maplibre/${MAPLIBRE_WORKER_VERSION}/maplibre-gl-worker.mjs`;
type ProvinceFeature = {
  id: string;
  properties: {
    observed_loss_percent: number;
    province_name_en: string;
    province_name_fr: string;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: Position[][] | Position[][][];
  };
};

const project = ([longitude, latitude]: Position) => [
  ((longitude + 141) / 89) * 1000,
  ((70 - latitude) / 30) * 500,
];
const ringPath = (ring: Position[]) =>
  `${ring.map((point, index) => `${index ? "L" : "M"}${project(point).join(" ")}`).join(" ")}Z`;
const featurePath = (feature: ProvinceFeature) => {
  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates as Position[][]]
      : (feature.geometry.coordinates as Position[][][]);
  return polygons.flatMap((polygon) => polygon.map(ringPath)).join(" ");
};
const lossColour = (value: number) =>
  value >= 3
    ? EXPLORE_MAP_COLOURS.loss3
    : value >= 2
      ? EXPLORE_MAP_COLOURS.loss2
      : value >= 1
        ? EXPLORE_MAP_COLOURS.loss1
        : EXPLORE_MAP_COLOURS.loss0;

const provinceLayers: StyleSpecification["layers"] = [
  {
    id: `${EXPLORE_PRODUCTION_LAYER.sourceLayer}-fill`,
    type: "fill",
    source: EXPLORE_PRODUCTION_LAYER.sourceLayer,
    "source-layer": EXPLORE_PRODUCTION_LAYER.sourceLayer,
    paint: {
      "fill-color": [
        "step",
        ["get", "observed_loss_percent"],
        EXPLORE_MAP_COLOURS.loss0,
        1,
        EXPLORE_MAP_COLOURS.loss1,
        2,
        EXPLORE_MAP_COLOURS.loss2,
        3,
        EXPLORE_MAP_COLOURS.loss3,
      ],
      "fill-opacity": 0.88,
    },
  },
  {
    id: `${EXPLORE_PRODUCTION_LAYER.sourceLayer}-outline`,
    type: "line",
    source: EXPLORE_PRODUCTION_LAYER.sourceLayer,
    "source-layer": EXPLORE_PRODUCTION_LAYER.sourceLayer,
    paint: {
      "line-color": EXPLORE_MAP_COLOURS.ink,
      "line-width": 1.25,
    },
  },
];

const buildStyle = (
  province: boolean,
  archive: PerCellArchive | null,
  overlays: readonly BoundaryOverlayId[],
): StyleSpecification => {
  const sources: StyleSpecification["sources"] = {};
  const layers: StyleSpecification["layers"] = [
    // The palette is a fixed printed-map palette: every colour in it, including
    // the near-black boundary ink, assumes it sits on this light ground. Without
    // an explicit background the canvas is transparent wherever no polygon is
    // drawn, so in dark mode the card showed through and boundary lines outside
    // the province fills became invisible. The SVG fallback already paints the
    // same ground, so this also makes the two paths agree.
    { id: "ground", type: "background", paint: { "background-color": EXPLORE_MAP_COLOURS.ground } },
  ];
  if (province) {
    sources[EXPLORE_PRODUCTION_LAYER.sourceLayer] = {
      type: "vector",
      url: `pmtiles://${EXPLORE_PRODUCTION_LAYER.url}`,
      bounds: [-141, 41, -52, 70],
    };
    layers.push(...provinceLayers);
  }
  if (archive) {
    sources[EXPLORE_PER_CELL_LAYER.sourceId] = {
      type: "vector",
      url: `pmtiles://${archive.url}`,
      bounds: [-141, 41, -52, 84],
    };
    layers.push({
      id: `${EXPLORE_PER_CELL_LAYER.sourceId}-fill`,
      type: "fill",
      source: EXPLORE_PER_CELL_LAYER.sourceId,
      "source-layer": perCellSourceLayer(archive.interval),
      minzoom: EXPLORE_PER_CELL_LAYER.minZoom,
      paint: {
        // A patch is coloured by what the official record shows for the same
        // interval, not by what happened to it. "Neither recorded" gets its
        // own colour and its own sentence in the legend, because the
        // disturbance rasters encode nothing-recorded and
        // outside-the-mapped-area identically and cannot tell them apart.
        "fill-color": [
          "case",
          [">", ["get", "harvest"], 0],
          EXPLORE_MAP_COLOURS.harvest,
          [">", ["get", "fire"], 0],
          EXPLORE_MAP_COLOURS.wildfire,
          EXPLORE_MAP_COLOURS.loss3,
        ],
        "fill-opacity": 0.9,
      },
    });
  }
  // Boundaries are drawn last so they sit above the data they frame, and as
  // lines only. A filled boundary would compete with the loss ramp and invite
  // reading a district's colour as a measurement of that district.
  for (const id of overlays) {
    const overlay = BOUNDARY_OVERLAYS[id];
    if (!overlay.available || !overlay.url || !overlay.sourceLayer) continue;
    const sourceId = `boundary-${id}`;
    sources[sourceId] = {
      type: "vector",
      url: `pmtiles://${overlay.url}`,
      bounds: [-141, 41, -52, 84],
    };
    layers.push({
      id: `${sourceId}-line`,
      type: "line",
      source: sourceId,
      "source-layer": overlay.sourceLayer,
      paint: {
        "line-color": overlay.colour ?? EXPLORE_MAP_COLOURS.ink,
        // Reference geometry has to stay subordinate to the data it frames.
        // At a national view the southern districts are only a few pixels
        // across, so a constant-width line turns them into a solid mass that
        // reads as the subject of the map rather than the frame around it.
        "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.4, 5, 0.7, 10, 1.4],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.45, 5, 0.6, 10, 0.8],
        ...(overlay.dash ? { "line-dasharray": [...overlay.dash] } : {}),
      },
    });
  }

  return {
    version: 8,
    name: `${PRODUCT_NAME.en} verified province forest-loss map`,
    sources,
    layers,
  };
};

const symbol = (className: string) => (
  <i className={`loss-swatch ${className}`} aria-hidden="true" />
);

export function ExploreMapClient({
  locale,
  mode,
  year,
  overlays = [],
}: Readonly<{
  locale: Locale;
  mode: ExploreMode;
  year: number;
  overlays?: readonly BoundaryOverlayId[];
}>) {
  const statusId = useId();
  const attributionId = useId();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // The verified province aggregate covers 2020-2022 only. The per-cell
  // detail covers every annual interval from 1984-1985 to 2021-2022, so the
  // map is now offered for the whole series and the two layers are shown
  // wherever each one actually has something to say.
  const perCellArchive =
    mode === "forest-change" ? perCellArchiveForYear(year) : null;
  const provinceAvailable = mode === "forest-change" && year >= 2022;
  const available = provinceAvailable || perCellArchive !== null;
  // A stable primitive, so the effect re-runs when the selection changes
  // rather than on every render of a fresh array literal.
  const overlayKey = overlays.join(",");
  const [features, setFeatures] = useState<ProvinceFeature[]>([]);
  const [source, setSource] = useState<MapSource | null>(null);
  const [failed, setFailed] = useState(false);
  const state: MapState = !available
    ? "unavailable"
    : failed
      ? "error"
      : source
        ? "ready"
        : "loading";
  useEffect(() => {
    if (!available) return;

    const controller = new AbortController();
    let active = true;
    let fallbackStarted = false;
    let map: MapLibreMap | null = null;
    let maplibre: typeof import("maplibre-gl") | null = null;
    let protocolRegistered = false;
    let pmtilesLoaded = false;
    let pmtilesTimeout: ReturnType<typeof setTimeout> | null = null;

    void Promise.resolve().then(() => {
      if (!active) return;
      setFeatures([]);
      setSource(null);
      setFailed(false);
    });

    const loadGeoJsonFallback = async () => {
      if (fallbackStarted) return;
      fallbackStarted = true;
      // The compatibility fallback is the province aggregate and nothing
      // else. For a year the aggregate does not cover there is nothing to
      // fall back to, and drawing 2020-2022 provinces under a 1995 label
      // would be worse than showing the failure.
      if (!provinceAvailable) {
        if (active) setFailed(true);
        return;
      }
      try {
        const response = await fetch(
          EXPLORE_PRODUCTION_LAYER.compatibilityGeoJsonUrl,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(`Map response ${response.status}`);
        const collection = (await response.json()) as {
          features: ProvinceFeature[];
        };
        if (
          collection.features.length !== EXPLORE_PRODUCTION_LAYER.rows.length
        ) {
          throw new Error("Unexpected province feature count");
        }
        if (!active) return;
        setFeatures(collection.features);
        setSource("geojson");
        setFailed(false);
      } catch (error: unknown) {
        if (
          active &&
          !(error instanceof DOMException && error.name === "AbortError")
        )
          setFailed(true);
      }
    };

    pmtilesTimeout = setTimeout(() => {
      if (!active || pmtilesLoaded) return;
      map?.remove();
      map = null;
      if (protocolRegistered) {
        maplibre?.removeProtocol("pmtiles");
        protocolRegistered = false;
      }
      void loadGeoJsonFallback();
    }, PMTILES_LOAD_TIMEOUT_MS);

    const initializePmtiles = async () => {
      try {
        const [maplibreModule, { Protocol }] = await Promise.all([
          import("maplibre-gl"),
          import("pmtiles"),
        ]);
        if (!active || !mapContainerRef.current) {
          if (active) void loadGeoJsonFallback();
          return;
        }
        maplibre = maplibreModule;
        maplibre.setWorkerUrl(MAPLIBRE_WORKER_URL);
        const protocol = new Protocol();
        maplibre.addProtocol("pmtiles", protocol.tile);
        protocolRegistered = true;
        map = new maplibre.Map({
          container: mapContainerRef.current,
          style: buildStyle(provinceAvailable, perCellArchive, overlays),
          center: [-96, 56],
          zoom: 2.6,
          minZoom: 1.5,
          // The per-cell layer is only drawn from zoom 8, so the map has to
          // reach it. Without an archive there is nothing past the province
          // aggregate to magnify and the old ceiling still applies.
          maxZoom: perCellArchive ? EXPLORE_PER_CELL_LAYER.maxZoom : 6,
          attributionControl: false,
        });
        map.once("load", () => {
          if (!active) return;
          if (pmtilesTimeout) clearTimeout(pmtilesTimeout);
          pmtilesLoaded = true;
          setSource("pmtiles");
          setFailed(false);
        });
        map.on("error", () => {
          if (pmtilesLoaded) return;
          map?.remove();
          map = null;
          if (protocolRegistered) {
            maplibre?.removeProtocol("pmtiles");
            protocolRegistered = false;
          }
          void loadGeoJsonFallback();
        });
      } catch {
        if (active) void loadGeoJsonFallback();
      }
    };

    void initializePmtiles();
    return () => {
      active = false;
      controller.abort();
      if (pmtilesTimeout) clearTimeout(pmtilesTimeout);
      map?.remove();
      if (protocolRegistered) maplibre?.removeProtocol("pmtiles");
    };
    // overlayKey stands in for `overlays`: the prop is a fresh array on every
    // render of the server parent, so depending on it directly would tear down
    // and rebuild the whole map each time. The key changes exactly when the
    // selected overlay set changes, which is the only thing the style needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, provinceAvailable, perCellArchive, overlayKey]);
  const readyKey = provinceAvailable
    ? perCellArchive
      ? "readyBoth"
      : "ready"
    : "readyPerCell";
  const message =
    state === "unavailable" && mode === "forest-change"
      ? text[locale].unavailableYear
      : source === "geojson"
        ? text[locale].fallback
        : state === "ready"
          ? text[locale][readyKey]
          : text[locale][state];
  const number = new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    maximumFractionDigits: 2,
  });
  return (
    <section aria-label={text[locale].label}>
      <div
        className="explore-map"
        role="region"
        aria-label={text[locale].label}
        aria-describedby={`${statusId} ${attributionId}`}
        data-state={state}
        data-map-source={
          source === "geojson" ? "geojson-fallback" : source ?? undefined
        }
      >
        {available ? (
          <>
            <div
              ref={mapContainerRef}
              className="explore-map-canvas"
              role="img"
              aria-label={text[locale].label}
              aria-hidden={state !== "ready" || source !== "pmtiles"}
            />
            {state === "ready" && source === "geojson" ? (
          <svg
            viewBox="0 0 1000 500"
            role="img"
            aria-label={text[locale].label}
          >
            <rect width="1000" height="500" fill={EXPLORE_MAP_COLOURS.ground} />
            {features.map((feature) => (
              <path
                key={feature.id}
                d={featurePath(feature)}
                fill={lossColour(feature.properties.observed_loss_percent)}
                stroke={EXPLORE_MAP_COLOURS.ink}
                strokeWidth="1.5"
                fillRule="evenodd"
              >
                <title>{`${locale === "fr" ? feature.properties.province_name_fr : feature.properties.province_name_en}: ${number.format(feature.properties.observed_loss_percent)}%`}</title>
              </path>
            ))}
          </svg>
            ) : null}
            {state !== "ready" ? (
              <p className="explore-map-panel">{message}</p>
            ) : null}
          </>
        ) : (
          <p className="explore-map-panel">{message}</p>
        )}
      </div>
      <p
        id={statusId}
        className="explore-map-status"
        role={state === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        {message}
      </p>
      <p id={attributionId} className="explore-map-attribution">
        {text[locale].attribution}:{" "}
        <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>
          {EXPLORE_PRODUCTION_LAYER.attribution[locale]}
        </a>
      </p>
      {perCellArchive ? (
        <div className="explore-map-data">
          <strong>{text[locale].perCellLegend}</strong>
          <ul
            className="explore-map-legend"
            aria-label={text[locale].perCellLegend}
          >
            <li>
              {symbol("patch-harvest")}
              {text[locale].perCellHarvest}
            </li>
            <li>
              {symbol("patch-fire")}
              {text[locale].perCellFire}
            </li>
            <li>
              {symbol("patch-none")}
              {text[locale].perCellNeither}
            </li>
          </ul>
          <p>{text[locale].perCell}</p>
          <p>{text[locale].perCellLimits}</p>
        </div>
      ) : null}
      {provinceAvailable ? (
        <div className="explore-map-data">
          <strong>{text[locale].legend}</strong>
          <ul className="explore-map-legend" aria-label={text[locale].legend}>
            <li>{symbol("loss-0")}0–&lt;1%</li>
            <li>{symbol("loss-1")}1–&lt;2%</li>
            <li>{symbol("loss-2")}2–&lt;3%</li>
            <li>{symbol("loss-3")}3%+</li>
          </ul>
          <div className="table-scroll">
            <table>
              <caption>
                {text[locale].label}: {EXPLORE_PRODUCTION_LAYER.period}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{text[locale].province}</th>
                  <th scope="col">{text[locale].period}</th>
                  <th scope="col">{text[locale].lossHectares}</th>
                  <th scope="col">{text[locale].lossPercent}</th>
                  <th scope="col">{text[locale].coverage}</th>
                </tr>
              </thead>
              <tbody>
                {EXPLORE_PRODUCTION_LAYER.rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.name[locale]}</th>
                    <td>{EXPLORE_PRODUCTION_LAYER.period}</td>
                    <td>{number.format(row.observedLossHectares)}</td>
                    <td>{number.format(row.observedLossPercent)}</td>
                    <td>{text[locale].complete}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
