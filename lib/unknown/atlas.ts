import gapReceipt from "@/data/coverage-gap-investigation-2026-09-08.json";
import harvestComparison from "@/data/phase2-official-published-harvest-comparison.json";
import { federalRidingComparison, MINIMUM_RANKED_FOREST_HECTARES, rankRidings } from "@/lib/comparison";
import { CELL_HECTARES } from "@/lib/domain/loss-vocabulary";
import { CONDITION_RECOVERY, conditionRecoveryMeasurements, type ConditionRecoveryRelease } from "@/lib/explore/condition-recovery";
import { exploreHref } from "@/lib/explore/href";
import { PROVINCE_SPANS, provinceSpanDisplayRows, type ProvinceSpanId } from "@/lib/explore/province-spans";
// By path, not through the barrel: this module carries every span for every district.
import { ridingIntervalMeasurements } from "@/lib/explore/riding-intervals";
import { EXPLORE_DEFAULT_YEAR } from "@/lib/explore/types";
import { UNMAPPED_REASONS } from "@/lib/explore/unmapped-reasons";

/*
 * The Unknown Atlas reads what the record cannot see out of the same records
 * the other pages read. Nothing here is typed by hand: a count, a list of
 * withheld rows or an unmapped area changes when its record does, and a record
 * this module cannot read correctly fails the build rather than rendering.
 */

export type ProvinceCode = "BC" | "AB" | "ON" | "QC";
const PROVINCE_ORDER: readonly ProvinceCode[] = ["BC", "AB", "ON", "QC"];
const CODE_BY_FEDERAL_PREFIX: Readonly<Record<string, ProvinceCode>> = { "59": "BC", "48": "AB", "35": "ON", "24": "QC" };

/* Section A: land with no data. */

export type UnmappedProvince = Readonly<{
  id: ProvinceSpanId;
  code: ProvinceCode;
  name: Readonly<{ en: string; fr: string }>;
  /** The figure Methods states, read from the same research receipt. */
  unmappedHectares: number;
  /** The unmapped part as a share of the whole province on the grid. */
  unmappedSharePercent: number;
  reason: Readonly<{ en: string; fr: string }>;
}>;

export type UnmappedLand = Readonly<{ totalHectares: number; provinces: readonly UnmappedProvince[] }>;

export function unmappedLand(): UnmappedLand {
  const gap = gapReceipt.findings.gap;
  const names = new Map(provinceSpanDisplayRows({ fromYear: EXPLORE_DEFAULT_YEAR - 1, toYear: EXPLORE_DEFAULT_YEAR }).map((row) => [row.id, row.name]));
  const provinces = PROVINCE_SPANS.map((province) => {
    const code = province.code;
    const unmappedHectares = gap.provinceHectares[code];
    // The receipt and the released spans count the same cells; if they ever
    // disagree, one of them changed and the page must not choose between them.
    if (typeof unmappedHectares !== "number" || Math.abs(unmappedHectares - province.unmappedCells * CELL_HECTARES) > 0.01) {
      throw new Error(`${code}: the unmapped area in the research receipt and the province release disagree.`);
    }
    const name = names.get(province.id);
    if (!name) throw new Error(`${code}: no display name.`);
    return {
      id: province.id,
      code,
      name,
      unmappedHectares,
      unmappedSharePercent: (province.unmappedCells / province.cells) * 100,
      reason: UNMAPPED_REASONS[province.id],
    };
  });
  const sum = provinces.reduce((total, row) => total + row.unmappedHectares, 0);
  if (Math.abs(sum - gap.totalHectares) > 0.01) throw new Error("The four provinces do not add up to the receipt's total.");
  return {
    totalHectares: gap.totalHectares,
    provinces: [...provinces].sort((a, b) => PROVINCE_ORDER.indexOf(a.code) - PROVINCE_ORDER.indexOf(b.code)),
  };
}

/* Section B: figures withheld. */

export type WithheldReasonClass = "licence" | "coverage" | "floor" | "too-recent" | "not-mapped";
export type WithheldView = "official-harvest-comparison" | "compare" | "explore-provincial-ridings" | "condition-recovery";

export type WithheldRow = Readonly<{
  id: string;
  view: WithheldView;
  reasonClass: WithheldReasonClass;
  /** Every withheld item, by a key the view itself uses. Its length is the count shown. */
  items: readonly string[];
  /** Counts per province, where the items belong to provinces. */
  byProvince?: Readonly<Record<ProvinceCode, number>>;
  /** First and last year of the withheld items, where they are years. */
  years?: Readonly<{ from: number; to: number }>;
  /** Names of the withheld places, where the view names them. */
  names?: readonly Readonly<{ en: string; fr: string }>[];
  href: Readonly<{ en: string; fr: string }>;
}>;

const byProvince = (codes: readonly ProvinceCode[]) =>
  Object.fromEntries(PROVINCE_ORDER.map((code) => [code, codes.filter((item) => item === code).length])) as Record<ProvinceCode, number>;

type ComparisonRow = Readonly<{ province: string; fromYear: number; toYear: number; joinKey: string; comparisonStatus: string; withholdReason: string | null; referenceHectaresNominal: number | null; referenceHectaresExact?: string | null }>;

/** The rows the official comparison prints as "Not published": neither a rounded official value nor an NFD value. */
export function withheldHarvestComparisonRows(rows: readonly ComparisonRow[] = harvestComparison.rows as readonly ComparisonRow[]) {
  return rows.filter((row) => row.comparisonStatus !== "computed-rounded-reference" && row.comparisonStatus !== "computed-nfd-reference");
}

const EXPLORE_SPAN = { fromYear: EXPLORE_DEFAULT_YEAR - 1, toYear: EXPLORE_DEFAULT_YEAR } as const;
const exploreRoute = (locale: "en" | "fr") => (locale === "en" ? "/en/explore" : "/fr/explorer");

export function withheldFigures(release: ConditionRecoveryRelease | null = CONDITION_RECOVERY): readonly WithheldRow[] {
  const rows: WithheldRow[] = [];

  // Licence: the official harvest comparison.
  const licensed = withheldHarvestComparisonRows();
  if (licensed.some((row) => !row.withholdReason)) throw new Error("A withheld comparison row does not say why.");
  rows.push({
    id: "licence-official-harvest-comparison",
    view: "official-harvest-comparison",
    reasonClass: "licence",
    items: licensed.map((row) => row.joinKey),
    byProvince: byProvince(licensed.map((row) => row.province as ProvinceCode)),
    years: { from: Math.min(...licensed.map((row) => row.fromYear)), to: Math.max(...licensed.map((row) => row.toYear)) },
    href: { en: "/en/data/official-harvest-comparison", fr: "/fr/donnees/comparaison-recolte-officielle" },
  });

  // Coverage and floor: the federal riding comparison.
  const federal = federalRidingComparison.comparisonRows;
  const unranked = rankRidings(federal).unranked;
  const federalProvince = (id: string) => {
    const code = CODE_BY_FEDERAL_PREFIX[id.slice("federal-".length, "federal-".length + 2)];
    if (!code) throw new Error(`${id} is outside the four provinces.`);
    return code;
  };
  const incomplete = unranked.filter((row) => row.measurementCoverage !== "complete");
  const belowFloor = unranked.filter((row) => row.measurementCoverage === "complete" && row.forestedHectares < MINIMUM_RANKED_FOREST_HECTARES);
  if (incomplete.length + belowFloor.length !== unranked.length) throw new Error("An unranked riding has no recorded reason.");
  const compareHref = { en: "/en/compare", fr: "/fr/comparer" };
  rows.push({
    id: "coverage-compare-federal",
    view: "compare",
    reasonClass: "coverage",
    items: incomplete.map((row) => row.id),
    byProvince: byProvince(incomplete.map((row) => federalProvince(row.id))),
    href: compareHref,
  });

  // Coverage: provincial ridings on the Explore map at its opening span.
  const provincial = ridingIntervalMeasurements(EXPLORE_SPAN).filter((row) => row.jurisdiction !== "CA" && row.observedLossPercent === null);
  rows.push({
    id: "coverage-explore-provincial",
    view: "explore-provincial-ridings",
    reasonClass: "coverage",
    items: provincial.map((row) => row.boundaryId),
    byProvince: byProvince(provincial.map((row) => row.jurisdiction as ProvinceCode)),
    years: { from: EXPLORE_SPAN.fromYear, to: EXPLORE_SPAN.toYear },
    href: {
      en: `${exploreRoute("en")}${exploreHref({ mode: "forest-change", presentation: "map", data: "chart", year: EXPLORE_SPAN.toYear, overlays: ["provincial-ridings"] })}`,
      fr: `${exploreRoute("fr")}${exploreHref({ mode: "forest-change", presentation: "map", data: "chart", year: EXPLORE_SPAN.toYear, overlays: ["provincial-ridings"] })}`,
    },
  });

  rows.push({
    id: "floor-compare-federal",
    view: "compare",
    reasonClass: "floor",
    items: belowFloor.map((row) => row.id),
    byProvince: byProvince(belowFloor.map((row) => federalProvince(row.id))),
    href: compareHref,
  });

  // Condition and recovery.
  const recovery = conditionRecoveryMeasurements(release);
  if (recovery.length) {
    const recoveryHref = {
      en: `${exploreRoute("en")}${exploreHref({ mode: "condition-recovery", presentation: "map", data: "table", year: EXPLORE_DEFAULT_YEAR })}`,
      fr: `${exploreRoute("fr")}${exploreHref({ mode: "condition-recovery", presentation: "map", data: "table", year: EXPLORE_DEFAULT_YEAR })}`,
    };
    // Only what the view prints as withheld: the four-province decade and cause
    // tables, and the headline share of any mapped province or region.
    const four = recovery.find((row) => row.kind === "four-provinces");
    if (!four) throw new Error("The recovery release has no four-province row.");
    const floorItems = [
      ...recovery.filter((row) => row.mapped && (row.belowFloor || row.latestRecoveredPercent === null)).map((row) => row.id),
      ...four.decades.filter((decade) => decade.recoveredPercent === null).map((decade) => decade.decade),
      ...four.causes.filter((cause) => cause.recoveredPercent === null).map((cause) => cause.cause),
    ];
    rows.push({ id: "floor-condition-recovery", view: "condition-recovery", reasonClass: "floor", items: floorItems, href: recoveryHref });

    const latestDecade = four.decades.at(-1);
    if (!latestDecade?.note) throw new Error("The latest recovery decade carries no note.");
    const [from, to] = latestDecade.decade.split("-").map(Number);
    rows.push({ id: "too-recent-condition-recovery", view: "condition-recovery", reasonClass: "too-recent", items: [latestDecade.decade], years: { from, to }, href: recoveryHref });

    const unmapped = recovery.filter((row) => !row.mapped);
    rows.push({
      id: "not-mapped-condition-recovery",
      view: "condition-recovery",
      reasonClass: "not-mapped",
      items: unmapped.map((row) => row.id),
      names: unmapped.map((row) => ({ en: row.name.en.replace(/--/g, "–"), fr: row.name.fr.replace(/--/g, "–") })),
      href: recoveryHref,
    });
  }
  return rows;
}

/** The note the condition-and-recovery view prints beside its latest decade. */
export function tooRecentNote(release: ConditionRecoveryRelease | null = CONDITION_RECOVERY) {
  return release?.fourProvinces.decades.at(-1)?.note ?? null;
}
