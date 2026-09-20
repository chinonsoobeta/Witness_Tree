"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ExpressionSpecification,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  StyleSpecification,
} from "maplibre-gl";
import { colon, formatNumber, formatPercent, formatYearRange, labelled, PRODUCT_NAME, yearRange, type Locale } from "@/lib/domain";
import { chooseScaleBar, metresPerPixel, type ScaleBar } from "@/lib/explore/map-scale";
import {
  perCellArchiveSpan,
  BOUNDARY_OVERLAYS,
  EXPLORE_MAP_COLOURS,
  EXPLORE_PER_CELL_LAYER,
  EXPLORE_PER_CELL_SPAN_LAYER,
  EXPLORE_PRODUCTION_LAYER,
  EXPLORE_YEAR_MAX,
  formatUnknownSharePercent,
  perCellCauseForMode,
  perCellSpanYears,
  fourProvinceSpanMeasurement,
  provinceSpanMeasurements,
  provinceSpanReach,
  SPAN_SHARE_BREAKS,
  spanShareClass,
  type BoundaryOverlayId,
  type ExploreMapView,
  type ExploreMode,
  type PerCellCause,
} from "@/lib/explore";
import {
  boundaryReadout,
  type BoundarySelection,
  type RidingBoundaryMeasurement,
} from "@/lib/explore/boundary-readout";
import { ProvinceBar } from "@/components/site";

const text = {
  en: {
    label: "Forest loss map",
    loading: "Loading the map layers for the selected year.",
    ready:
      `Showing each province shaded by the forest it lost over the selected span, counted once per place against the forest known at the span's start. Any span from ${provinceSpanReach("en", "span")} can be chosen, and the shading follows the year control. Display boundaries are simplified and omit small islands.`,
    readyPerCell:
      `Showing every detected forest-loss patch lost in any year of the selected span, traced from the 30 m grid, in British Columbia, Alberta, Ontario and Québec. Any span within ${perCellArchiveSpan("en")} can be chosen, and the patches follow the year control.`,
    readyHarvest:
      "Showing only the detected forest-loss patches in the selected span that the national disturbance record marks as harvest in the year each was lost.",
    readyFire:
      "Showing only the detected forest-loss patches in the selected span that the national disturbance record marks as fire in the year each was lost.",
    readyBoth:
      `Showing two layers for the same selected span: the provinces are shaded by the forest each lost over it, and the detected forest-loss patches drawn as you zoom in are every patch lost in any year of it, in British Columbia, Alberta, Ontario and Québec. Both follow the year control, over ${provinceSpanReach("en", "span")}. Province display boundaries are simplified and omit small islands.`,
    fallbackTimeout:
      "The interactive map is taking too long to load. A static map is shown instead. The figures below are unaffected. You can retry the interactive map.",
    fallbackError:
      "The interactive map could not be loaded. A static map is shown instead. The figures below are unaffected. You can retry the interactive map.",
    unavailable:
      "Condition and recovery needs the annual land-cover class series, which has not been acquired or admitted. It is not shown for any year. Forest loss, Recorded harvest and Wildfire are unaffected.",
    unavailableYear:
      `Detected patches cover spans within ${perCellArchiveSpan("en")}. Choose ${EXPLORE_YEAR_MAX} or an earlier year to see this mode.`,
    error:
      "The map could not be loaded. The figures below are unaffected. You can retry the interactive map or use the list and table.",
    errorTimeout:
      "The interactive map is taking too long to load, and no static map is available for this selection. The figures below are unaffected. You can retry the interactive map or use the list and table.",
    retry: "Retry the interactive map",
    attribution: "Map sources",
    perCell:
      `Zoom in to see individual patches of detected forest loss in British Columbia, Alberta, Ontario and Québec, traced from the 30 m grid rather than generalized from it. Every patch lost in any year of the selected span is drawn; a place lost in more than one of those years is drawn once for each.`,
    perCellLimits:
      "These patches are drawn, not counted. Below the closest zoom the map simplifies them and leaves out the smallest ones, so adding them up would come out short; the annual figures are counted from the exact cell inventory instead. Nobody has checked these patches against conditions on the ground. An area with no patch is not a claim that no loss happened there.",
    perCellLegend: "Detected loss patch, by what the official record shows",
    perCellLegendHarvest: "Detected loss patch with a recorded harvest",
    perCellLegendFire: "Detected loss patch with a recorded fire",
    perCellFilteredLimits:
      "Only patches the disturbance record marks this way are drawn. The record cannot tell nothing-recorded apart from outside the area it maps, so an empty area is not a claim that nothing happened there.",
    perCellHarvest: "A harvest is recorded in the year the patch was lost",
    perCellFire: "A fire is recorded in the year the patch was lost",
    perCellNeither:
      "Neither is recorded. The disturbance record cannot distinguish nothing recorded from outside the area it maps, so this is not evidence that neither happened.",
    legend: "Detected forest loss over the span, percent of the forest known at its start",
    spanTable: "Detected forest loss by province",
    fourProvinces: "The four provinces together",
    summedLoss: "Yearly losses added together (ha)",
    unknownShare: "Unknown at the start",
    spanBasis:
      "Each place counts once however many times it was cleared in the span, so the share can never pass 100%. Yearly losses added together count a place again each time it was cleared; that figure is hectares only and has no share. Unknown is never counted as zero, and every province is only partly mapped, so every figure is a minimum. Nothing here has been checked against conditions on the ground.",
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
    provinceAggregate: "Detected forest loss by province",
    detectedPatches: "Detected-loss patches",
    zoomToPatches: "Zoom to patches",
    patchesVisible: "Patches are already visible at this zoom.",
    patchesUnavailable: "No patch layer is available for this selection.",
    mapNotReady: "The map is not ready yet.",
    enterFullscreen: "View map full screen",
    exitFullscreen: "Exit full screen",
    mapPanelHarvest: "Harvest recorded",
    mapPanelFire: "Fire recorded",
    mapPanelNeither: "Neither recorded",
  },
  fr: {
    label: "Carte des pertes forestières",
    loading:
      "Chargement des couches cartographiques pour l’année choisie.",
    ready:
      `Affichage de chaque province ombrée selon la forêt perdue pendant la période choisie, comptée une seule fois par lieu par rapport à la forêt connue au début de la période. Toute période ${provinceSpanReach("fr", "from")} peut être choisie, et l’ombrage suit la commande d’année. Les limites d’affichage sont simplifiées et omettent les petites îles.`,
    readyPerCell:
      `Affichage de chaque parcelle de perte forestière détectée perdue au cours de n’importe quelle année de la période choisie, tracée à partir de la grille de 30 m, en Colombie-Britannique, en Alberta, en Ontario et au Québec. Toute période comprise dans ${perCellArchiveSpan("fr")} peut être choisie, et les parcelles suivent la commande d’année.`,
    readyHarvest:
      "Affichage des seules parcelles de perte forestière détectée de la période choisie que le registre national des perturbations désigne comme récolte pour l’année où chacune a été perdue.",
    readyFire:
      "Affichage des seules parcelles de perte forestière détectée de la période choisie que le registre national des perturbations désigne comme incendie pour l’année où chacune a été perdue.",
    readyBoth:
      `Affichage de deux couches pour la même période choisie : les provinces sont ombrées selon la forêt que chacune a perdue pendant cette période, et les parcelles de perte forestière détectée, dessinées au fur et à mesure du zoom, sont toutes celles perdues au cours de n’importe laquelle de ses années, en Colombie-Britannique, en Alberta, en Ontario et au Québec. Les deux suivent la commande d’année, ${provinceSpanReach("fr", "from")}. Les limites provinciales affichées sont simplifiées et omettent les petites îles.`,
    fallbackTimeout:
      "La carte interactive met trop de temps à se charger. Une carte statique est affichée à sa place. Les chiffres ci-dessous restent inchangés. Vous pouvez réessayer de charger la carte interactive.",
    fallbackError:
      "La carte interactive n’a pas pu être chargée. Une carte statique est affichée à sa place. Les chiffres ci-dessous restent inchangés. Vous pouvez réessayer de charger la carte interactive.",
    unavailable:
      "L’état et le rétablissement exigent la série annuelle des classes de couverture terrestre, qui n’a été ni acquise ni admise. Ce mode n’est affiché pour aucune année. La perte forestière, les récoltes consignées et les incendies ne sont pas touchés.",
    unavailableYear:
      `Les parcelles détectées couvrent les périodes comprises dans ${perCellArchiveSpan("fr")}. Choisissez ${EXPLORE_YEAR_MAX} ou une année antérieure pour voir ce mode.`,
    error:
      "La carte n’a pas pu être chargée. Les chiffres ci-dessous restent inchangés. Vous pouvez réessayer de charger la carte interactive ou utiliser la liste et le tableau.",
    errorTimeout:
      "La carte interactive met trop de temps à se charger, et aucune carte statique n’est disponible pour cette sélection. Les chiffres ci-dessous restent inchangés. Vous pouvez réessayer de charger la carte interactive ou utiliser la liste et le tableau.",
    retry: "Réessayer la carte interactive",
    attribution: "Sources de la carte",
    perCell:
      `Faites un zoom avant pour voir chaque parcelle de perte forestière détectée en Colombie-Britannique, en Alberta, en Ontario et au Québec, tracée à partir de la grille de 30 m plutôt que généralisée. Toutes les parcelles perdues au cours de n’importe quelle année de la période choisie sont dessinées; un lieu perdu au cours de plusieurs de ces années est dessiné une fois pour chacune.`,
    perCellLimits:
      "Ces parcelles sont dessinées, et non comptées. Sous le zoom le plus rapproché, la carte les simplifie et omet les plus petites ; les additionner donnerait donc un total trop faible. Les chiffres annuels sont plutôt comptés à partir de l’inventaire exact des cellules. Personne n’a vérifié ces parcelles sur le terrain. Une zone sans parcelle n’affirme pas qu’aucune perte n’y est survenue.",
    perCellLegend: "Parcelle de perte détectée, selon ce que montre le registre officiel",
    perCellLegendHarvest: "Parcelle de perte détectée avec récolte consignée",
    perCellLegendFire: "Parcelle de perte détectée avec incendie consigné",
    perCellFilteredLimits:
      "Seules les parcelles ainsi désignées par le registre des perturbations sont dessinées. Le registre ne distingue pas l’absence de mention de l’extérieur de la zone qu’il cartographie; une zone vide n’affirme donc pas que rien ne s’y est produit.",
    perCellHarvest: "Une récolte est consignée pour l’année où la parcelle a été perdue",
    perCellFire: "Un incendie est consigné pour l’année où la parcelle a été perdue",
    perCellNeither:
      "Ni l’un ni l’autre n’est consigné. Le registre des perturbations ne distingue pas l’absence de mention de l’extérieur de la zone qu’il cartographie; ce n’est donc pas une preuve que rien ne s’est produit.",
    legend:
      "Perte forestière détectée pendant la période, en pourcentage de la forêt connue à son début",
    spanTable: "Perte forestière détectée par province",
    fourProvinces: "Les quatre provinces ensemble",
    summedLoss: "Pertes annuelles additionnées (ha)",
    unknownShare: "Inconnu au début",
    spanBasis:
      "Chaque lieu compte une seule fois, peu importe le nombre de coupes pendant la période; la part ne peut donc jamais dépasser 100 %. Les pertes annuelles additionnées comptent un lieu de nouveau à chaque coupe; ce chiffre est en hectares seulement et n’a pas de part. L’inconnu n’est jamais compté comme zéro, et chaque province n’est que partiellement cartographiée; chaque chiffre est donc un minimum. Rien ici n’a été vérifié sur le terrain.",
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
    provinceAggregate: "Perte forestière détectée par province",
    detectedPatches: "Parcelles de perte détectée",
    zoomToPatches: "Zoomer vers les parcelles",
    patchesVisible: "Les parcelles sont déjà visibles à ce niveau de zoom.",
    patchesUnavailable: "Aucune couche de parcelles n’est offerte pour cette sélection.",
    mapNotReady: "La carte n’est pas encore prête.",
    enterFullscreen: "Afficher la carte en plein écran",
    exitFullscreen: "Quitter le plein écran",
    mapPanelHarvest: "Récolte consignée",
    mapPanelFire: "Incendie consigné",
    mapPanelNeither: "Ni l’un ni l’autre consigné",
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
const PATCH_ZOOM_REASON_ID = "explore-map-patch-zoom-reason";

// The default camera and pan limit share this one four-province envelope so
// they cannot drift apart. It frames all four provinces but is not a button.
const COMBINED_PROVINCE_BOUNDS: MapBounds = [-139.1, 41.5, -57, 62.1];

// These are only camera extents for the province buttons. They neither filter
// a layer nor imply that a layer supplies a provincial measurement there.
const MAP_VIEW_BOUNDS: Readonly<Record<ExploreMapView, MapBounds>> = {
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
const MAPLIBRE_WORKER_VERSION = "6.9.0";
const MAPLIBRE_WORKER_URL = `/maplibre/${MAPLIBRE_WORKER_VERSION}/maplibre-gl-worker.mjs`;
type ProvinceFeature = {
  id: string;
  properties: {
    province_id: string;
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
const SPAN_CLASS_COLOURS = [
  EXPLORE_MAP_COLOURS.loss0,
  EXPLORE_MAP_COLOURS.loss1,
  EXPLORE_MAP_COLOURS.loss2,
  EXPLORE_MAP_COLOURS.loss3,
  EXPLORE_MAP_COLOURS.loss4,
] as const;

/*
 * One colour per province for the span on display. A province whose share
 * cannot be computed gets the ground colour, not the lightest band: the
 * lightest band says "under 1 percent", and nobody measured that.
 */
const provinceSpanColours = (fromYear: number, toYear: number): Readonly<Record<string, string>> =>
  Object.fromEntries(
    provinceSpanMeasurements({ fromYear, toYear }).map((row) => {
      const band = spanShareClass(row.unionLossPercent);
      return [row.id, band === null ? EXPLORE_MAP_COLOURS.ground : SPAN_CLASS_COLOURS[band]];
    }),
  );

const provinceFillColour = (fromYear: number, toYear: number) => {
  const colours = provinceSpanColours(fromYear, toYear);
  return [
    "match",
    ["get", "province_id"],
    ...Object.entries(colours).flat(),
    EXPLORE_MAP_COLOURS.ground,
  ] as unknown as string;
};

const PROVINCE_FILL_LAYER_ID = `${EXPLORE_PRODUCTION_LAYER.sourceLayer}-fill`;

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

// The tiles carry only the province geometry and its id that matter here; the
// 2020-2022 figures baked into them are not read. The colour comes from the
// span release, so it follows the year control without a new tile request.
const provinceLayers = (fromYear: number, toYear: number): StyleSpecification["layers"] => [
  {
    id: PROVINCE_FILL_LAYER_ID,
    type: "fill",
    source: EXPLORE_PRODUCTION_LAYER.sourceLayer,
    "source-layer": EXPLORE_PRODUCTION_LAYER.sourceLayer,
    paint: {
      "fill-color": provinceFillColour(fromYear, toYear),
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

type PerCellSpanYears = NonNullable<ReturnType<typeof perCellSpanYears>>;

const perCellSource = (): StyleSpecification["sources"][string] => ({
  type: "vector",
  url: `pmtiles://${EXPLORE_PER_CELL_SPAN_LAYER.url}`,
  bounds: [-141, 41, -52, 84],
});

/**
 * One layer over the span archive. The span is a filter on each patch's
 * closing year, and the cause a filter on its recorded harvest or fire, so a
 * new span or mode rebuilds this layer while the source and its loaded tiles
 * stay put.
 */
const perCellLayer = (years: PerCellSpanYears, cause: PerCellCause): StyleSpecification["layers"][number] => {
  const year: ExpressionSpecification = ["get", EXPLORE_PER_CELL_SPAN_LAYER.yearProperty];
  const filters: ExpressionSpecification[] = [
    [">", year, years.after],
    ["<=", year, years.through],
  ];
  if (cause === "harvest") filters.push([">", ["get", "harvest"], 0]);
  if (cause === "fire") filters.push([">", ["get", "fire"], 0]);
  return {
    id: PER_CELL_LAYER_ID,
    type: "fill",
    source: EXPLORE_PER_CELL_SPAN_LAYER.sourceId,
    "source-layer": EXPLORE_PER_CELL_SPAN_LAYER.sourceLayer,
    minzoom: EXPLORE_PER_CELL_LAYER.minZoom,
    filter: ["all", ...filters],
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
                EXPLORE_MAP_COLOURS.neither,
              ],
      // Opaque, because a place lost in more than one year of the span is
      // drawn once per year, and translucent fills would darken it as if it
      // had lost more.
      "fill-opacity": 1,
    },
  };
};

/** Rebuild only the patch layer; the source, the map and the camera stay live. */
function swapPerCellLayer(
  map: MapLibreMap,
  years: PerCellSpanYears | null,
  cause: PerCellCause,
  beforeLayerId?: string,
) {
  if (map.getLayer(PER_CELL_LAYER_ID)) map.removeLayer(PER_CELL_LAYER_ID);
  if (!years) return;
  if (!map.getSource(EXPLORE_PER_CELL_SPAN_LAYER.sourceId))
    map.addSource(EXPLORE_PER_CELL_SPAN_LAYER.sourceId, perCellSource());
  map.addLayer(
    perCellLayer(years, cause),
    beforeLayerId && map.getLayer(beforeLayerId) ? beforeLayerId : undefined,
  );
}

const buildStyle = (
  province: boolean,
  years: PerCellSpanYears | null,
  overlays: readonly BoundaryOverlayId[],
  cause: PerCellCause,
  span: Readonly<{ fromYear: number; toYear: number }>,
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
    layers.push(...provinceLayers(span.fromYear, span.toYear));
  }
  if (years) {
    sources[EXPLORE_PER_CELL_SPAN_LAYER.sourceId] = perCellSource();
    // Every patch carries its closing year and the harvest and fire counts the
    // disturbance record holds for its own interval, so every span and all
    // three modes are this one archive filtered rather than another to load.
    layers.push(perCellLayer(years, cause));
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
    name: `${PRODUCT_NAME.en} province forest-loss map`,
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

/*
 * A swatch and nothing else. The patch keys once carried a glyph each, which
 * the map never draws, so the legend promised shapes a reader could not find.
 */
const symbol = (className: string) => (
  <span className="map-legend-key" aria-hidden="true">
    <i className={`loss-swatch ${className}`} />
  </span>
);

// Worded rather than written as "5–<10%", which a screen reader reads as
// symbols, and built from the breaks so the legend cannot drift from the fill.
const spanLegend = (locale: Locale) => {
  const pct = (value: number) => formatPercent(value, locale);
  const [first] = SPAN_SHARE_BREAKS;
  const last = SPAN_SHARE_BREAKS[SPAN_SHARE_BREAKS.length - 1];
  return [
    locale === "fr" ? `Moins de ${pct(first)}` : `Under ${pct(first)}`,
    ...SPAN_SHARE_BREAKS.slice(1).map((edge, i) =>
      locale === "fr" ? `${pct(SPAN_SHARE_BREAKS[i])} à moins de ${pct(edge)}` : `${pct(SPAN_SHARE_BREAKS[i])} to under ${pct(edge)}`),
    locale === "fr" ? `${pct(last)} ou plus` : `${pct(last)} or more`,
  ].map((label, band) => [`loss-${band}`, label] as const);
};

export function ExploreMapClient({
  locale,
  mode,
  year,
  fromYear,
  overlays = [],
  ridingMeasurements = [],
}: Readonly<{
  locale: Locale;
  mode: ExploreMode;
  year: number;
  /**
   * The opening year of the span on display.
   *
   * The province shading and the district readout cover the whole span. The
   * per-cell detail is an annual product and covers the closing year alone,
   * which the legend says out loud rather than letting the two layers look
   * like one measurement.
   */
  fromYear: number;
  overlays?: readonly BoundaryOverlayId[];
  /** Optional until the completed local riding dataset is wired into this map. */
  ridingMeasurements?: readonly RidingBoundaryMeasurement[];
}>) {
  const statusId = STATUS_ID;
  const attributionId = ATTRIBUTION_ID;
  const mapFrameRef = useRef<HTMLDivElement>(null);
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
  const [selectedMapView, setSelectedMapView] = useState<ExploreMapView | null>(null);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // The province shading answers any span from 1984 to 2022 and the per-cell
  // detail every annual interval inside it, so the map is offered for the
  // whole series and each layer is shown wherever it has something to say.
  const cause = perCellCauseForMode(mode);
  const perCellYears = cause ? perCellSpanYears(fromYear, year) : null;
  // A primitive for effect dependencies, so a fresh object each render does
  // not rebuild the layer.
  const perCellKey = perCellYears ? `${perCellYears.after}-${perCellYears.through}` : "";
  const provinceAvailable = mode === "forest-change";
  const available = provinceAvailable || perCellYears !== null;
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
    const frame = mapFrameRef.current;
    const available = Boolean(
      frame?.requestFullscreen && document.fullscreenEnabled && document.exitFullscreen,
    );
    setFullscreenAvailable(available);
    if (!available) return;

    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === frame);
      mapRef.current?.resize();
    };
    const syncAfterEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") window.requestAnimationFrame(syncFullscreenState);
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("keydown", syncAfterEscape);
    window.addEventListener("resize", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("keydown", syncAfterEscape);
      window.removeEventListener("resize", syncFullscreenState);
    };
  }, []);

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
      // The compatibility fallback is the province outlines and nothing
      // else, coloured by the span release. A mode with no province layer has
      // nothing to fall back to, and drawing forest-loss provinces under a
      // harvest or fire label would be worse than showing the failure.
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
          style: buildStyle(provinceAvailable, null, overlays, "all", { fromYear, toYear: year }),
          bounds: COMBINED_PROVINCE_BOUNDS,
          fitBoundsOptions: { padding: 36, maxZoom: 6 },
          maxBounds: COMBINED_PROVINCE_BOUNDS,
          minZoom: 1.5,
          // The per-cell layer is only drawn from zoom 8, so the map has to
          // reach it. Without an archive there is nothing past the province
          // aggregate to magnify and the old ceiling still applies.
          maxZoom: cause !== null ? EXPLORE_PER_CELL_SPAN_LAYER.maxZoom : 6,
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
        perCellYears,
        cause ?? "all",
        boundaryLineLayerIds(overlays)[0],
      );
    } catch (error: unknown) {
      console.error("Explore patch layer swap error", error);
      void Promise.resolve().then(() => {
        if (!active) return;
        setFailureKind("error");
        setFailed(true);
      });
    }
    return () => {
      active = false;
    };
    // overlayKey and perCellKey stand in for the fresh overlays array and
    // perCellYears object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, perCellKey, cause, overlayKey]);

  // The span moves without rebuilding the map: only the province colours change.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !provinceAvailable || !map.getLayer(PROVINCE_FILL_LAYER_ID)) return;
    map.setPaintProperty(PROVINCE_FILL_LAYER_ID, "fill-color", provinceFillColour(fromYear, year));
  }, [mapReady, provinceAvailable, fromYear, year]);
  const spanRows = provinceAvailable ? provinceSpanMeasurements({ fromYear, toYear: year }) : [];
  const fourProvinces = provinceAvailable ? fourProvinceSpanMeasurement({ fromYear, toYear: year }) : null;
  const fallbackColours = provinceSpanColours(fromYear, year);
  const spanLabel = formatYearRange(yearRange(fromYear, year), locale);
  const multiYear = year > fromYear + 1;
  const readyKey = provinceAvailable
    ? perCellYears
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
    ? boundaryReadout(boundary, ridingMeasurements, locale, { fromYear, toYear: year })
    : null;
  const fitMapToView = (mapView: ExploreMapView) => {
    mapRef.current?.fitBounds(MAP_VIEW_BOUNDS[mapView], {
      padding: 36,
      duration: 350,
      maxZoom: 6,
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
  const patchZoomDisabledReason = !perCellYears
    ? text[locale].patchesUnavailable
    : !view
      ? text[locale].mapNotReady
      : view.zoom >= EXPLORE_PER_CELL_LAYER.minZoom
        ? text[locale].patchesVisible
        : null;
  const toggleFullscreen = async () => {
    const frame = mapFrameRef.current;
    if (!frame || !fullscreenAvailable) return;
    try {
      if (document.fullscreenElement === frame) await document.exitFullscreen();
      else await frame.requestFullscreen();
    } catch (error: unknown) {
      console.error("Explore map full-screen error", error);
    }
  };
  return (
    <section aria-label={text[locale].label}>
      <div
        ref={mapFrameRef}
        className="explore-map"
        role="region"
        aria-label={text[locale].label}
        aria-describedby={`${statusId} ${attributionId}`}
        data-state={state}
        data-map-source={
          source === "geojson" ? "geojson-fallback" : source ?? undefined
        }
      >
        <ProvinceBar
          locale={locale}
          placement="map"
          selected={selectedMapView}
          onSelect={(mapView) => {
            setSelectedMapView(mapView);
            fitMapToView(mapView);
          }}
        />
        {available ? (
          <>
            <div
              ref={mapContainerRef}
              className="explore-map-canvas"
              role="img"
              aria-label={text[locale].label}
              aria-hidden={state !== "ready" || source !== "pmtiles"}
              inert={state !== "ready" || source !== "pmtiles"}
            />
            {state === "ready" && source === "geojson" ? (
          <svg
            className="explore-map-fallback"
            viewBox="0 0 1000 500"
            role="img"
            aria-label={text[locale].label}
          >
            <rect width="1000" height="500" fill={EXPLORE_MAP_COLOURS.ground} />
            {features.map((feature) => (
              <path
                key={feature.id}
                d={featurePath(feature)}
                fill={fallbackColours[feature.properties.province_id] ?? EXPLORE_MAP_COLOURS.ground}
                stroke={EXPLORE_MAP_COLOURS.ink}
                strokeWidth="1.5"
                fillRule="evenodd"
              >
                <title>
                  {(() => {
                    const name = locale === "fr" ? feature.properties.province_name_fr : feature.properties.province_name_en;
                    const share = spanRows.find((row) => row.id === feature.properties.province_id)?.unionLossPercent;
                    return typeof share === "number" ? labelled(locale, name, formatPercent(share, locale)) : name;
                  })()}
                </title>
              </path>
            ))}
          </svg>
            ) : null}
            {state !== "ready" ? (
              <p className="explore-map-panel">{message}</p>
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
                    <p>{text[locale].interval}{colon(locale)} {readout.intervalLabel}</p>
                    <p>{text[locale].coverage}{colon(locale)} {readout.coverage}</p>
                    <p>{text[locale].normalizedShare}{colon(locale)} {readout.normalizedShare}</p>
                    <p>{text[locale].totalLoss}{colon(locale)} {readout.absoluteLoss}</p>
                    {readout.knownObservedSubtotal ? <p>{text[locale].knownObservedSubtotal}{colon(locale)} {readout.knownObservedSubtotal}</p> : null}
                    {readout.summedLoss ? <p>{readout.summedLossLabel}{colon(locale)} {readout.summedLoss}</p> : null}
                  </>
                ) : null}
                {pinnedBoundary ? (
                  <button type="button" onClick={() => setPinnedBoundary(null)}>
                    {text[locale].clearBoundary}
                  </button>
                ) : null}
              </aside>
            ) : null}
          </>
        ) : (
          <p className="explore-map-panel">{message}</p>
        )}
        <div className="explore-map-controls">
          {scale && view ? (
            <div
              className="explore-map-scale"
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
          ) : null}
          {state === "ready" ? (
            <div
              className="explore-map-layer-panel"
              tabIndex={0}
              role="region"
              aria-label={text[locale].mapPanel}
            >
              <strong>{text[locale].mapLayers}</strong>
              <ul className="explore-map-layer-list">
                {provinceAvailable ? <li>{`${text[locale].provinceAggregate}, ${spanLabel}`}</li> : null}
                {perCellYears ? <li>{`${text[locale].detectedPatches}, ${spanLabel}`}</li> : null}
                {overlays.map((id) => <li key={id}>{BOUNDARY_OVERLAYS[id].label[locale]}</li>)}
              </ul>
              {provinceAvailable ? (
                <ul className="explore-map-legend" aria-label={text[locale].legend}>
                  {spanLegend(locale).map(([band, label]) => <li key={band}>{symbol(band)}{label}</li>)}
                </ul>
              ) : null}
              {perCellYears ? (
                <ul className="explore-map-legend" aria-label={legendTitle}>
                  {cause === "fire" ? null : <li>{symbol("patch-harvest")}{text[locale].mapPanelHarvest}</li>}
                  {cause === "harvest" ? null : <li>{symbol("patch-fire")}{text[locale].mapPanelFire}</li>}
                  {cause === "all" ? <li>{symbol("patch-none")}{text[locale].mapPanelNeither}</li> : null}
                </ul>
              ) : null}
            </div>
          ) : null}
          <div className="explore-map-control-cluster">
            <span
              className="explore-map-patch-control"
            >
              <button
                type="button"
                className="explore-map-corner-button"
                onClick={zoomToPatches}
                disabled={patchZoomDisabledReason !== null}
                title={patchZoomDisabledReason ?? undefined}
                aria-describedby={patchZoomDisabledReason ? PATCH_ZOOM_REASON_ID : undefined}
              >
                {text[locale].zoomToPatches}
              </button>
              {patchZoomDisabledReason ? (
                <span
                  id={PATCH_ZOOM_REASON_ID}
                  className="explore-map-patch-tooltip"
                  role="tooltip"
                >
                  {patchZoomDisabledReason}
                </span>
              ) : null}
            </span>
            {fullscreenAvailable ? (
              <button
                type="button"
                className="explore-map-corner-button explore-map-fullscreen-button"
                onClick={() => void toggleFullscreen()}
                aria-label={isFullscreen ? text[locale].exitFullscreen : text[locale].enterFullscreen}
              >
                {isFullscreen ? text[locale].exitFullscreen : text[locale].enterFullscreen}
              </button>
            ) : null}
            <div
              className="explore-map-zoom"
              role="group"
              aria-label={text[locale].zoomControls}
            >
              <button
                type="button"
                className="explore-map-zoom-button"
                onClick={() => mapRef.current?.zoomIn()}
                disabled={!view || view.atMaxZoom}
              >
                <span aria-hidden="true">+</span>
                <span className="sr-only">{text[locale].zoomIn}</span>
              </button>
              <button
                type="button"
                className="explore-map-zoom-button"
                onClick={() => mapRef.current?.zoomOut()}
                disabled={!view || view.atMinZoom}
              >
                {/* A mathematical minus sign remains legible at button size. */}
                <span aria-hidden="true">−</span>
                <span className="sr-only">{text[locale].zoomOut}</span>
              </button>
            </div>
          </div>
        </div>
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
      {perCellYears ? (
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
            {spanLegend(locale).map(([band, label]) => <li key={band}>{symbol(band)}{label}</li>)}
          </ul>
          <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="explore-map-table-caption">
            <table>
              <caption id="explore-map-table-caption">
                {labelled(locale, text[locale].spanTable, spanLabel)}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{text[locale].province}</th>
                  <th scope="col">{text[locale].lossHectares}</th>
                  <th scope="col">{text[locale].lossPercent}</th>
                  {multiYear ? <th scope="col">{text[locale].summedLoss}</th> : null}
                  <th scope="col">{text[locale].unknownShare}</th>
                </tr>
              </thead>
              <tbody>
                {spanRows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.name[locale]}</th>
                    <td>{row.unionLossHectares === null ? "–" : formatNumber(row.unionLossHectares, locale)}</td>
                    <td>{row.unionLossPercent === null ? "–" : formatPercent(row.unionLossPercent, locale)}</td>
                    {multiYear ? <td>{row.summedLossHectares === null ? "–" : formatNumber(row.summedLossHectares, locale)}</td> : null}
                    <td>{`${formatUnknownSharePercent(row.unknownSharePercent, locale)} (${formatNumber(row.unknownHectares ?? 0, locale)} ${text[locale].unknownArea})${row.unmappedCharacter ? `; ${row.unmappedCharacter[locale]}` : ""}`}</td>
                  </tr>
                ))}
                {fourProvinces ? (
                  <tr>
                    <th scope="row">{text[locale].fourProvinces}</th>
                    <td>{fourProvinces.unionLossHectares === null ? "–" : formatNumber(fourProvinces.unionLossHectares, locale)}</td>
                    <td>{fourProvinces.unionLossPercent === null ? "–" : formatPercent(fourProvinces.unionLossPercent, locale)}</td>
                    {multiYear ? <td>{fourProvinces.summedLossHectares === null ? "–" : formatNumber(fourProvinces.summedLossHectares, locale)}</td> : null}
                    <td>{`${formatNumber(fourProvinces.unknownHectares ?? 0, locale)} ${text[locale].unknownArea}`}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p>{text[locale].spanBasis}</p>
        </div>
      ) : null}
    </section>
  );
}
