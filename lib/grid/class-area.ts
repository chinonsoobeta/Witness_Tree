import { localized } from "../domain/localized";
import { LAND_COVER_CLASS_VALUES } from "./types";
import type { ClassArea, ClassList, LandCoverClassValue, VatSidecar } from "./types";
import type { LocalizedString } from "../domain/localized";

/**
 * The two years whose `.tif.vat.dbf` sidecar was published header-only: 98 bytes, zero
 * records, against 488 bytes and 13 records in every other year. Their pixels are sound
 * and carry all 13 classes; only the sidecar is empty.
 */
export const VAT_DEFECTIVE_YEARS: readonly number[] = Object.freeze([1991, 2005]);

export const POPULATED_VAT_RECORD_COUNT = 13;
export const EMPTY_VAT_BYTE_LENGTH = 98;
export const POPULATED_VAT_BYTE_LENGTH = 488;

/** 30 m x 30 m cells: 900 m², which is 0.09 hectares per cell. */
export const HECTARES_PER_CELL = 0.09;

const CLASS_VALUES: ReadonlySet<number> = new Set(LAND_COVER_CLASS_VALUES);

export function isLandCoverClassValue(value: number): value is LandCoverClassValue {
  return CLASS_VALUES.has(value);
}

function emptyVatReason(year: number): LocalizedString {
  return localized(
    `The ${year} raster attribute table was published empty — ${EMPTY_VAT_BYTE_LENGTH} bytes of header with 0 records, against ${POPULATED_VAT_BYTE_LENGTH} bytes and ${POPULATED_VAT_RECORD_COUNT} records in the neighbouring control years. The pixels are sound and carry all ${POPULATED_VAT_RECORD_COUNT} classes, but no class statistic can be read from this sidecar.`,
    `La table d'attributs raster de ${year} a été publiée vide — ${EMPTY_VAT_BYTE_LENGTH} octets d'en-tête avec 0 enregistrement, contre ${POPULATED_VAT_BYTE_LENGTH} octets et ${POPULATED_VAT_RECORD_COUNT} enregistrements pour les années témoins voisines. Les pixels sont valides et portent les ${POPULATED_VAT_RECORD_COUNT} classes, mais aucune statistique de classe ne peut être lue dans ce fichier annexe.`,
  );
}

function incompleteVatReason(year: number, recordCount: number): LocalizedString {
  return localized(
    `The ${year} raster attribute table holds ${recordCount} records; a complete table holds ${POPULATED_VAT_RECORD_COUNT}, one per documented class. An incomplete table cannot support a class statistic.`,
    `La table d'attributs raster de ${year} contient ${recordCount} enregistrements; une table complète en contient ${POPULATED_VAT_RECORD_COUNT}, un par classe documentée. Une table incomplète ne peut pas fonder une statistique de classe.`,
  );
}

function missingRowReason(year: number, classValue: number): LocalizedString {
  return localized(
    `Class ${classValue} has no row in the ${year} raster attribute table. An absent row is not evidence of an absent class.`,
    `La classe ${classValue} n'a aucune ligne dans la table d'attributs raster de ${year}. Une ligne absente n'est pas la preuve d'une classe absente.`,
  );
}

/** True when this year's sidecar cannot support any class statistic. */
export function hasEmptyVat(sidecar: VatSidecar): boolean {
  return VAT_DEFECTIVE_YEARS.includes(sidecar.year) || sidecar.recordCount === 0;
}

/**
 * Reads the class list from the `.tif.vat.dbf` sidecar.
 *
 * For 1991 and 2005 the sidecar is empty, so the result is `Unknown` with a reason. It is
 * never an empty list, because an empty list reads as "this year has no land cover
 * classes". The 13-class scheme is recorded in `data/raster-grid.json` and in
 * `LAND_COVER_CLASS_VALUES`; read it from there rather than from a sidecar.
 */
export function classListFromVat(sidecar: VatSidecar): ClassList {
  if (hasEmptyVat(sidecar)) {
    return Object.freeze({ kind: "unknown", year: sidecar.year, reason: emptyVatReason(sidecar.year) });
  }
  if (sidecar.recordCount !== POPULATED_VAT_RECORD_COUNT) {
    return Object.freeze({
      kind: "unknown",
      year: sidecar.year,
      reason: incompleteVatReason(sidecar.year, sidecar.recordCount),
    });
  }
  const values: LandCoverClassValue[] = [];
  for (const key of Object.keys(sidecar.counts)) {
    const value = Number(key);
    if (!isLandCoverClassValue(value)) {
      return Object.freeze({
        kind: "unknown",
        year: sidecar.year,
        reason: localized(
          `The ${sidecar.year} raster attribute table carries value ${key}, which is not part of the documented 13-class scheme.`,
          `La table d'attributs raster de ${sidecar.year} contient la valeur ${key}, qui ne fait pas partie du schéma documenté à 13 classes.`,
        ),
      });
    }
    values.push(value);
  }
  if (values.length !== POPULATED_VAT_RECORD_COUNT) {
    return Object.freeze({
      kind: "unknown",
      year: sidecar.year,
      reason: incompleteVatReason(sidecar.year, values.length),
    });
  }
  return Object.freeze({ kind: "known", year: sidecar.year, classValues: Object.freeze([...values]) });
}

/**
 * Reads one class area from the `.tif.vat.dbf` sidecar.
 *
 * For 1991 and 2005 this returns `Unknown` with a reason. It never returns `0`: a zero
 * here would read as "no land of that class existed in that year", which is a false public
 * claim about a year whose pixels were verified to carry all 13 classes.
 */
export function classAreaFromVat(sidecar: VatSidecar, classValue: LandCoverClassValue): ClassArea {
  if (hasEmptyVat(sidecar)) {
    return Object.freeze({ kind: "unknown", classValue, reason: emptyVatReason(sidecar.year) });
  }
  if (sidecar.recordCount !== POPULATED_VAT_RECORD_COUNT) {
    return Object.freeze({
      kind: "unknown",
      classValue,
      reason: incompleteVatReason(sidecar.year, sidecar.recordCount),
    });
  }
  const pixelCount = sidecar.counts[String(classValue)];
  if (typeof pixelCount !== "number" || !Number.isFinite(pixelCount) || pixelCount < 0) {
    return Object.freeze({ kind: "unknown", classValue, reason: missingRowReason(sidecar.year, classValue) });
  }
  return Object.freeze({ kind: "known", classValue, pixelCount, hectares: pixelCount * HECTARES_PER_CELL });
}

/**
 * Renders a class area for display. An Unknown area renders as `Unknown` with an em dash
 * and the reason it is unknown. It never renders as `0`, a blank, or a dash alone.
 */
export function formatClassArea(area: ClassArea): LocalizedString {
  if (area.kind === "unknown") {
    if (!area.reason.en.trim() || !area.reason.fr.trim()) {
      throw new Error("An unknown class area requires a reason.");
    }
    return localized(`Unknown — ${area.reason.en}`, `Inconnu — ${area.reason.fr}`);
  }
  const en = `${area.hectares.toLocaleString("en-CA")} ha`;
  const fr = `${area.hectares.toLocaleString("fr-CA")} ha`;
  return localized(en, fr);
}

/** Rejects any attempt to coerce an Unknown class area into a number. */
export function requireClassArea(area: ClassArea): number {
  if (area.kind === "unknown") {
    throw new Error(`This class area is Unknown and must not be treated as zero: ${area.reason.en}`);
  }
  return area.hectares;
}

/** Rejects any attempt to coerce an Unknown class list into an empty list. */
export function requireClassList(list: ClassList): readonly LandCoverClassValue[] {
  if (list.kind === "unknown") {
    throw new Error(`The ${list.year} class list is Unknown and must not be treated as empty: ${list.reason.en}`);
  }
  return list.classValues;
}
