import { rankRidings } from "./ranking";
import type { ComparisonPlace, RankedRiding, RankingContext } from "./types";

export const MINIMUM_RANKED_FOREST_HECTARES = 500;
/** Federal district numbers start with the province code: Quebec, Ontario, Alberta, British Columbia. */
export const COVERED_FEDERAL_DISTRICT_PREFIXES = ["24", "35", "48", "59"] as const;

/** A federal riding in the four provinces, with its figures for the comparison's span from the riding interval release. */
export type FederalRidingSource = Readonly<{
  /** The release's tile form, such as `CA-59001`. */
  boundaryId: string;
  name: Readonly<{ en: string; fr: string }>;
  coverage: "complete" | "partial-with-unknown" | "none-mapped";
  observedLossPercent: number | null;
  observedLossHectares: number | null;
  admittedUnknownPercent?: number;
  knownForestedHectares: number;
}>;

/** Canada has 343 federal ridings under the 2023 Representation Order. */
const FEDERAL_RIDING_COUNT = 343;

export type RealFederalRidingComparison = Readonly<{
  context: RankingContext;
  /** The four provinces' federal ridings, each with its figures. */
  rows: readonly RankedRiding[];
  places: readonly ComparisonPlace[];
  /** The four-province rows available on the comparison surface. */
  comparisonRows: readonly RankedRiding[];
  /** Federal ridings outside the four provinces: named, so a link to one says why it can't be compared, and never measured here. */
  outside: readonly Readonly<{ id: string; name: Readonly<{ en: string; fr: string }> }>[];
  /** Every federal riding in Canada, to reconcile with the covered count. */
  nationalTotal: number;
  /** A measured pair shown before the reader makes a selection. */
  defaultPair: readonly [RankedRiding, RankedRiding];
}>;

const isCoveredFederalId = (boundaryId: string) =>
  COVERED_FEDERAL_DISTRICT_PREFIXES.some((prefix) => boundaryId.startsWith(`CA-${prefix}`));

/*
 * Federal ridings.
 *
 * Their figures come from the riding interval release that Explore and the
 * place pages read, for the span the caller names, under the rule those apply:
 * a riding with less than 1% of its forest unmapped is measured over its mapped
 * forest and the unmapped share travels with it (owner decision, 2026-10-03).
 * Ranking keeps the floor of 500 forested hectares. A riding that is not
 * mapped in full never carries a figure, so it can't be restated as zero.
 */
export function adaptFederalRidingComparison(input: Readonly<{
  interval: Readonly<{ fromYear: number; toYear: number }>;
  dataVersion: string;
  rows: readonly FederalRidingSource[];
  outside: readonly Readonly<{ boundaryId: string; name: Readonly<{ en: string; fr: string }> }>[];
}>): RealFederalRidingComparison {
  const { interval } = input;
  if (!interval || !Number.isInteger(interval.fromYear) || !Number.isInteger(interval.toYear) ||
    interval.toYear <= interval.fromYear) {
    throw new Error("Federal-riding comparison must declare the span it measures.");
  }
  if (input.rows.length + input.outside.length !== FEDERAL_RIDING_COUNT) {
    throw new Error(`Federal-riding comparison must contain exactly ${FEDERAL_RIDING_COUNT} districts.`);
  }

  const ids = new Set<string>();
  const claim = (boundaryId: string) => {
    if (ids.has(boundaryId)) throw new Error(`Duplicate federal district ${boundaryId}.`);
    ids.add(boundaryId);
  };
  const rows = input.rows.map((source): RankedRiding => {
    claim(source.boundaryId);
    if (!isCoveredFederalId(source.boundaryId)) throw new Error(`Federal district ${source.boundaryId} is outside the four provinces.`);
    if (!source.name.en.trim() || !source.name.fr.trim()) throw new Error(`Federal district ${source.boundaryId} has no name.`);
    const complete = source.coverage === "complete";
    if (!complete && (source.observedLossPercent !== null || source.observedLossHectares !== null)) {
      throw new Error(`Federal district ${source.boundaryId} fabricates a complete value from partial coverage.`);
    }
    if (complete && (source.observedLossPercent === null || source.observedLossHectares === null)) {
      throw new Error(`Federal district ${source.boundaryId} is fully mapped but has no figure.`);
    }
    if (!Number.isFinite(source.knownForestedHectares) || source.knownForestedHectares < 0) {
      throw new Error(`Federal district ${source.boundaryId} has an invalid forest area.`);
    }
    return {
      id: `federal-${source.boundaryId.slice("CA-".length)}`,
      name: source.name,
      placeType: "federal-riding",
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
  const outside = input.outside.map(({ boundaryId, name }) => {
    claim(boundaryId);
    if (isCoveredFederalId(boundaryId)) throw new Error(`Federal district ${boundaryId} is in the four provinces but has no figures.`);
    return { id: `federal-${boundaryId.slice("CA-".length)}`, name };
  });

  const context: RankingContext = {
    timeRange: `${interval.fromYear}–${interval.toYear}`,
    boundaryEdition: "2023 Representation Order",
    dataVersion: input.dataVersion,
    evidence: "satellite-observation",
    denominatorDefinition: {
      en: `Share of the mapped forest as it stood in ${interval.fromYear}.`,
      fr: `Part de la forêt cartographiée telle qu’elle était en ${interval.fromYear}.`,
    },
    method: {
      en: `Federal ridings with at least ${MINIMUM_RANKED_FOREST_HECTARES} hectares of forest, mapped in full or with less than 1% unmapped, are ranked by the share of forest lost. Where a small part is unmapped, the share is of the mapped forest.`,
      // Draft French for the owner's review (2026-11-10), following the provincial wording.
      fr: `Les circonscriptions fédérales comptant au moins ${MINIMUM_RANKED_FOREST_HECTARES} hectares de forêt, entièrement cartographiées ou dont moins de 1\u00A0% n’est pas cartographié, sont classées selon la part de forêt perdue. Lorsqu’une petite partie n’est pas cartographiée, la part porte sur la forêt cartographiée.`,
    },
  };
  const ranked = rankRidings(rows).ranked;
  if (ranked.length < 2) {
    throw new Error("Federal-riding comparison needs two ranked districts for its default pair.");
  }
  const defaultPair: readonly [RankedRiding, RankedRiding] = [ranked[0]!, ranked[1]!];
  return { context, rows, places: rows, comparisonRows: rows, outside, nationalTotal: rows.length + outside.length, defaultPair };
}

/*
 * Provincial ridings.
 *
 * Their figures come from the same riding interval release, for the same span
 * as the federal comparison, under the rule Explore applies to
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
