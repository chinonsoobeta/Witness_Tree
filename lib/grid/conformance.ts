import { localized } from "../domain/localized";
import {
  LAST_COVERED_YEAR,
  FIRST_COVERED_YEAR,
  RASTER_GRID_CRS_ID,
  RASTER_GRID_CRS_PROJ4,
} from "./types";
import type {
  CanonicalGrid,
  ChangeComparison,
  ConformantRasterYear,
  Geotransform,
  GridDeviation,
  RasterYearHeader,
} from "./types";

/**
 * The verified VLCE2 grid identity. All 39 staged years were read with GDAL 3.13.2 and
 * every one reported exactly these values; no year deviates.
 */
export const CANONICAL_GRID: CanonicalGrid = Object.freeze({
  crsId: RASTER_GRID_CRS_ID,
  crsProj4: RASTER_GRID_CRS_PROJ4,
  geotransform: Object.freeze([-2660910.524, 30.0, 0.0, 2998848.1105, 0.0, -30.0]) as Geotransform,
  width: 193936,
  height: 128340,
  pixelSizeMetres: 30,
  bandCount: 1,
  dataType: "Byte",
  noDataValue: 255,
});

export const CANONICAL_CELL_COUNT = CANONICAL_GRID.width * CANONICAL_GRID.height;

function deviation(
  year: number,
  field: GridDeviation["field"],
  expected: string,
  observed: string,
  en: string,
  fr: string,
): GridDeviation {
  return Object.freeze({ year, field, expected, observed, message: localized(en, fr) });
}

function sameGeotransform(a: Geotransform, b: Geotransform): boolean {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

/**
 * Reports the first way a year departs from the canonical grid, or `null` when it sits on
 * the grid exactly. Nothing here is approximate: a geotransform, a CRS, or a dimension
 * that differs at all is a different grid.
 */
export function describeGridDeviation(header: RasterYearHeader): GridDeviation | null {
  if (header.crsId !== CANONICAL_GRID.crsId || header.crsProj4 !== CANONICAL_GRID.crsProj4) {
    return deviation(
      header.year,
      "crs",
      CANONICAL_GRID.crsProj4,
      header.crsProj4,
      `Year ${header.year} declares a different coordinate reference system from the canonical VLCE2 grid. Years on different reference systems are not pixel aligned and cannot be compared.`,
      `L'année ${header.year} déclare un système de référence des coordonnées différent de celui de la grille VLCE2 canonique. Des années sur des systèmes différents ne sont pas alignées au pixel et ne peuvent pas être comparées.`,
    );
  }
  if (!sameGeotransform(header.geotransform, CANONICAL_GRID.geotransform)) {
    return deviation(
      header.year,
      "geotransform",
      CANONICAL_GRID.geotransform.join(", "),
      header.geotransform.join(", "),
      `Year ${header.year} has a different geotransform from the canonical VLCE2 grid. Its cells do not land on the same ground positions, so a cell-by-cell comparison would compare different places.`,
      `L'année ${header.year} possède une géotransformation différente de celle de la grille VLCE2 canonique. Ses cellules ne correspondent pas aux mêmes positions au sol; une comparaison cellule par cellule comparerait donc des lieux différents.`,
    );
  }
  if (header.width !== CANONICAL_GRID.width || header.height !== CANONICAL_GRID.height) {
    return deviation(
      header.year,
      "dimensions",
      `${CANONICAL_GRID.width} x ${CANONICAL_GRID.height}`,
      `${header.width} x ${header.height}`,
      `Year ${header.year} is ${header.width} x ${header.height} cells; the canonical VLCE2 grid is ${CANONICAL_GRID.width} x ${CANONICAL_GRID.height}. Different extents cannot be compared cell by cell.`,
      `L'année ${header.year} compte ${header.width} x ${header.height} cellules; la grille VLCE2 canonique en compte ${CANONICAL_GRID.width} x ${CANONICAL_GRID.height}. Des étendues différentes ne peuvent pas être comparées cellule par cellule.`,
    );
  }
  if (header.bandCount !== CANONICAL_GRID.bandCount || header.dataType !== CANONICAL_GRID.dataType) {
    return deviation(
      header.year,
      "band",
      `${CANONICAL_GRID.bandCount} band, ${CANONICAL_GRID.dataType}`,
      `${header.bandCount} band, ${header.dataType}`,
      `Year ${header.year} does not carry the single Byte band of the canonical VLCE2 grid.`,
      `L'année ${header.year} ne porte pas la bande unique de type Byte de la grille VLCE2 canonique.`,
    );
  }
  if (header.noDataValue !== CANONICAL_GRID.noDataValue) {
    return deviation(
      header.year,
      "nodata",
      String(CANONICAL_GRID.noDataValue),
      String(header.noDataValue),
      `Year ${header.year} declares nodata ${header.noDataValue}; the canonical VLCE2 grid uses ${CANONICAL_GRID.noDataValue}. A different nodata value would silently reclassify cells.`,
      `L'année ${header.year} déclare une valeur « sans données » de ${header.noDataValue}; la grille VLCE2 canonique utilise ${CANONICAL_GRID.noDataValue}. Une valeur différente reclasserait des cellules sans avertissement.`,
    );
  }
  if (header.resampled !== false) {
    return deviation(
      header.year,
      "resampling",
      "false",
      String(header.resampled),
      `Year ${header.year} is marked as resampled. The VLCE2 cells are categorical class codes; resampling them fabricates classes that are not in the source.`,
      `L'année ${header.year} est marquée comme rééchantillonnée. Les cellules VLCE2 sont des codes de classe catégoriels; les rééchantillonner fabrique des classes absentes de la source.`,
    );
  }
  return null;
}

/**
 * Admits a year to the canonical grid, or throws. A deviation is never downgraded to a
 * warning, and never returns a partial or zero-filled result.
 */
export function assertGridConformance(header: RasterYearHeader): ConformantRasterYear {
  if (!Number.isInteger(header.year) || header.year < FIRST_COVERED_YEAR || header.year > LAST_COVERED_YEAR) {
    throw new Error(
      `Year ${header.year} is outside the staged VLCE2 coverage of ${FIRST_COVERED_YEAR}–${LAST_COVERED_YEAR}.`,
    );
  }
  const conflict = describeGridDeviation(header);
  if (conflict) throw new Error(conflict.message.en);
  return Object.freeze({ ...header, conformsToCanonicalGrid: true });
}

/**
 * Plans a change comparison between two years.
 *
 * Both arguments are typed `ConformantRasterYear`, so a year that was never checked
 * against the canonical grid does not type-check. The runtime re-check below is the second
 * line of defence for callers crossing an untyped boundary such as parsed JSON.
 *
 * This performs no pixel work, no ingestion, and no storage, and it is never production
 * eligible.
 */
export function compareChangeBetweenYears(from: ConformantRasterYear, to: ConformantRasterYear): ChangeComparison {
  for (const side of [from, to]) {
    if (side.conformsToCanonicalGrid !== true) {
      throw new Error(`Year ${side.year} has not been checked against the canonical VLCE2 grid.`);
    }
    const conflict = describeGridDeviation(side);
    if (conflict) throw new Error(conflict.message.en);
  }
  if (from.year === to.year) throw new Error("A change comparison needs two different years.");

  return Object.freeze({
    fromYear: from.year,
    toYear: to.year,
    crsId: CANONICAL_GRID.crsId,
    width: CANONICAL_GRID.width,
    height: CANONICAL_GRID.height,
    pixelSizeMetres: CANONICAL_GRID.pixelSizeMetres,
    pixelsCompared: false,
    limitation: localized(
      "Grid identity only. Both years were verified to share the canonical grid, but no pixels have been read and no change has been computed.",
      "Identité de grille seulement. Les deux années partagent la grille canonique vérifiée, mais aucun pixel n'a été lu et aucun changement n'a été calculé.",
    ),
    productionEligible: false,
  });
}
