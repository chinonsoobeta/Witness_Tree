import releaseRecord from "@/data/phase2-per-cell-tile-release.json";
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
 * The per-cell forest-loss layer.
 *
 * This is the detail behind the province aggregate: one polygon per connected
 * patch of detected loss, traced exactly from the 30 m grid rather than
 * generalized from it. It exists for all 38 annual intervals from 1984-1985 to
 * 2021-2022 and reconciles patch for patch against the component inventory.
 *
 * What it is not: reviewed, released, or production eligible. The owner
 * authorized building and publishing it; nobody has checked it against ground
 * truth, and the province and national loss rates the site publishes are not
 * restated from it. Below the maximum zoom the tiler generalizes and, in
 * crowded tiles, drops the smallest patches, so the layer is drawable and not
 * countable at any zoom. Nothing in the interface may total it.
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
 * it needs the annual land-cover class series, which is a separate product
 * that has never been acquired. The interface has to say which of the two
 * kinds of absence it is looking at, because "we have not wired this yet" and
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
