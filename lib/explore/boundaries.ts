import { EXPLORE_MAP_COLOURS } from "./map-style";

// Reference geometry drawn over the loss map. These are not data layers: they
// answer "where is this" and "who represents it", never "how much loss". They
// are deliberately drawn in the neutral ink and observation greys rather than
// in any of the disturbance colours, so that nothing on the map reads as a
// measurement when it is only a boundary.

export const BOUNDARY_OVERLAY_IDS = [
  "federal-ridings",
  "provincial-ridings",
  "economic-regions",
  "watersheds",
] as const;
export type BoundaryOverlayId = (typeof BOUNDARY_OVERLAY_IDS)[number];

// Pinned to the immutable release published from
// scripts/publish-boundary-overlay-release.mjs. scripts/check-boundary-overlays.mjs
// fails if this drifts from data/boundary-overlay-release.json.
export const BOUNDARY_OVERLAY_RELEASE = Object.freeze({
  releaseId: "2c3667c5e23d4f976791cc30ae8246f63e2aa03b4c4829a7006952cdd43f7ff8",
  base: "https://d3g1406o0uekin.cloudfront.net/releases/boundary-overlays-v2/2c3667c5e23d4f976791cc30ae8246f63e2aa03b4c4829a7006952cdd43f7ff8/tiles",
} as const);

type Bilingual = Readonly<Record<"en" | "fr", string>>;

export type BoundaryOverlay = Readonly<{
  id: BoundaryOverlayId;
  label: Bilingual;
  available: boolean;
  /** Present only when available. */
  url?: string;
  sourceLayer?: string;
  colour?: string;
  dash?: readonly number[];
  /** What this layer covers, and just as importantly what it does not. */
  note: Bilingual;
  attribution?: Bilingual;
  /** Present only when unavailable: why, in the reader's own terms. */
  reason?: Bilingual;
}>;

const url = (fileName: string) => `${BOUNDARY_OVERLAY_RELEASE.base}/${fileName}`;

export const BOUNDARY_OVERLAYS: Readonly<Record<BoundaryOverlayId, BoundaryOverlay>> =
  Object.freeze({
    "federal-ridings": {
      id: "federal-ridings",
      label: { en: "Federal ridings", fr: "Circonscriptions fédérales" },
      available: true,
      url: url("federal-ridings-v2.pmtiles"),
      sourceLayer: "federal_ridings",
      colour: EXPLORE_MAP_COLOURS.ink,
      note: {
        en: "All 343 federal electoral districts under the 2023 representation order, used from the 45th general election.",
        fr: "Les 343 circonscriptions électorales fédérales du décret de représentation de 2023, en usage depuis la 45e élection générale.",
      },
      attribution: {
        en: "Elections Canada, 2023 representation order.",
        fr: "Élections Canada, décret de représentation de 2023.",
      },
    },
    "provincial-ridings": {
      id: "provincial-ridings",
      label: { en: "Provincial ridings", fr: "Circonscriptions provinciales" },
      available: true,
      url: url("provincial-ridings-v2.pmtiles"),
      sourceLayer: "provincial_ridings",
      colour: EXPLORE_MAP_COLOURS.observation,
      dash: [3, 2],
      // Four provinces, and that is the layer's scope rather than a shortfall
      // against some wider promise. Naming the scope on the layer itself is
      // still necessary: a reader who sees no boundary over Saskatchewan must
      // not read that as a claim that Saskatchewan has no ridings.
      note: {
        en: "British Columbia, Alberta, Ontario and Québec, 431 districts. Those four provinces are what this layer covers. Other provinces and the territories are not drawn, which says nothing about them. Québec's 127 districts are the 2026 list, which does not take effect until the 43rd legislature ends.",
        fr: "Colombie-Britannique, Alberta, Ontario et Québec, 431 circonscriptions. Ces quatre provinces constituent la portée de cette couche. Les autres provinces et les territoires ne sont pas tracés, ce qui n'énonce rien à leur sujet. Les 127 circonscriptions du Québec sont la liste de 2026, qui n'entre en vigueur qu'à la fin de la 43e législature.",
      },
      attribution: {
        en: "Elections BC; Open Government Licence – Alberta; Elections Ontario; Élections Québec.",
        fr: "Elections BC; Licence du gouvernement ouvert – Alberta; Élections Ontario; Élections Québec.",
      },
    },
    "economic-regions": {
      id: "economic-regions",
      label: { en: "Economic regions", fr: "Régions économiques" },
      available: true,
      url: url("economic-regions-v2.pmtiles"),
      sourceLayer: "economic_regions",
      colour: EXPLORE_MAP_COLOURS.observation,
      dash: [5, 2],
      note: {
        en: "All 76 Statistics Canada 2021 economic regions are drawn as a bilingual reference framework.",
        fr: "Les 76 régions économiques de Statistique Canada de 2021 sont tracées comme cadre de référence bilingue.",
      },
      attribution: {
        en: "Statistics Canada, 2021 Economic Region Boundary File.",
        fr: "Statistique Canada, Fichier des limites des régions économiques de 2021.",
      },
    },
    watersheds: {
      id: "watersheds",
      label: { en: "Watersheds", fr: "Bassins versants" },
      available: true,
      url: url("watersheds-v2.pmtiles"),
      sourceLayer: "watersheds",
      colour: EXPLORE_MAP_COLOURS.ink,
      dash: [2, 2],
      note: {
        en: "The 169 Canadian areas in NRCan's bilingual Water Survey of Canada sub-drainage rollup, version 6.0, are drawn as a reference framework.",
        fr: "Les 169 aires canadiennes du regroupement bilingue des sous-aires de drainage de la Division des relevés hydrologiques du Canada de RNCan, version 6.0, sont tracées comme cadre de référence.",
      },
      attribution: {
        en: "Natural Resources Canada, Atlas of Canada drainage areas, version 6.0 (2008).",
        fr: "Ressources naturelles Canada, aires de drainage de l'Atlas du Canada, version 6.0 (2008).",
      },
    },
  });

export const AVAILABLE_BOUNDARY_OVERLAYS = BOUNDARY_OVERLAY_IDS.filter(
  (id) => BOUNDARY_OVERLAYS[id].available,
);

/**
 * Reads the overlay query parameter. Unknown and unavailable ids are dropped
 * rather than rejected, so a stale or hand-edited link degrades to a map
 * without that overlay instead of an error page.
 */
export function parseBoundaryOverlays(value: string | undefined): readonly BoundaryOverlayId[] {
  if (!value) return [];
  const requested = new Set(value.split(",").map((part) => part.trim()));
  return BOUNDARY_OVERLAY_IDS.filter(
    (id) => requested.has(id) && BOUNDARY_OVERLAYS[id].available,
  );
}

export const serializeBoundaryOverlays = (ids: readonly BoundaryOverlayId[]) =>
  ids.join(",");

/** The overlay list with one id toggled, used to build each control's link. */
export function toggleBoundaryOverlay(
  active: readonly BoundaryOverlayId[],
  id: BoundaryOverlayId,
): readonly BoundaryOverlayId[] {
  return active.includes(id)
    ? active.filter((entry) => entry !== id)
    : BOUNDARY_OVERLAY_IDS.filter((entry) => entry === id || active.includes(entry));
}
