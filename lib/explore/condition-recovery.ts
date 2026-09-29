import releaseRecord from "@/data/phase4-condition-recovery-explore.json";
import type { CoverageGrade } from "../domain/coverage";
import { COVERAGE_GRADES } from "../domain/coverage";
import { CELL_HECTARES } from "../domain/loss-vocabulary";

/*
 * Condition and recovery: of the tree cover lost since 1984, how much was treed
 * again for three years in a row, by province and by economic region.
 *
 * The figures are built and checked, but the product is not admitted. The WP3
 * determination (docs/FALL_DOWN_WP3_CONDITION_RECOVERY_DETERMINATION.md) keeps
 * the mode empty until admission and owner review happen as real events, so
 * this module fails closed: until the release says both, every export here is
 * empty and the view keeps its empty-state strings.
 */

export const CONDITION_RECOVERY_DECADES = ["1985-1994", "1995-2004", "2005-2014", "2015-2022"] as const;
export const CONDITION_RECOVERY_CAUSES = ["notRecorded", "fire", "harvest", "fireAndHarvest"] as const;

export type ConditionRecoveryDecade = (typeof CONDITION_RECOVERY_DECADES)[number];
export type ConditionRecoveryCause = (typeof CONDITION_RECOVERY_CAUSES)[number];
type Localized = Readonly<{ en: string; fr: string }>;

type ReleaseRow = Readonly<{
  id: string;
  kind: "four-provinces" | "province" | "region";
  code?: "BC" | "AB" | "ON" | "QC";
  provinceId?: string;
  name: Localized;
  coverageGrade: CoverageGrade;
  maskCells: number;
  unknownCells: number;
  knownCells: number;
  everTreedCells: number;
  lostCells: number;
  belowFloor: boolean;
  latestRecoveredCells: number | null;
  anyRecoveredCells: number | null;
  unconfirmedCells: number | null;
  decades: readonly Readonly<{
    decade: ConditionRecoveryDecade;
    coverageGrade: CoverageGrade;
    note: Localized | null;
    lostCells: number;
    belowFloor: boolean;
    recoveredCells: number | null;
    unconfirmedCells: number | null;
  }>[];
  causes: readonly Readonly<{ cause: ConditionRecoveryCause; lostCells: number; belowFloor: boolean; recoveredCells: number | null }>[];
  treedWetlandCells?: number;
  setBEverTreedCells?: number;
}>;

type Release = Readonly<{
  schema: string;
  claims: Readonly<{ admitted: boolean; ownerReviewed: boolean }>;
  set: string;
  cellHectares: number;
  minimumLostHectares: number;
  resultsAgreement: Readonly<{ agreement: number; target: number; targetMet: boolean; note: Localized }>;
  fourProvinces: ReleaseRow;
  provinces: readonly ReleaseRow[];
  regions: readonly ReleaseRow[];
}>;

export type ConditionRecoveryRelease = Readonly<{
  resultsAgreement: Release["resultsAgreement"];
  minimumLostHectares: number;
  fourProvinces: ReleaseRow;
  provinces: readonly ReleaseRow[];
  regions: readonly ReleaseRow[];
}>;

function validRow(row: ReleaseRow): boolean {
  const counts = [row.maskCells, row.unknownCells, row.knownCells, row.everTreedCells, row.lostCells];
  if (!counts.every((n) => Number.isInteger(n) && n >= 0)) return false;
  if (row.unknownCells + row.knownCells !== row.maskCells || row.lostCells > row.everTreedCells) return false;
  if (!COVERAGE_GRADES.includes(row.coverageGrade)) return false;
  const floor = row.lostCells * CELL_HECTARES < 500;
  if (row.belowFloor !== floor || (row.latestRecoveredCells === null) !== floor) return false;
  if (row.latestRecoveredCells !== null && (row.anyRecoveredCells === null || row.latestRecoveredCells > row.anyRecoveredCells || row.anyRecoveredCells > row.lostCells)) return false;
  if (row.decades.map((d) => d.decade).join() !== CONDITION_RECOVERY_DECADES.join()) return false;
  if (row.causes.map((c) => c.cause).join() !== CONDITION_RECOVERY_CAUSES.join()) return false;
  if (row.decades.reduce((sum, d) => sum + d.lostCells, 0) !== row.lostCells) return false;
  return row.causes.reduce((sum, c) => sum + c.lostCells, 0) === row.lostCells;
}

/**
 * Fails closed. Returns null for a release that is not admitted and owner
 * reviewed, and throws for one that claims to be but cannot be read correctly.
 */
export function parseConditionRecoveryRelease(value: unknown): ConditionRecoveryRelease | null {
  const release = value as Release;
  if (release?.schema !== "witness-tree/phase4-condition-recovery-explore/1") return null;
  if (release.claims?.admitted !== true || release.claims?.ownerReviewed !== true) return null;
  if (
    release.set !== "A" ||
    release.cellHectares !== CELL_HECTARES ||
    release.minimumLostHectares !== 500 ||
    release.provinces?.length !== 4 ||
    release.regions?.length !== 44 ||
    ![release.fourProvinces, ...release.provinces, ...release.regions].every(validRow)
  ) {
    throw new Error("The condition and recovery release has an invalid envelope.");
  }
  return {
    resultsAgreement: release.resultsAgreement,
    minimumLostHectares: release.minimumLostHectares,
    fourProvinces: release.fourProvinces,
    provinces: release.provinces,
    regions: release.regions,
  };
}

export const CONDITION_RECOVERY = parseConditionRecoveryRelease(releaseRecord);

const share = (part: number | null, whole: number) => (part === null || whole === 0 ? null : (part / whole) * 100);

/** One row as the view shows it. A null share is withheld under the 500 ha floor, never zero. */
export type ConditionRecoveryMeasurement = Readonly<{
  id: string;
  kind: ReleaseRow["kind"];
  provinceId: string | null;
  name: Localized;
  coverageGrade: CoverageGrade;
  lostHectares: number;
  unknownHectares: number;
  /** Unknown as a share of the whole row. Never folded into a recovery share. */
  unknownSharePercent: number;
  belowFloor: boolean;
  /** The headline: treed again for three years after the latest loss. */
  latestRecoveredPercent: number | null;
  /** Beside it: treed again after any loss. */
  anyRecoveredPercent: number | null;
  /** Not recovered, and the three treed years could not be confirmed before 2022. */
  unconfirmedPercent: number | null;
  /** Treed wetland left out of the headline, as a share of treed land with it. Provinces only. */
  treedWetlandSharePercent: number | null;
  decades: readonly Readonly<{
    decade: ConditionRecoveryDecade;
    coverageGrade: CoverageGrade;
    note: Localized | null;
    lostHectares: number;
    recoveredPercent: number | null;
  }>[];
  causes: readonly Readonly<{
    cause: ConditionRecoveryCause;
    lostHectares: number;
    shareOfLostPercent: number;
    recoveredPercent: number | null;
  }>[];
}>;

export function conditionRecoveryMeasurement(row: ReleaseRow): ConditionRecoveryMeasurement {
  return {
    id: row.id,
    kind: row.kind,
    provinceId: row.kind === "province" ? row.id : row.provinceId ?? null,
    name: row.name,
    coverageGrade: row.coverageGrade,
    lostHectares: row.lostCells * CELL_HECTARES,
    unknownHectares: row.unknownCells * CELL_HECTARES,
    unknownSharePercent: (row.unknownCells / row.maskCells) * 100,
    belowFloor: row.belowFloor,
    latestRecoveredPercent: share(row.latestRecoveredCells, row.lostCells),
    anyRecoveredPercent: share(row.anyRecoveredCells, row.lostCells),
    unconfirmedPercent: share(row.unconfirmedCells, row.lostCells),
    treedWetlandSharePercent:
      row.treedWetlandCells === undefined || !row.setBEverTreedCells ? null : share(row.treedWetlandCells, row.setBEverTreedCells),
    decades: row.decades.map((d) => ({
      decade: d.decade,
      coverageGrade: d.coverageGrade,
      note: d.note,
      lostHectares: d.lostCells * CELL_HECTARES,
      recoveredPercent: share(d.recoveredCells, d.lostCells),
    })),
    causes: row.causes.map((c) => ({
      cause: c.cause,
      lostHectares: c.lostCells * CELL_HECTARES,
      shareOfLostPercent: row.lostCells ? (c.lostCells / row.lostCells) * 100 : 0,
      recoveredPercent: share(c.recoveredCells, c.lostCells),
    })),
  };
}

/** Every row the mode would show, or none at all while the product is not admitted. */
export function conditionRecoveryMeasurements(
  release: ConditionRecoveryRelease | null = CONDITION_RECOVERY,
): readonly ConditionRecoveryMeasurement[] {
  if (!release) return [];
  return [release.fourProvinces, ...release.provinces, ...release.regions].map(conditionRecoveryMeasurement);
}
