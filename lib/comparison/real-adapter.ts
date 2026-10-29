import { rankRidings } from "./ranking";
import type { ComparisonPlace, RankedRiding, RankingContext } from "./types";

export const MINIMUM_RANKED_FOREST_HECTARES = 500;
/** Federal district numbers start with the province code: Quebec, Ontario, Alberta, British Columbia. */
export const COVERED_FEDERAL_DISTRICT_PREFIXES = ["24", "35", "48", "59"] as const;

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
      en: `Share of the mapped forest as it stood in ${interval.fromYear}.`,
      fr: `Part de la forêt cartographiée telle qu’elle était en ${interval.fromYear}.`,
    },
    method: {
      en: "Federal ridings that are fully mapped and have at least 500 hectares of forest are ranked by the share of forest lost.",
      fr: "Les circonscriptions fédérales entièrement cartographiées et comptant au moins 500 hectares de forêt sont classées selon la part de forêt perdue.",
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

/*
 * Provincial ridings.
 *
 * Their figures come from the riding interval release that Explore reads, for
 * the same span as the federal comparison, under the rule Explore applies to
 * them: a riding with less than 1% of its forest unmapped is measured over its
 * mapped forest and the unmapped share travels with it (owner decision,
 * 2026-10-03). Ranking keeps the federal floor of 500 forested hectares.
 *
 * Each province is ranked on its own. A provincial riding is never ranked
 * against another province's ridings, nor against federal ones.
 *
 * Compare ids: a federal riding stays `federal-<district number>`, so old links
 * keep working, and a provincial riding is `provincial-<province>-<district
 * id>` (for example `provincial-BC-258`): the search id with a level prefix.
 * The two prefixes cannot collide.
 */

export const COVERED_PROVINCES = ["BC", "AB", "ON", "QC"] as const;
export type CoveredProvince = (typeof COVERED_PROVINCES)[number];

/** One value per covered province, built by `make`. */
export function byCoveredProvince<T>(make: (province: CoveredProvince) => T): Record<CoveredProvince, T> {
  return { BC: make("BC"), AB: make("AB"), ON: make("ON"), QC: make("QC") };
}

/**
 * Which ridings a ranking ranks. Federal ridings rank among the covered
 * federal ridings; a province's provincial ridings rank only among themselves.
 */
export type RankingScope =
  | Readonly<{ level: "federal"; /** Every federal riding in Canada, to reconcile with the covered count. */ nationalTotal?: number }>
  | Readonly<{ level: "provincial"; province: CoveredProvince }>;

/** Province names, with the French form a sentence needs after "de". */
export const COVERED_PROVINCE_NAMES: Readonly<Record<CoveredProvince, Readonly<{ en: string; fr: string; frOf: string }>>> = {
  BC: { en: "British Columbia", fr: "Colombie-Britannique", frOf: "de la Colombie-Britannique" },
  AB: { en: "Alberta", fr: "Alberta", frOf: "de l’Alberta" },
  ON: { en: "Ontario", fr: "Ontario", frOf: "de l’Ontario" },
  QC: { en: "Québec", fr: "Québec", frOf: "du Québec" },
};

export type ProvincialRidingSource = Readonly<{
  /** The release's tile form, such as `BC-258`. */
  boundaryId: string;
  jurisdiction: string;
  name: Readonly<{ en: string; fr: string }>;
  coverage: "complete" | "partial-with-unknown" | "none-mapped";
  observedLossPercent: number | null;
  observedLossHectares: number | null;
  admittedUnknownPercent?: number;
  knownForestedHectares: number;
}>;

export type RealProvincialRidingComparison = Readonly<{
  rows: readonly RankedRiding[];
  rowsByProvince: Readonly<Record<CoveredProvince, readonly RankedRiding[]>>;
  contexts: Readonly<Record<CoveredProvince, RankingContext>>;
}>;

/** The province of a provincial Compare id, or null for a federal id or anything else. */
export function provincialRidingProvince(id: string): CoveredProvince | null {
  const code = /^provincial-([A-Z]{2})-./.exec(id)?.[1];
  return COVERED_PROVINCES.find((province) => province === code) ?? null;
}

export function adaptProvincialRidingComparison(input: Readonly<{
  interval: Readonly<{ fromYear: number; toYear: number }>;
  dataVersion: string;
  /** The representation order each province's boundaries follow. */
  editions: Readonly<Record<CoveredProvince, number>>;
  rows: readonly ProvincialRidingSource[];
}>): RealProvincialRidingComparison {
  const { interval } = input;
  const ids = new Set<string>();
  const rows = input.rows.map((source): RankedRiding => {
    const province = COVERED_PROVINCES.find((code) => code === source.jurisdiction);
    if (!province || !source.boundaryId.startsWith(`${province}-`)) {
      throw new Error(`Provincial riding ${source.boundaryId} names no covered province.`);
    }
    const id = `provincial-${source.boundaryId}`;
    if (ids.has(id)) throw new Error(`Duplicate provincial riding ${source.boundaryId}.`);
    ids.add(id);
    if (!source.name.en.trim() || !source.name.fr.trim()) throw new Error(`Provincial riding ${source.boundaryId} has no name.`);
    const complete = source.coverage === "complete";
    if (complete !== (source.observedLossPercent !== null && source.observedLossHectares !== null)) {
      throw new Error(`Provincial riding ${source.boundaryId} reports figures that disagree with its coverage.`);
    }
    if (!Number.isFinite(source.knownForestedHectares) || source.knownForestedHectares < 0) {
      throw new Error(`Provincial riding ${source.boundaryId} has an invalid forest area.`);
    }
    return {
      id,
      name: source.name,
      placeType: "provincial-riding",
      detectedChangePercent: source.observedLossPercent,
      detectedChangeHectares: source.observedLossHectares,
      forestedHectares: source.knownForestedHectares,
      unmatchedSharePercent: null,
      coverageGrade: complete ? "national-baseline" : "not-applicable",
      measurementCoverage: source.coverage,
      ...(source.admittedUnknownPercent === undefined ? {} : { admittedUnknownPercent: source.admittedUnknownPercent }),
      evidence: "satellite-observation",
      sufficientCoverage: complete && source.knownForestedHectares >= MINIMUM_RANKED_FOREST_HECTARES,
    };
  });
  const rowsByProvince = byCoveredProvince((province): readonly RankedRiding[] =>
    rows.filter((row) => provincialRidingProvince(row.id) === province));
  const contexts = byCoveredProvince((province): RankingContext => {
    const name = COVERED_PROVINCE_NAMES[province];
    const edition = input.editions[province];
    const context: RankingContext = {
      timeRange: `${interval.fromYear}–${interval.toYear}`,
      boundaryEdition: `${province} ${edition}`,
      dataVersion: input.dataVersion,
      evidence: "satellite-observation",
      denominatorDefinition: {
        en: `Share of the mapped forest as it stood in ${interval.fromYear}.`,
        fr: `Part de la forêt cartographiée telle qu’elle était en ${interval.fromYear}.`,
      },
      method: {
        en: `Provincial ridings in ${name.en} with at least ${MINIMUM_RANKED_FOREST_HECTARES} hectares of forest, mapped in full or with less than 1% unmapped, are ranked by the share of forest lost, against the other provincial ridings of ${name.en} only. Where a small part is unmapped, the share is of the mapped forest. Boundaries: ${name.en}’s ${edition} representation order.`,
        fr: `Les circonscriptions provinciales ${name.frOf} comptant au moins ${MINIMUM_RANKED_FOREST_HECTARES} hectares de forêt, entièrement cartographiées ou dont moins de 1\u00A0% n’est pas cartographié, sont classées selon la part de forêt perdue, uniquement par rapport aux autres circonscriptions provinciales ${name.frOf}. Lorsqu’une petite partie n’est pas cartographiée, la part porte sur la forêt cartographiée. Limites\u202F: décret de représentation de ${edition} ${name.frOf}.`,
      },
    };
    return context;
  });
  return { rows, rowsByProvince, contexts };
}
