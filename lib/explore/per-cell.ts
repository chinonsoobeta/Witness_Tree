import releaseRecord from "@/data/phase2-per-cell-tile-release.json";

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
 * The interval a selected year falls in. The intervals are annual and named
 * for the pair of years they span, so 1999 is shown by 1999-2000 and the last
 * year of the series falls back to the interval that ends on it.
 */
export function perCellArchiveForYear(year: number): PerCellArchive | null {
  const intervals = EXPLORE_PER_CELL_LAYER.intervals;
  if (intervals.length === 0) return null;
  return (
    intervals.find((entry) => entry.interval === `${year}-${year + 1}`) ??
    intervals.find((entry) => entry.interval === `${year - 1}-${year}`) ??
    null
  );
}

/** The source layer tippecanoe wrote inside an archive. */
export const perCellSourceLayer = (interval: string) => interval.replaceAll("-", "_");
