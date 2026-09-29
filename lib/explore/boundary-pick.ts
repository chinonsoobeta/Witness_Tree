import type { Locale } from "@/lib/domain";
import { BOUNDARY_OVERLAY_IDS, type BoundaryOverlayId } from "./boundaries";
import type { BoundarySelection } from "./boundary-readout";

export type BoundaryFeature = Readonly<{
  layer: { id: string };
  properties?: Record<string, unknown> | null;
}>;

const boundaryHit = (layerId: string, overlay: BoundaryOverlayId) => {
  if (layerId === `boundary-${overlay}-line`) return "line" as const;
  if (layerId === `boundary-${overlay}-fill`) return "fill" as const;
  return null;
};

export function pickBoundary(
  features: readonly BoundaryFeature[],
  overlays: readonly BoundaryOverlayId[],
  locale: Locale,
): BoundarySelection | null {
  let best: {
    selection: BoundarySelection;
    kindRank: number;
    overlayRank: number;
    inputRank: number;
  } | null = null;

  for (let inputRank = 0; inputRank < features.length; inputRank += 1) {
    const feature = features[inputRank];
    for (const overlay of BOUNDARY_OVERLAY_IDS) {
      if (!overlays.includes(overlay)) continue;
      const kind = boundaryHit(feature.layer.id, overlay);
      if (!kind) continue;
      const boundaryId = feature.properties?.id;
      const name = feature.properties?.[locale === "fr" ? "name_fr" : "name_en"];
      const jurisdiction = feature.properties?.juris;
      if (
        typeof boundaryId !== "string" || boundaryId.length === 0 ||
        typeof name !== "string" || name.length === 0 ||
        typeof jurisdiction !== "string" || jurisdiction.length === 0
      ) continue;

      const candidate = {
        selection: { overlay, boundaryId, name, jurisdiction },
        kindRank: kind === "line" ? 0 : 1,
        overlayRank: BOUNDARY_OVERLAY_IDS.indexOf(overlay),
        inputRank,
      };
      if (
        best === null ||
        candidate.kindRank < best.kindRank ||
        (candidate.kindRank === best.kindRank && candidate.overlayRank < best.overlayRank) ||
        (candidate.kindRank === best.kindRank && candidate.overlayRank === best.overlayRank && candidate.inputRank < best.inputRank)
      ) {
        best = candidate;
      }
    }
  }

  return best ? best.selection : null;
}

export function boundaryHighlightFilter(selection: BoundarySelection | null): readonly unknown[] {
  return [
    "all",
    ["==", ["get", "id"], selection?.boundaryId ?? ""],
    ["==", ["get", "juris"], selection?.jurisdiction ?? ""],
  ];
}
