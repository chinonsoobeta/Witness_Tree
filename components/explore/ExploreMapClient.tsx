"use client";

import { useEffect, useRef, useState } from "react";
import type {
  FilterSpecification,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  StyleSpecification,
} from "maplibre-gl";
import { colon, formatNumber, formatPercent, labelled, PRODUCT_NAME, type Locale } from "@/lib/domain";
import { chooseScaleBar, metresPerPixel, type ScaleBar } from "@/lib/explore/map-scale";
import {
  BOUNDARY_OVERLAYS,
  EXPLORE_MAP_COLOURS,
  EXPLORE_MAP_VIEWS,
  EXPLORE_PER_CELL_LAYER,
  EXPLORE_PRODUCTION_LAYER,
  formatUnknownSharePercent,
  perCellArchiveForYear,
  perCellCauseForMode,
  perCellSourceLayer,
  type BoundaryOverlayId,
  type ExploreMapView,
  type ExploreMode,
  type PerCellArchive,
  type PerCellCause,
} from "@/lib/explore";
import {
  boundaryReadout,
  type BoundarySelection,
  type RidingBoundaryMeasurement,
} from "@/lib/explore/boundary-readout";

const text = {
  en: {
    label: "Forest loss map",
    loading: "Loading the map layers for the selected year.",
    ready:
      "Showing the provisional province aggregate, which covers 2020 to 2022 and does not follow the year control. Display boundaries are simplified and omit small islands.",
    readyPerCell:
      "Showing detected forest-loss patches for the selected annual interval, traced from the 30 m grid. Patches are held for every interval from 1984–1985 to 2021–2022; the year control chooses which one is drawn.",
    readyHarvest:
      "Showing only the detected forest-loss patches that the national disturbance record marks as harvest in the selected interval.",
    readyFire:
      "Showing only the detected forest-loss patches that the national disturbance record marks as fire in the selected interval.",
    readyBoth:
      "Showing two layers with different periods: detected forest-loss patches for the selected annual interval, drawn as you zoom in and available for every interval from 1984–1985 to 2021–2022, over the provisional province aggregate, which covers 2020 to 2022 and does not follow the year control. Province display boundaries are simplified and omit small islands.",
    fallbackTimeout:
      "The interactive PMTiles layer did not become ready within 10 seconds, so this map is showing the published GeoJSON compatibility fallback.",
    fallbackError:
      "The interactive PMTiles layer reported an error, so this map is showing the published GeoJSON compatibility fallback.",
    unavailable:
      "Condition and recovery needs the annual land-cover class series, which has not been acquired or admitted. It is not shown for any year. Forest loss, Recorded harvest and Wildfire are unaffected.",
    unavailableYear:
      "Detected patches cover the annual intervals from 1984–1985 to 2021–2022. Choose 2022 or an earlier year to see this mode.",
    error:
      "The map layer reported an error and could not be loaded. The list and table alternatives remain available.",
    errorTimeout:
      "The map layer did not become ready within 10 seconds and no compatibility fallback covers this selection. The list and table alternatives remain available.",
    retry: "Retry the interactive map",
    attribution: "Map sources",
    perCell:
      "Zoom in to see individual patches of detected forest loss, traced from the 30 m grid rather than generalized from it. One annual interval is drawn at a time, chosen by the year control, from the intervals running 1984–1985 to 2021–2022.",
    perCellLimits:
      "These patches are drawn, not counted. Below the closest zoom the map simplifies them and leaves out the smallest ones, so adding them up would come out short; the annual figures are counted from the exact cell inventory instead. Nobody has checked these patches against conditions on the ground. An area with no patch is not a claim that no loss happened there.",
    perCellLegend: "Detected loss patch, by what the official record shows",
    perCellLegendHarvest: "Detected loss patch with a recorded harvest",
    perCellLegendFire: "Detected loss patch with a recorded fire",
    perCellFilteredLimits:
      "Only patches the disturbance record marks this way are drawn. The record cannot tell nothing-recorded apart from outside the area it maps, so an empty area is not a claim that nothing happened there.",
    perCellHarvest: "A harvest is recorded in the same interval",
    perCellFire: "A fire is recorded in the same interval",
    perCellNeither:
      "Neither is recorded. The disturbance record cannot distinguish nothing recorded from outside the area it maps, so this is not evidence that neither happened.",
    legend: "Detected forest loss, percent of known forested hectares",
    province: "Province",
    period: "Period",
    lossHectares: "Detected loss (ha)",
    lossPercent: "Detected loss (%)",
    coverage: "Coverage",
    complete: "Every input pixel present",
    partial: "Some pixels unknown, so this is a minimum",
    unknownArea: "ha unknown",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    resetView: "Reset the view",
    zoomControls: "Map zoom",
    scale: "Scale",
    scaleBar: "Scale bar",
    mapPanel: "Map layers and legend",
    mapLayers: "Layers shown",
    boundary: "Boundary",
    jurisdiction: "Jurisdiction",
    clearBoundary: "Clear boundary",
    interval: "Interval",
    normalizedShare: "Detected loss share",
    totalLoss: "Detected loss",
    knownObservedSubtotal: "Known detected subtotal",
    provinceAggregate: "Provisional province aggregate, 2020 to 2022",
    detectedPatches: "Detected forest-loss patches",
    mapView: "Map view",
    framingViews:
      "These buttons are framing views only; use Zoom to patches to reach the patch layer.",
    patchesBelowZoom:
      "Detected-loss patches begin at zoom 8. The current view is below that threshold.",
    zoomToPatches: "Zoom to patches",
    national: "National",
    bc: "British Columbia",
    ab: "Alberta",
    on: "Ontario",
    qc: "Québec",
  },
  fr: {
    label: "Carte des pertes forestières",
    loading:
      "Chargement des couches cartographiques pour l’année choisie.",
    ready:
      "Affichage de l’agrégat provincial provisoire, qui couvre 2020 à 2022 et ne suit pas la commande d’année. Les limites d’affichage sont simplifiées et omettent les petites îles.",
    readyPerCell:
      "Affichage des parcelles de perte forestière détectée pour l’intervalle annuel choisi, tracées à partir de la grille de 30 m. Des parcelles existent pour chaque intervalle de 1984-1985 à 2021-2022; la commande d’année détermine celui qui est dessiné.",
    readyHarvest:
      "Affichage des seules parcelles de perte forestière détectée que le registre national des perturbations désigne comme récolte pour l’intervalle choisi.",
    readyFire:
      "Affichage des seules parcelles de perte forestière détectée que le registre national des perturbations désigne comme incendie pour l’intervalle choisi.",
    readyBoth:
      "Affichage de deux couches aux périodes différentes : les parcelles de perte forestière détectée pour l’intervalle annuel choisi, dessinées au fur et à mesure du zoom et offertes pour chaque intervalle de 1984-1985 à 2021-2022, par-dessus l’agrégat provincial provisoire, qui couvre 2020 à 2022 et ne suit pas la commande d’année. Les limites provinciales affichées sont simplifiées et omettent les petites îles.",
    fallbackTimeout:
      "La couche PMTiles interactive n’était pas prête après 10 secondes; cette carte affiche donc la solution de repli GeoJSON publiée.",
    fallbackError:
      "La couche PMTiles interactive a signalé une erreur; cette carte affiche donc la solution de repli GeoJSON publiée.",
    unavailable:
      "L’état et le rétablissement exigent la série annuelle des classes de couverture terrestre, qui n’a été ni acquise ni admise. Ce mode n’est affiché pour aucune année. La perte forestière, les récoltes consignées et les incendies ne sont pas touchés.",
    unavailableYear:
      "Les parcelles détectées couvrent les intervalles annuels de 1984-1985 à 2021-2022. Choisissez 2022 ou une année antérieure pour voir ce mode.",
    error:
      "La couche cartographique a signalé une erreur et n’a pas pu être chargée. Les autres présentations en liste et en tableau demeurent disponibles.",
    errorTimeout:
      "La couche cartographique n’était pas prête après 10 secondes et aucune solution de repli ne couvre cette sélection. Les autres présentations en liste et en tableau demeurent disponibles.",
    retry: "Réessayer la carte interactive",
    attribution: "Sources de la carte",
    perCell:
      "Faites un zoom avant pour voir chaque parcelle de perte forestière détectée, tracée à partir de la grille de 30 m plutôt que généralisée. Un seul intervalle annuel est dessiné à la fois, choisi par la commande d’année, parmi les intervalles allant de 1984-1985 à 2021-2022.",
    perCellLimits:
      "Ces parcelles sont dessinées, et non comptées. Sous le zoom le plus rapproché, la carte les simplifie et omet les plus petites ; les additionner donnerait donc un total trop faible. Les chiffres annuels sont plutôt comptés à partir de l’inventaire exact des cellules. Personne n’a vérifié ces parcelles sur le terrain. Une zone sans parcelle n’affirme pas qu’aucune perte n’y est survenue.",
    perCellLegend: "Parcelle de perte détectée, selon ce que montre le registre officiel",
    perCellLegendHarvest: "Parcelle de perte détectée avec récolte consignée",
    perCellLegendFire: "Parcelle de perte détectée avec incendie consigné",
    perCellFilteredLimits:
      "Seules les parcelles ainsi désignées par le registre des perturbations sont dessinées. Le registre ne distingue pas l’absence de mention de l’extérieur de la zone qu’il cartographie; une zone vide n’affirme donc pas que rien ne s’y est produit.",
    perCellHarvest: "Une récolte est consignée pour le même intervalle",
    perCellFire: "Un incendie est consigné pour le même intervalle",
    perCellNeither:
      "Ni l’un ni l’autre n’est consigné. Le registre des perturbations ne distingue pas l’absence de mention de l’extérieur de la zone qu’il cartographie; ce n’est donc pas une preuve que rien ne s’est produit.",
    legend:
      "Perte forestière détectée, en pourcentage des hectares forestiers connus",
    province: "Province",
    period: "Période",
    lossHectares: "Perte détectée (ha)",
    lossPercent: "Perte détectée (%)",
    coverage: "Couverture",
    complete: "Tous les pixels d’entrée sont présents",
    partial: "Certains pixels sont inconnus; il s’agit donc d’un minimum",
    unknownArea: "ha inconnus",
    zoomIn: "Zoom avant",
    zoomOut: "Zoom arrière",
    resetView: "Réinitialiser la vue",
    zoomControls: "Zoom de la carte",
    scale: "Échelle",
    scaleBar: "Barre d’échelle",
    mapPanel: "Couches et légende de la carte",
    mapLayers: "Couches affichées",
    boundary: "Limite",
    jurisdiction: "Autorité compétente",
    clearBoundary: "Effacer la limite",
    interval: "Intervalle",
    normalizedShare: "Part de perte détectée",
    totalLoss: "Perte détectée",
    knownObservedSubtotal: "Sous-total détecté connu",
    provinceAggregate: "Agrégat provincial provisoire, de 2020 à 2022",
    detectedPatches: "Parcelles de perte forestière détectée",
    mapView: "Vue de la carte",
    framingViews:
      "Ces boutons servent seulement au cadrage; utilisez Zoomer vers les parcelles pour atteindre la couche de parcelles.",
    patchesBelowZoom:
      "Les parcelles de perte détectée commencent au zoom 8. La vue actuelle est sous ce seuil.",
    zoomToPatches: "Zoomer vers les parcelles",
    national: "National",
    bc: "Colombie-Britannique",
    ab: "Alberta",
    on: "Ontario",
    qc: "Québec",
  },
} as const;

type MapSource = "pmtiles" | "geojson";
type MapState = "loading" | "ready" | "unavailable" | "error";
type MapFailureKind = "timeout" | "error";
type Position = [number, number];
type MapBounds = [west: number, south: number, east: number, north: number];
const PMTILES_LOAD_TIMEOUT_MS = 10_000;
// This route renders one map. Fixed ids avoid the hydration instability caused
// by the server and client trees having different positions around this island.
const STATUS_ID = "explore-map-status";
const ATTRIBUTION_ID = "explore-map-attribution";

// These are only camera extents for the view buttons. They neither filter a
// layer nor imply that a layer supplies a provincial measurement there.
const MAP_VIEW_BOUNDS: Readonly<Record<ExploreMapView, MapBounds>> = {
  national: [-141, 41, -52, 70],
  bc: [-139.1, 48.2, -114, 60.1],
  ab: [-120, 48.9, -109, 60.1],
  on: [-95.2, 41.5, -74.1, 56.9],
  qc: [-79.9, 45, -57, 62.1],
};

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

const boundaryLineLayerIds = (overlays: readonly BoundaryOverlayId[]) =>
  overlays.flatMap((id) => {
    const overlay = BOUNDARY_OVERLAYS[id];
    return overlay.available && overlay.url && overlay.sourceLayer
      ? [`boundary-${id}-line`]
      : [];
  });

const boundaryJurisdiction = (locale: Locale, jurisdiction: string) =>
  ({
    CA: { en: "Canada", fr: "Canada" },
    AB: { en: "Alberta", fr: "Alberta" },
    BC: { en: "British Columbia", fr: "Colombie-Britannique" },
    ON: { en: "Ontario", fr: "Ontario" },
    QC: { en: "Quebec", fr: "Québec" },
  })[jurisdiction]?.[locale] ?? jurisdiction;

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

const PER_CELL_LAYER_ID = `${EXPLORE_PER_CELL_LAYER.sourceId}-fill`;

const perCellStyle = (archive: PerCellArchive, cause: PerCellCause) => {
  const source: StyleSpecification["sources"][string] = {
    type: "vector",
    url: `pmtiles://${archive.url}`,
    bounds: [-141, 41, -52, 84],
  };
  const causeFilter: FilterSpecification | undefined =
    cause === "harvest"
      ? [">", ["get", "harvest"], 0]
      : cause === "fire"
        ? [">", ["get", "fire"], 0]
        : undefined;
  const layer: StyleSpecification["layers"][number] = {
    id: PER_CELL_LAYER_ID,
    type: "fill",
    source: EXPLORE_PER_CELL_LAYER.sourceId,
    "source-layer": perCellSourceLayer(archive.interval),
    minzoom: EXPLORE_PER_CELL_LAYER.minZoom,
    ...(causeFilter ? { filter: causeFilter } : {}),
    paint: {
      "fill-color":
        cause === "harvest"
          ? EXPLORE_MAP_COLOURS.harvest
          : cause === "fire"
            ? EXPLORE_MAP_COLOURS.wildfire
            : [
                "case",
                [">", ["get", "harvest"], 0],
                EXPLORE_MAP_COLOURS.harvest,
                [">", ["get", "fire"], 0],
                EXPLORE_MAP_COLOURS.wildfire,
                EXPLORE_MAP_COLOURS.loss3,
              ],
      "fill-opacity": 0.9,
    },
  };
  return { source, layer };
};

/** Replace only the selected annual patch source; the map and camera stay live. */
function swapPerCellLayer(
  map: MapLibreMap,
  archive: PerCellArchive | null,
  cause: PerCellCause,
  beforeLayerId?: string,
) {
  if (map.getLayer(PER_CELL_LAYER_ID)) map.removeLayer(PER_CELL_LAYER_ID);
  if (map.getSource(EXPLORE_PER_CELL_LAYER.sourceId))
    map.removeSource(EXPLORE_PER_CELL_LAYER.sourceId);
  if (!archive) return;

  const { source, layer } = perCellStyle(archive, cause);
  map.addSource(EXPLORE_PER_CELL_LAYER.sourceId, source);
  map.addLayer(
    layer,
    beforeLayerId && map.getLayer(beforeLayerId) ? beforeLayerId : undefined,
  );
}

const buildStyle = (
  province: boolean,
  archive: PerCellArchive | null,
  overlays: readonly BoundaryOverlayId[],
  cause: PerCellCause,
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
    const perCell = perCellStyle(archive, cause);
    sources[EXPLORE_PER_CELL_LAYER.sourceId] = perCell.source;
    // Every patch carries the harvest and fire counts the disturbance record
    // holds for its own interval, so the harvest and wildfire modes are this
    // same archive filtered rather than a second layer to load. Filtering in
    // the style keeps one network request serving all three modes.
    layers.push(perCell.layer);
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
    name: `${PRODUCT_NAME.en} provisional province forest-loss map`,
    sources,
    layers,
  };
};

/*
 * What the controls need to know about the map, refreshed as it moves. The
 * scale depends on latitude as well as zoom, because Web Mercator stretches
 * the ground more the further north the reader is looking, and Canada is read
 * far enough north for that to matter.
 */
type MapView = Readonly<{
  zoom: number;
  latitude: number;
  atMinZoom: boolean;
  atMaxZoom: boolean;
}>;

const SCALE_MAX_PIXELS = 120;

const symbol = (className: string) => (
  <i className={`loss-swatch ${className}`} aria-hidden="true" />
);

export function ExploreMapClient({
  locale,
  mode,
  year,
  overlays = [],
  ridingMeasurements = [],
}: Readonly<{
  locale: Locale;
  mode: ExploreMode;
  year: number;
  overlays?: readonly BoundaryOverlayId[];
  /** Optional until the completed local riding dataset is wired into this map. */
  ridingMeasurements?: readonly RidingBoundaryMeasurement[];
}>) {
  const statusId = STATUS_ID;
  const attributionId = ATTRIBUTION_ID;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  /*
   * The live map, so the zoom controls can drive it. MapLibre injects its own
   * controls into the map container, which carries role="img"; anything inside
   * that is presentational to assistive technology, so a zoom button placed
   * there could not be reached. These controls are rendered as siblings and
   * talk to the map through this ref instead.
   */
  const mapRef = useRef<MapLibreMap | null>(null);
  const [view, setView] = useState<MapView | null>(null);
  const [selectedMapView, setSelectedMapView] = useState<ExploreMapView>("national");
  // The provisional province aggregate covers 2020-2022 only. The per-cell
  // detail covers every annual interval from 1984-1985 to 2021-2022, so the
  // map is now offered for the whole series and the two layers are shown
  // wherever each one actually has something to say.
  const cause = perCellCauseForMode(mode);
  const perCellArchive = cause ? perCellArchiveForYear(year) : null;
  const provinceAvailable = mode === "forest-change" && year === 2022;
  const available = provinceAvailable || perCellArchive !== null;
  // A stable primitive, so the effect re-runs when the selection changes
  // rather than on every render of a fresh array literal.
  const overlayKey = overlays.join(",");
  const [features, setFeatures] = useState<ProvinceFeature[]>([]);
  const [source, setSource] = useState<MapSource | null>(null);
  const [failed, setFailed] = useState(false);
  const [failureKind, setFailureKind] = useState<MapFailureKind | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [hoveredBoundary, setHoveredBoundary] = useState<BoundarySelection | null>(null);
  const [pinnedBoundary, setPinnedBoundary] = useState<BoundarySelection | null>(null);
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
      setFailureKind(null);
      setMapReady(false);
      setView(null);
      setHoveredBoundary(null);
      setPinnedBoundary(null);
    });

    const loadGeoJsonFallback = async (kind: MapFailureKind) => {
      if (fallbackStarted) return;
      fallbackStarted = true;
      if (active) setFailureKind(kind);
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
        if (!(error instanceof DOMException && error.name === "AbortError"))
          console.error("Explore GeoJSON fallback error", error);
        if (
          active &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setFailureKind("error");
          setFailed(true);
        }
      }
    };

    pmtilesTimeout = setTimeout(() => {
      if (!active || pmtilesLoaded) return;
      console.warn(
        `Explore PMTiles map timed out after ${PMTILES_LOAD_TIMEOUT_MS} ms`,
      );
      setFailureKind("timeout");
      map?.remove();
      map = null;
      mapRef.current = null;
      if (protocolRegistered) {
        maplibre?.removeProtocol("pmtiles");
        protocolRegistered = false;
      }
      void loadGeoJsonFallback("timeout");
    }, PMTILES_LOAD_TIMEOUT_MS);

    const initializePmtiles = async () => {
      try {
        const [maplibreModule, { Protocol }] = await Promise.all([
          import("maplibre-gl"),
          import("pmtiles"),
        ]);
        if (!active || !mapContainerRef.current) {
          if (active) void loadGeoJsonFallback("error");
          return;
        }
        maplibre = maplibreModule;
        maplibre.setWorkerUrl(MAPLIBRE_WORKER_URL);
        const protocol = new Protocol();
        maplibre.addProtocol("pmtiles", protocol.tile);
        protocolRegistered = true;
        map = new maplibre.Map({
          container: mapContainerRef.current,
          style: buildStyle(provinceAvailable, null, overlays, "all"),
          center: [-96, 56],
          zoom: 2.6,
          minZoom: 1.5,
          // The per-cell layer is only drawn from zoom 8, so the map has to
          // reach it. Without an archive there is nothing past the province
          // aggregate to magnify and the old ceiling still applies.
          maxZoom: cause !== null ? EXPLORE_PER_CELL_LAYER.maxZoom : 6,
          attributionControl: false,
        });
        mapRef.current = map;
        const publishView = () => {
          if (!active || !map) return;
          setView({
            zoom: map.getZoom(),
            latitude: map.getCenter().lat,
            // Compared with a tolerance rather than exactly: the zoom is a
            // float that eases toward its limit and lands a hair short, which
            // would leave a button enabled that can no longer do anything.
            atMinZoom: map.getZoom() <= map.getMinZoom() + 1e-6,
            atMaxZoom: map.getZoom() >= map.getMaxZoom() - 1e-6,
          });
        };
        map.on("move", publishView);
        map.once("load", () => {
          if (!active) return;
          if (pmtilesTimeout) clearTimeout(pmtilesTimeout);
          pmtilesLoaded = true;
          setSource("pmtiles");
          setFailed(false);
          setFailureKind(null);
          setMapReady(true);
          publishView();
          const selectBoundary = (
            event: MapLayerMouseEvent,
            persistent: boolean,
            overlay: BoundaryOverlayId,
          ) => {
            const properties = event.features?.[0]?.properties;
            const boundaryId = properties?.id;
            const name = properties?.[locale === "fr" ? "name_fr" : "name_en"];
            const jurisdiction = properties?.juris;
            if (
              typeof boundaryId !== "string" ||
              typeof name !== "string" ||
              typeof jurisdiction !== "string"
            )
              return;
            const selection: BoundarySelection = {
              overlay,
              boundaryId,
              name,
              jurisdiction,
            };
            if (persistent) setPinnedBoundary(selection);
            else setHoveredBoundary(selection);
          };
          for (const layerId of boundaryLineLayerIds(overlays)) {
            const overlay = overlays.find((candidate) => `boundary-${candidate}-line` === layerId);
            if (!overlay) continue;
            map?.on("mouseenter", layerId, (event) => {
              if (!active || !map) return;
              map.getCanvas().style.cursor = "pointer";
              selectBoundary(event, false, overlay);
            });
            map?.on("mouseleave", layerId, () => {
              if (!active || !map) return;
              map.getCanvas().style.cursor = "";
              setHoveredBoundary(null);
            });
            map?.on("click", layerId, (event) => {
              if (active) selectBoundary(event, true, overlay);
            });
          }
        });
        map.on("error", (event) => {
          console.error("Explore PMTiles map error", event.error ?? event);
          if (pmtilesLoaded) return;
          setFailureKind("error");
          map?.remove();
          map = null;
          mapRef.current = null;
          if (protocolRegistered) {
            maplibre?.removeProtocol("pmtiles");
            protocolRegistered = false;
          }
          void loadGeoJsonFallback("error");
        });
      } catch (error: unknown) {
        console.error("Explore PMTiles initialization error", error);
        if (active) void loadGeoJsonFallback("error");
      }
    };

    void initializePmtiles();
    return () => {
      active = false;
      controller.abort();
      if (pmtilesTimeout) clearTimeout(pmtilesTimeout);
      map?.remove();
      mapRef.current = null;
      setMapReady(false);
      if (protocolRegistered) maplibre?.removeProtocol("pmtiles");
    };
    // overlayKey stands in for `overlays`: the prop is a fresh array on every
    // render of the server parent, so depending on it directly would tear down
    // and rebuild the whole map each time. The key changes exactly when the
    // selected overlay set changes, which is the only thing the style needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, provinceAvailable, overlayKey, retryNonce]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    let active = true;
    try {
      swapPerCellLayer(
        map,
        perCellArchive,
        cause ?? "all",
        boundaryLineLayerIds(overlays)[0],
      );
    } catch (error: unknown) {
      console.error("Explore annual patch source swap error", error);
      void Promise.resolve().then(() => {
        if (!active) return;
        setFailureKind("error");
        setFailed(true);
      });
    }
    return () => {
      active = false;
    };
    // overlayKey stands in for the fresh overlays array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, perCellArchive, cause, overlayKey]);
  const readyKey = provinceAvailable
    ? perCellArchive
      ? "readyBoth"
      : "ready"
    : cause === "harvest"
      ? "readyHarvest"
      : cause === "fire"
        ? "readyFire"
        : "readyPerCell";
  // Two different absences, two different sentences. A mode with no archive
  // for the selected year is a year problem the reader can fix; condition and
  // recovery is a missing source they cannot.
  const message =
    state === "unavailable"
      ? cause === null
        ? text[locale].unavailable
        : text[locale].unavailableYear
      : source === "geojson"
        ? failureKind === "timeout"
          ? text[locale].fallbackTimeout
          : text[locale].fallbackError
        : state === "ready"
          ? text[locale][readyKey]
          : state === "error" && failureKind === "timeout"
            ? text[locale].errorTimeout
            : text[locale][state];
  const legendTitle =
    cause === "harvest"
      ? text[locale].perCellLegendHarvest
      : cause === "fire"
        ? text[locale].perCellLegendFire
        : text[locale].perCellLegend;
  /*
   * Recomputed from the live view rather than stored, because it is a pure
   * function of zoom and latitude: keeping it in state would give it a chance
   * to disagree with the map it describes.
   */
  const scale: ScaleBar | null = view
    ? chooseScaleBar(metresPerPixel(view.latitude, view.zoom), SCALE_MAX_PIXELS)
    : null;
  const scaleLabel = scale
    ? `${formatNumber(scale.value, locale)} ${scale.unit}`
    : "";
  const boundary = hoveredBoundary ?? pinnedBoundary;
  const readout = boundary
    ? boundaryReadout(boundary, ridingMeasurements, locale)
    : null;
  const fitMapToView = (mapView: ExploreMapView) => {
    mapRef.current?.fitBounds(MAP_VIEW_BOUNDS[mapView], {
      padding: 36,
      duration: 350,
      maxZoom: mapView === "national" ? 2.6 : 6,
    });
  };
  const zoomToPatches = () => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      center: map.getCenter(),
      zoom: EXPLORE_PER_CELL_LAYER.minZoom,
      duration: 350,
    });
  };
  const retryMap = () => {
    setFeatures([]);
    setSource(null);
    setFailed(false);
    setFailureKind(null);
    setMapReady(false);
    setRetryNonce((attempt) => attempt + 1);
  };
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
                <title>
                  {labelled(
                    locale,
                    locale === "fr"
                      ? feature.properties.province_name_fr
                      : feature.properties.province_name_en,
                    formatPercent(feature.properties.observed_loss_percent, locale),
                  )}
                </title>
              </path>
            ))}
          </svg>
            ) : null}
            {state !== "ready" ? (
              <p className="explore-map-panel">{message}</p>
            ) : null}
            {state === "ready" ? (
              <aside className="explore-map-layer-panel" aria-label={text[locale].mapPanel}>
                {source === "pmtiles" ? (
                  <fieldset>
                    <legend>{text[locale].mapView}</legend>
                    <div className="explore-map-view-options">
                      {EXPLORE_MAP_VIEWS.map((mapView) => (
                        <button
                          key={mapView}
                          type="button"
                          aria-pressed={selectedMapView === mapView}
                          onClick={() => {
                            setSelectedMapView(mapView);
                            fitMapToView(mapView);
                          }}
                        >
                          {text[locale][mapView]}
                        </button>
                      ))}
                    </div>
                    <p className="explore-map-note">{text[locale].framingViews}</p>
                  </fieldset>
                ) : null}
                {source === "pmtiles" &&
                perCellArchive &&
                view &&
                view.zoom < EXPLORE_PER_CELL_LAYER.minZoom ? (
                  <div className="explore-map-action">
                    <p>{text[locale].patchesBelowZoom}</p>
                    <button type="button" onClick={zoomToPatches}>
                      {text[locale].zoomToPatches}
                    </button>
                  </div>
                ) : null}
                <strong>{text[locale].mapLayers}</strong>
                <ul className="explore-map-layer-list">
                  {provinceAvailable ? <li>{text[locale].provinceAggregate}</li> : null}
                  {perCellArchive ? (
                    <li>{`${text[locale].detectedPatches}, ${perCellArchive.interval}`}</li>
                  ) : null}
                  {overlays.map((id) => <li key={id}>{BOUNDARY_OVERLAYS[id].label[locale]}</li>)}
                </ul>
                {provinceAvailable ? (
                  <ul className="explore-map-legend" aria-label={text[locale].legend}>
                    <li>{symbol("loss-0")}0–&lt;1%</li>
                    <li>{symbol("loss-1")}1–&lt;2%</li>
                    <li>{symbol("loss-2")}2–&lt;3%</li>
                    <li>{symbol("loss-3")}3%+</li>
                  </ul>
                ) : null}
                {perCellArchive ? (
                  <ul className="explore-map-legend" aria-label={legendTitle}>
                    {cause === "fire" ? null : <li>{symbol("patch-harvest")}{text[locale].perCellHarvest}</li>}
                    {cause === "harvest" ? null : <li>{symbol("patch-fire")}{text[locale].perCellFire}</li>}
                    {cause === "all" ? <li>{symbol("patch-none")}{text[locale].perCellNeither}</li> : null}
                  </ul>
                ) : null}
              </aside>
            ) : null}
            {state === "ready" && source === "pmtiles" && boundary ? (
              <aside className="explore-map-boundary-status" role="status">
                <strong>{text[locale].boundary}</strong>
                <p>{boundary.name}</p>
                <p>
                  {text[locale].jurisdiction}
                  {colon(locale)} {boundaryJurisdiction(locale, boundary.jurisdiction)}
                </p>
                {readout?.kind === "boundary-only" ? <p>{readout.note}</p> : null}
                {readout?.kind === "riding-measurement" ? (
                  <>
                    <p>{text[locale].interval}{colon(locale)} {readout.interval}</p>
                    <p>{text[locale].coverage}{colon(locale)} {readout.coverage}</p>
                    <p>{text[locale].normalizedShare}{colon(locale)} {readout.normalizedShare}</p>
                    <p>{text[locale].totalLoss}{colon(locale)} {readout.absoluteLoss}</p>
                    {readout.knownObservedSubtotal ? <p>{text[locale].knownObservedSubtotal}{colon(locale)} {readout.knownObservedSubtotal}</p> : null}
                  </>
                ) : null}
                {pinnedBoundary ? (
                  <button type="button" onClick={() => setPinnedBoundary(null)}>
                    {text[locale].clearBoundary}
                  </button>
                ) : null}
              </aside>
            ) : null}
            {scale && view ? (
              <div className="explore-map-controls">
                <div
                  className="explore-map-zoom"
                  role="group"
                  aria-label={text[locale].zoomControls}
                >
                  <button
                    type="button"
                    className="explore-map-zoom-button"
                    onClick={() => mapRef.current?.zoomIn()}
                    disabled={view.atMaxZoom}
                  >
                    <span aria-hidden="true">+</span>
                    <span className="sr-only">
                      {text[locale].zoomIn}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="explore-map-zoom-button"
                    onClick={() => mapRef.current?.zoomOut()}
                    disabled={view.atMinZoom}
                  >
                    {/*
                      A minus sign (U+2212), not a hyphen. At button size the
                      hyphen reads as a speck next to the plus. It is written as
                      the character itself rather than as a numeric character
                      reference, because the style-token gate reads a numeric
                      reference as a hex colour literal.
                    */}
                    <span aria-hidden="true">−</span>
                    <span className="sr-only">
                      {text[locale].zoomOut}
                    </span>
                  </button>
                </div>
                <div
                  className="explore-map-scale"
                  // The bar is a picture of a distance, so it is labelled with
                  // that distance rather than left for a reader to measure.
                  role="img"
                  aria-label={labelled(locale, text[locale].scaleBar, scaleLabel)}
                >
                  <span
                    className="explore-map-scale-bar"
                    style={{ width: `${Math.round(scale.pixels)}px` }}
                    aria-hidden="true"
                  />
                  <span aria-hidden="true">{scaleLabel}</span>
                </div>
              </div>
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
      {state === "error" || source === "geojson" ? (
        <button className="btn btn--secondary explore-map-retry" type="button" onClick={retryMap}>
          {text[locale].retry}
        </button>
      ) : null}
      <p id={attributionId} className="explore-map-attribution">
        {text[locale].attribution}
        {colon(locale)}{" "}
        <a href={EXPLORE_PRODUCTION_LAYER.attribution.href}>
          {EXPLORE_PRODUCTION_LAYER.attribution[locale]}
        </a>
      </p>
      {perCellArchive ? (
        <div className="explore-map-data">
          <strong>{legendTitle}</strong>
          <ul className="explore-map-legend" aria-label={legendTitle}>
            {cause === "fire" ? null : (
              <li>
                {symbol("patch-harvest")}
                {text[locale].perCellHarvest}
              </li>
            )}
            {cause === "harvest" ? null : (
              <li>
                {symbol("patch-fire")}
                {text[locale].perCellFire}
              </li>
            )}
            {cause === "all" ? (
              <li>
                {symbol("patch-none")}
                {text[locale].perCellNeither}
              </li>
            ) : null}
          </ul>
          <p>{text[locale].perCell}</p>
          <p>{text[locale].perCellLimits}</p>
          {cause === "all" ? null : (
            <p>{text[locale].perCellFilteredLimits}</p>
          )}
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
                    <td>{formatNumber(row.observedLossHectares, locale)}</td>
                    <td>{formatNumber(row.observedLossPercent, locale)}</td>
                    <td>
                      {`${text[locale].partial} (${formatUnknownSharePercent(row.unknownSharePercent, locale)}; ${formatNumber(row.unknownRequiredInputHectares, locale)} ${text[locale].unknownArea})`}
                    </td>
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
