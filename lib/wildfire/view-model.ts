import { assignConfidence, type Locale, type Reported } from "@/lib/domain";

export type WildfireFeedState = Readonly<{
  status: "healthy" | "degraded";
  sourceUpdatedAt: string;
  lastSuccessfulRefreshAt: string;
  agencyName: string;
  agencyUrl: string;
}>;

export type WildfireViewModel = WildfireFeedState & Readonly<{
  state: "healthy" | "degraded" | "stale";
  nextScheduledRefresh: string;
  isIllustrative: true;
  summary: Reported;
}>;

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function buildWildfireViewModel(feed: WildfireFeedState, now = new Date()): WildfireViewModel {
  const age = now.getTime() - new Date(feed.lastSuccessfulRefreshAt).getTime();
  const state = age > STALE_AFTER_MS ? "stale" : feed.status;
  return {
    ...feed,
    state,
    nextScheduledRefresh: "21:00 America/Vancouver",
    isIllustrative: true,
    summary: {
      kind: "figure",
      value: 1_250,
      unit: "ha",
      evidence: "derived-estimate",
      confidence: assignConfidence({ authoritativeRecord: true, geometryResolved: true, requiredAttributesPresent: true }),
      provenance: {
        dataset: "Illustrative wildfire perimeter fixture",
        version: "fixture-1",
        retrievedDate: feed.sourceUpdatedAt,
        licence: "ogl-canada-2.0",
        recordUrl: feed.agencyUrl,
      },
    },
  };
}

export const wildfireText = (locale: Locale) => locale === "en" ? {
  title: "Wildfire context",
  fixture: "Illustrative fixture — not live wildfire data.",
  sourceUpdated: "Source updated",
  lastRefresh: "Last successful Witness Tree refresh",
  agency: "Source agency",
  nextRefresh: "Next scheduled refresh",
  emergency: "Official emergency information",
  context: "Witness Tree provides context, not emergency direction. The responsible agency is the authority for public safety information.",
  degraded: "This illustrative source is degraded. Consult the responsible agency.",
  stale: "This illustrative feed is more than 24 hours old. Live wildfire content is unavailable; consult the responsible agency.",
  summary: "Illustrative derived estimate",
  perimeter: "A fire perimeter is not a damage or mortality map.",
} : {
  title: "Contexte des incendies",
  fixture: "Exemple illustratif — ces données sur les incendies ne sont pas en direct.",
  sourceUpdated: "Mise à jour de la source",
  lastRefresh: "Dernière actualisation réussie de Witness Tree",
  agency: "Organisme source",
  nextRefresh: "Prochaine actualisation prévue",
  emergency: "Information officielle d’urgence",
  context: "Witness Tree fournit du contexte, et non des directives d’urgence. L’organisme responsable fait autorité pour les renseignements de sécurité publique.",
  degraded: "Cette source illustrative est dégradée. Consultez l’organisme responsable.",
  stale: "Cette source illustrative a plus de 24 heures. Le contenu actuel sur les incendies est indisponible; consultez l’organisme responsable.",
  summary: "Estimation dérivée illustrative",
  perimeter: "Le périmètre d’un incendie n’est pas une carte des dommages ou de la mortalité.",
};
