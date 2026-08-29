import { EXPLORE_MAP_COLOURS } from "./map-style";

// Reference geometry drawn over the loss map. These are not data layers: they
// answer "where is this" and "who represents it", never "how much loss". They
// are deliberately drawn in the neutral ink and observation greys rather than
// in any of the disturbance colours, so that nothing on the map reads as a
// measurement when it is only a boundary.

export const BOUNDARY_OVERLAY_IDS = [
  "federal-ridings",
  "provincial-ridings",
  "watersheds",
] as const;
export type BoundaryOverlayId = (typeof BOUNDARY_OVERLAY_IDS)[number];

// Pinned to the immutable release published from
// scripts/publish-boundary-overlay-release.mjs. scripts/check-boundary-overlays.mjs
// fails if this drifts from data/boundary-overlay-release.json.
export const BOUNDARY_OVERLAY_RELEASE = Object.freeze({
  releaseId: "b7ae6917bcf8645f3bcc5eda441c38a41695cff407af8eb5451bd20d97d76ba5",
  base: "https://d3g1406o0uekin.cloudfront.net/releases/boundary-overlays-v1/b7ae6917bcf8645f3bcc5eda441c38a41695cff407af8eb5451bd20d97d76ba5/tiles",
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
      url: url("federal-ridings-v1.pmtiles"),
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
      url: url("provincial-ridings-v1.pmtiles"),
      sourceLayer: "provincial_ridings",
      colour: EXPLORE_MAP_COLOURS.observation,
      dash: [3, 2],
      // Four provinces, not the country. Saying so on the layer itself is the
      // difference between a partial overlay and a misleading one: a reader
      // who sees no boundary over Saskatchewan must not read that as a claim
      // that Saskatchewan has no ridings.
      note: {
        en: "British Columbia, Alberta, Ontario and Québec only, 431 districts. Other provinces and the territories are not drawn, which is a gap in this layer and not a statement about them. Québec's 127 districts are the 2026 list, which does not take effect until the 43rd legislature ends.",
        fr: "Colombie-Britannique, Alberta, Ontario et Québec seulement, 431 circonscriptions. Les autres provinces et les territoires ne sont pas tracés, ce qui est une lacune de cette couche et non un énoncé à leur sujet. Les 127 circonscriptions du Québec sont la liste de 2026, qui n'entre en vigueur qu'à la fin de la 43e législature.",
      },
      attribution: {
        en: "Elections BC; Open Government Licence – Alberta; Elections Ontario; Élections Québec.",
        fr: "Elections BC; Licence du gouvernement ouvert – Alberta; Élections Ontario; Élections Québec.",
      },
    },
    watersheds: {
      id: "watersheds",
      label: { en: "Watersheds", fr: "Bassins versants" },
      available: false,
      note: {
        en: "Planned as an aggregation unit, so that forest loss can be reported per watershed rather than only outlined.",
        fr: "Prévu comme unité d'agrégation, afin que la perte forestière soit déclarée par bassin versant et non seulement tracée.",
      },
      reason: {
        en: "No authoritative national watershed edition has been chosen yet. The framework is nested, so the level to report at is a decision rather than a lookup, and an outline with no figure attached to it would add nothing this map does not already show.",
        fr: "Aucune édition nationale faisant autorité n'a encore été retenue. Le cadre est imbriqué : le niveau de déclaration est une décision et non une simple recherche, et un tracé sans chiffre associé n'ajouterait rien à cette carte.",
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
