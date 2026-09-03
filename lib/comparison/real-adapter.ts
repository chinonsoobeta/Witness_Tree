import { rankRidings } from "./ranking";
import type { ComparisonPlace, RankedRiding, RankingContext } from "./types";

export const MINIMUM_RANKED_FOREST_HECTARES = 500;
const COVERED_FEDERAL_DISTRICT_PREFIXES = ["24", "35", "48", "59"] as const;

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
  /** The span the document was built for. Every row must agree with it. */
  context: Readonly<{ interval: Readonly<{ fromYear: number; toYear: number }> }>;
  rows: readonly RawRow[];
}>;

export type RealFederalRidingComparison = Readonly<{
  context: RankingContext;
  /** Every district in the source evidence, retained for search and audit surfaces. */
  rows: readonly RankedRiding[];
  places: readonly ComparisonPlace[];
  /** The four-province rows available on the comparison surface. */
  comparisonRows: readonly RankedRiding[];
  /** A measured pair shown before the reader makes a selection. */
  defaultPair: readonly [RankedRiding, RankedRiding];
}>;

export function adaptFederalRidingComparison(input: RawComparison): RealFederalRidingComparison {
  if (input.schemaVersion !== "witness-tree/phase2-federal-riding-latest-comparison/1") {
    throw new Error("Federal-riding comparison has an unsupported schema.");
  }
  if (input.status !== "local-nonproduction-executed" || Object.values(input.claims).some(Boolean)) {
    throw new Error("Federal-riding comparison must remain local, non-released, and nonproduction.");
  }
  if (input.rows.length !== 343) throw new Error("Federal-riding comparison must contain exactly 343 districts.");
  /*
   * The span comes from the document rather than from a literal here.
   *
   * A hardcoded 2021 to 2022 was correct for the only comparison ever built,
   * and it was also the thing that would have silently mislabelled the next
   * one: a document rebuilt over a wider span would have been rejected as
   * malformed, or worse, relabelled with years it did not measure. Reading the
   * declared span keeps the check exactly as strict, since every row is still
   * required to agree with it, while letting the document say what it measured.
   */
  const interval = input.context?.interval;
  if (!interval || !Number.isInteger(interval.fromYear) || !Number.isInteger(interval.toYear) ||
    interval.toYear <= interval.fromYear) {
    throw new Error("Federal-riding comparison must declare the span it measures.");
  }

  const ids = new Set<string>();
  const rows = input.rows.map((source): RankedRiding => {
    if (ids.has(source.boundaryId)) throw new Error(`Duplicate federal district ${source.boundaryId}.`);
    ids.add(source.boundaryId);
    if (source.fromYear !== interval.fromYear || source.toYear !== interval.toYear) {
      throw new Error(`Federal district ${source.boundaryId} was measured over a different span than the document declares.`);
    }
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
    timeRange: `${interval.fromYear}–${interval.toYear}`,
    boundaryEdition: "2023 Representation Order",
    dataVersion: "phase2-real-national-1984-2022-v1",
    evidence: "satellite-observation",
    denominatorDefinition: {
      en: `Share of known forested hectares in the ${interval.fromYear} first-year forest mask.`,
      fr: `Part des hectares forestiers connus dans le masque forestier de la première année, ${interval.fromYear}.`,
    },
    method: {
      en: "Federal districts with complete mapped coverage and at least 500 forested hectares are ranked by detected-loss share.",
      fr: "Les circonscriptions fédérales ayant une couverture cartographiée complète et au moins 500 hectares forestiers sont classées selon la part de perte détectée.",
    },
  };
  const comparisonRows = rows.filter((row) =>
    COVERED_FEDERAL_DISTRICT_PREFIXES.some((prefix) => row.id.startsWith(`federal-${prefix}`)),
  );
  const ranked = rankRidings(comparisonRows).ranked;
  if (ranked.length < 2) {
    throw new Error("Federal-riding comparison needs two ranked districts for its default pair.");
  }
  const defaultPair: readonly [RankedRiding, RankedRiding] = [ranked[0]!, ranked[1]!];
  return { context, rows, places: rows, comparisonRows, defaultPair };
}
