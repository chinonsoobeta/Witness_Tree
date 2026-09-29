import table from "@/data/phase4-provincial-cause-crosstab.json";

/*
 * Where the national disturbance rasters give a loss no cause, what the
 * provincial records of British Columbia and Québec say about it. The table is
 * a view of the admitted 2026-09-26 matching run
 * (data/phase4-provincial-cause-crosstab.json): each loss patch keeps the
 * national cause of each of its cells, filed under what the whole patch
 * matched provincially. Alberta and Ontario have no admitted provincial
 * records, so nothing here covers them.
 */

type CauseRow = Readonly<{ harvest: number; fire: number; none: number }>;
type OutcomeTable = Readonly<Record<string, CauseRow>>;

export type ProvincialCauseBreakdown = Readonly<{
  /** Detected loss with no national harvest or fire year, in hectares. */
  noNationalCauseHectares: number;
  /** Of that, in patches matching a provincial record of each kind. */
  harvestHectares: number;
  fireHectares: number;
  insectOrWindthrowHectares: number;
  /** Of that, with no provincial record either. */
  noRecordHectares: number;
}>;

const CELL_HECTARES = table.cellHectares;
const hectares = (cells: number) => Math.round(cells * CELL_HECTARES * 100) / 100;
const provinces = Object.values(table.byProvince) as ReadonlyArray<{ intervals: Readonly<Record<string, OutcomeTable>>; totals: OutcomeTable }>;

function breakdown(tables: readonly OutcomeTable[]): ProvincialCauseBreakdown {
  const none = (outcome: string) => tables.reduce((sum, entry) => sum + (entry[outcome]?.none ?? 0), 0);
  const harvest = none("harvest");
  const fire = none("fire");
  const other = none("insect") + none("windthrow");
  const unmatched = none("no-provincial-match");
  return {
    noNationalCauseHectares: hectares(harvest + fire + other + unmatched),
    harvestHectares: hectares(harvest),
    fireHectares: hectares(fire),
    insectOrWindthrowHectares: hectares(other),
    noRecordHectares: hectares(unmatched),
  };
}

/** British Columbia and Québec together, 1984-1985 to 2021-2022. */
export function provincialCauseWholeRecord(): ProvincialCauseBreakdown {
  return breakdown(provinces.map((province) => province.totals));
}

/** British Columbia and Québec together for one annual interval, such as "2021-2022", or null. */
export function provincialCauseForInterval(interval: string): ProvincialCauseBreakdown | null {
  const tables = provinces.map((province) => province.intervals[interval]).filter((entry): entry is OutcomeTable => entry !== undefined);
  return tables.length === provinces.length ? breakdown(tables) : null;
}

/**
 * Every interval's breakdown, keyed "1984-1985" to "2021-2022". The Explore
 * page computes this on the server and hands it to the client view, so the
 * browser receives 38 small rows rather than the whole table.
 */
export function provincialCauseByInterval(): Readonly<Record<string, ProvincialCauseBreakdown>> {
  const intervals = Object.keys(provinces[0]?.intervals ?? {}).sort();
  return Object.fromEntries(intervals.flatMap((interval) => {
    const breakdown = provincialCauseForInterval(interval);
    return breakdown ? [[interval, breakdown]] : [];
  }));
}
