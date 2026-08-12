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

/** Keys that name an integer. `Object.keys` can hand back "undefined", "null", or "NaN". */
const INTEGER_KEY = /^-?\d{1,15}$/;

/**
 * A `VatSidecar` is typed, but it is read off disk, so a malformed one can carry a missing
 * or non-integer `year`, `recordCount`, or class value at runtime. Every reason below is
 * shown to the public in both languages, so no slot may ever interpolate `undefined`,
 * `null`, or `NaN`. Each helper either has a real number to name or says so in prose.
 */
function isNameableInteger(value: number): boolean {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/** The sentence subject, so the year sits in a slot that has a wording for "no year". */
function vatTableSubject(year: number): LocalizedString {
  return isNameableInteger(year)
    ? localized(`The ${year} raster attribute table`, `La table d'attributs raster de ${year}`)
    : localized(
        "The raster attribute table for an unidentified year",
        "La table d'attributs raster d'une année non identifiée",
      );
}

function emptyVatReason(year: number): LocalizedString {
  const subject = vatTableSubject(year);
  return localized(
    `${subject.en} was published empty — ${EMPTY_VAT_BYTE_LENGTH} bytes of header with 0 records, against ${POPULATED_VAT_BYTE_LENGTH} bytes and ${POPULATED_VAT_RECORD_COUNT} records in the neighbouring control years. The pixels are sound and carry all ${POPULATED_VAT_RECORD_COUNT} classes, but no class statistic can be read from this sidecar.`,
    `${subject.fr} a été publiée vide — ${EMPTY_VAT_BYTE_LENGTH} octets d'en-tête avec 0 enregistrement, contre ${POPULATED_VAT_BYTE_LENGTH} octets et ${POPULATED_VAT_RECORD_COUNT} enregistrements pour les années témoins voisines. Les pixels sont valides et portent les ${POPULATED_VAT_RECORD_COUNT} classes, mais aucune statistique de classe ne peut être lue dans ce fichier annexe.`,
  );
}

function incompleteVatReason(year: number, recordCount: number): LocalizedString {
  const subject = vatTableSubject(year);
  const held = isNameableInteger(recordCount) && recordCount >= 0
    ? localized(`holds ${recordCount} records`, `contient ${recordCount} enregistrements`)
    : localized("holds an unreadable number of records", "contient un nombre illisible d'enregistrements");
  return localized(
    `${subject.en} ${held.en}; a complete table holds ${POPULATED_VAT_RECORD_COUNT}, one per documented class. An incomplete table cannot support a class statistic.`,
    `${subject.fr} ${held.fr}; une table complète en contient ${POPULATED_VAT_RECORD_COUNT}, un par classe documentée. Une table incomplète ne peut pas fonder une statistique de classe.`,
  );
}

function missingRowReason(year: number, classValue: number): LocalizedString {
  const subject = vatTableSubject(year);
  const row = isNameableInteger(classValue)
    ? localized(`has no row for class ${classValue}`, `n'a aucune ligne pour la classe ${classValue}`)
    : localized("has no row for the requested class", "n'a aucune ligne pour la classe demandée");
  return localized(
    `${subject.en} ${row.en}. An absent row is not evidence of an absent class.`,
    `${subject.fr} ${row.fr}. Une ligne absente n'est pas la preuve d'une classe absente.`,
  );
}

function offSchemeValueReason(year: number, key: string): LocalizedString {
  const subject = vatTableSubject(year);
  return INTEGER_KEY.test(key)
    ? localized(
        `${subject.en} carries value ${key}, which is not part of the documented ${POPULATED_VAT_RECORD_COUNT}-class scheme.`,
        `${subject.fr} contient la valeur ${key}, qui ne fait pas partie du schéma documenté à ${POPULATED_VAT_RECORD_COUNT} classes.`,
      )
    : localized(
        `${subject.en} carries a key that is not an integer, so it names no class in the documented ${POPULATED_VAT_RECORD_COUNT}-class scheme.`,
        `${subject.fr} contient une clé qui n'est pas un entier; elle ne désigne donc aucune classe du schéma documenté à ${POPULATED_VAT_RECORD_COUNT} classes.`,
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
        reason: offSchemeValueReason(sidecar.year, key),
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
