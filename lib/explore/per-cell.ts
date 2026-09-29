import releaseRecord from "@/data/phase2-per-cell-four-province-tile-release.json";
import spanRecord from "@/data/phase2-per-cell-span-archive-release.json";
import type { PerCellAnnualInterval } from "./annual-series";
import type { ExploreMode } from "./types";

/** One published archive: the tiles for a single annual interval. */
export type PerCellArchive = Readonly<{
  interval: string;
  fileName: string;
  byteLength: number;
  sha256: string;
  patchCount: number;
  cellCount: number;
  harvestCells: number;
  fireCells: number;
  patchesWithBothCauses: number;
  disturbanceYearsMissing: readonly string[];
  url: string;
}>;

type PerCellRelease = Readonly<{
  schemaVersion: string;
  releaseId: string;
  base: string;
  productId: string;
  readback: string;
  minZoom: number;
  maxZoom: number;
  generalizedBelowZoom: number;
  countable: boolean;
  expertReviewed: boolean;
  productionEligible: boolean;
  intervals: readonly PerCellArchive[];
  totals: Readonly<{ intervalCount: number; byteLength: number }>;
}>;

const release = releaseRecord as PerCellRelease;

/**
 * The per-cell forest-loss layer, for British Columbia, Alberta, Ontario and
 * Québec.
 *
 * This is the detail behind the province aggregate: one polygon per connected
 * patch of detected loss, traced exactly from the 30 m grid rather than
 * generalized from it, for all 38 annual intervals from 1984-1985 to
 * 2021-2022. The national patches were cut at the four provinces' boundary, so
 * nothing is drawn outside them; in every interval the cells kept equal the
 * provinces' admitted annual loss exactly. The clipped archives have their own
 * admission record, data/phase2-per-cell-four-province-admission-record-2026-09-19.json.
 *
 * Admitted and released; not reviewed and not production eligible. Nobody has
 * checked it against ground truth. Below the maximum zoom the tiler
 * generalizes and, in crowded tiles, drops the smallest patches, so the layer
 * is drawable and not countable at any zoom. Nothing in the interface may
 * total it; the counts below come from the release record, not the tiles.
 */
export const EXPLORE_PER_CELL_LAYER = Object.freeze({
  ...release,
  sourceId: "phase2-per-cell-loss",
  attribution: {
    en: "Derived from Natural Resources Canada, Annual high-resolution forest land cover for Canada, 1984-2022. Recorded harvest and fire from Natural Resources Canada's national disturbance rasters, 1985-2022.",
    fr: "Dérivé de Ressources naturelles Canada, Couverture forestière annuelle à haute résolution pour le Canada, de 1984 à 2022. Récoltes et incendies consignés d’après les rasters nationaux de perturbations de Ressources naturelles Canada, de 1985 à 2022.",
    href: "https://open.canada.ca/data/en/dataset/ec9e2659-1c29-4ddb-87a2-6aced147a990",
  },
});

/**
 * What the per-cell layer draws for a given Explore mode.
 *
 * Every patch in the archives carries a `harvest` and a `fire` count taken
 * from the national disturbance rasters for the same interval, so the harvest
 * and wildfire modes are the same tiles filtered, not different tiles. There
 * is nothing to acquire and nothing to admit for them.
 *
 * `condition-recovery` returns null, and that is a different kind of absence:
 * recovery needs a forest class from the annual land-cover class series. That
 * series is staged on the data root, but the forest-class treatment a
 * recovery rule depends on is not admitted. See
 * docs/VLCE2_FOREST_MASK_DECISION.md and
 * docs/FALL_DOWN_WP3_CONDITION_RECOVERY_DETERMINATION.md.
 *
 * The interface has to say which of the two kinds of absence it is looking
 * at, because "we have not wired this yet" and
 * "this data does not exist here" are not the same statement to a reader.
 */
export type PerCellCause = "all" | "harvest" | "fire";

export function perCellCauseForMode(mode: ExploreMode): PerCellCause | null {
  switch (mode) {
    case "forest-change":
      return "all";
    case "recorded-harvest":
      return "harvest";
    case "wildfire":
      return "fire";
    default:
      return null;
  }
}

export function perCellArchiveForYear(year: number): PerCellArchive | null {
  return archiveForYear(EXPLORE_PER_CELL_LAYER.intervals, year);
}

const hectares = (cells: number) => Math.round(cells * 9) / 100;

/**
 * One annual interval's four-province figures, counted from the clipped cell
 * store the archives were drawn from, so the numbers beside the map describe
 * the same four provinces the map shows. A cell carries a recorded harvest or
 * a recorded fire, never both, so the two and the unattributed rest add up to
 * the interval's loss.
 */
export function fourProvinceAnnualForYear(year: number): PerCellAnnualInterval | null {
  const archive = perCellArchiveForYear(year);
  if (!archive) return null;
  const unattributedCells = archive.cellCount - archive.harvestCells - archive.fireCells;
  if (unattributedCells < 0) return null;
  return {
    interval: archive.interval,
    startYear: year - 1,
    endYear: year,
    patchCount: archive.patchCount,
    cellCount: archive.cellCount,
    hectares: hectares(archive.cellCount),
    harvestCells: archive.harvestCells,
    harvestHectares: hectares(archive.harvestCells),
    fireCells: archive.fireCells,
    fireHectares: hectares(archive.fireCells),
    unattributedCells,
    unattributedHectares: hectares(unattributedCells),
    disturbanceYearsMissing: archive.disturbanceYearsMissing,
    patchesWithBothCauses: archive.patchesWithBothCauses,
  };
}

type PerCellSpanRelease = Readonly<{
  schemaVersion: string;
  releaseId: string;
  url: string;
  sourceLayer: string;
  yearProperty: string;
  firstYear: number;
  lastYear: number;
  minZoom: number;
  maxZoom: number;
  countable: boolean;
  expertReviewed: boolean;
  productionEligible: boolean;
}>;

/**
 * The span archive: every four-province patch from all 38 intervals in one
 * layer, each tagged with the closing year of the interval it was lost in.
 * A span is a filter on that year, so moving a year handle never swaps a
 * source, and the patches drawn are every patch lost at least once in the
 * span. A place lost in two years is drawn once for each.
 */
export const EXPLORE_PER_CELL_SPAN_LAYER = Object.freeze({
  ...(spanRecord as PerCellSpanRelease),
  sourceId: "phase2-per-cell-span-loss",
});

/**
 * The closing years a span draws: after its opening year, through its closing
 * year. Null when the span reaches outside the archive, so the map never
 * labels a partial span with the years that were asked for.
 */
export function perCellSpanYears(
  fromYear: number,
  toYear: number,
): Readonly<{ after: number; through: number }> | null {
  if (!Number.isInteger(fromYear) || !Number.isInteger(toYear) || toYear <= fromYear) return null;
  if (fromYear < EXPLORE_PER_CELL_SPAN_LAYER.firstYear - 1 || toYear > EXPLORE_PER_CELL_SPAN_LAYER.lastYear) return null;
  return { after: fromYear, through: toYear };
}

/**
 * The mapping itself, separated from the published release so it can be tested
 * against a known interval list. The release is empty until the tiles are
 * built, and a test that reads it would pass vacuously in that state, which is
 * exactly the kind of green that means nothing.
 *
 * A selected year names the end of one annual interval: 1999 means change
 * between 1998 and 1999. This is the same meaning the slider announces and
 * gives the 1985–2022 control a one-to-one mapping to the 38 archives.
 */
export function archiveForYear(
  intervals: readonly PerCellArchive[],
  year: number,
): PerCellArchive | null {
  if (!Number.isInteger(year)) return null;
  return intervals.find((entry) => entry.interval === `${year - 1}-${year}`) ?? null;
}

/** The source layer tippecanoe wrote inside an archive. */
export const perCellSourceLayer = (interval: string) => interval.replaceAll("-", "_");
