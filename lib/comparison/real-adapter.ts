import type { ComparisonPlace, RankedRiding, RankingContext } from "./types";

export const MINIMUM_RANKED_FOREST_HECTARES = 500;

type RawRow = Readonly<{
  boundaryId: string;
  boundaryName: Readonly<{ en: string; fr: string }>;
  fromYear: number;
  toYear: number;
  knownForestedHectares: number;
  lossHectares: number | null;
  observedLossPercent: number | null;
  coverageGrade: "complete" | "partial-with-unknown" | "none-mapped";
  rankable: boolean;
  unmatchedOfficialShare: null;
}>;

type RawComparison = Readonly<{
  schemaVersion: string;
  status: string;
  claims: Readonly<{ admitted: false; released: false; productionEligible: false; externalAction: false }>;
  rows: readonly RawRow[];
}>;

export type RealFederalRidingComparison = Readonly<{
  context: RankingContext;
  rows: readonly RankedRiding[];
  places: readonly ComparisonPlace[];
}>;

export function adaptFederalRidingComparison(input: RawComparison): RealFederalRidingComparison {
  if (input.schemaVersion !== "witness-tree/phase2-federal-riding-latest-comparison/1") {
    throw new Error("Federal-riding comparison has an unsupported schema.");
  }
  if (input.status !== "local-nonproduction-executed" || Object.values(input.claims).some(Boolean)) {
    throw new Error("Federal-riding comparison must remain local, non-released, and nonproduction.");
  }
  if (input.rows.length !== 343) throw new Error("Federal-riding comparison must contain exactly 343 districts.");

  const ids = new Set<string>();
  const rows = input.rows.map((source): RankedRiding => {
    if (ids.has(source.boundaryId)) throw new Error(`Duplicate federal district ${source.boundaryId}.`);
    ids.add(source.boundaryId);
    if (source.fromYear !== 2021 || source.toYear !== 2022) throw new Error("Federal-riding comparison interval must be 2021 to 2022.");
    const complete = source.coverageGrade === "complete";
    if (source.rankable !== (complete && source.observedLossPercent !== null && source.lossHectares !== null && source.knownForestedHectares >= MINIMUM_RANKED_FOREST_HECTARES)) {
      throw new Error(`Federal district ${source.boundaryId} has inconsistent rankability.`);
    }
    if (!complete && (source.observedLossPercent !== null || source.lossHectares !== null)) {
      throw new Error(`Federal district ${source.boundaryId} fabricates a complete value from partial coverage.`);
    }
    return {
      id: `federal-${source.boundaryId}`,
      name: source.boundaryName,
      placeType: "federal-riding",
      detectedChangePercent: source.observedLossPercent,
      detectedChangeHectares: source.lossHectares,
      forestedHectares: source.knownForestedHectares,
      unmatchedSharePercent: source.unmatchedOfficialShare,
      coverageGrade: complete ? "national-baseline" : "not-applicable",
      measurementCoverage: source.coverageGrade,
      evidence: "satellite-observation",
      sufficientCoverage: source.rankable,
    };
  });

  const context: RankingContext = {
    timeRange: "2021–2022",
    boundaryEdition: "2023 Representation Order",
    dataVersion: "phase2-real-national-1984-2022-v1",
    evidence: "satellite-observation",
    denominatorDefinition: {
      en: "Share of known forested hectares in the 2021 first-year forest mask.",
      fr: "Part des hectares forestiers connus dans le masque forestier de la première année, 2021.",
    },
    method: {
      en: "Federal districts with complete mapped coverage and at least 500 forested hectares are ranked by detected-loss share.",
      fr: "Les circonscriptions fédérales ayant une couverture cartographiée complète et au moins 500 hectares forestiers sont classées selon la part de perte détectée.",
    },
  };
  return { context, rows, places: rows };
}
