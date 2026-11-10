import { formatHectares, formatPercent, type Locale } from "@/lib/domain";
import { formatUnknownSharePercent } from "@/lib/explore/map-style";
import type { WholeRecordFigures } from "./figures";

/**
 * The one plain sentence a place page opens with, built from the figures the
 * page already shows. It states the case the record supports, in the same
 * breath as the number: a share only when the whole forest was mapped, a
 * minimum when part of it has no satellite data, and Unknown with its reason
 * when there is no figure. It never prints a share the record does not support.
 */

/** Everyday words for a share, used only when the share is close to one of them. */
const FRACTIONS = [
  { value: 10, en: "a tenth", fr: "un dixième" },
  { value: 20, en: "a fifth", fr: "un cinquième" },
  { value: 25, en: "a quarter", fr: "un quart" },
  { value: 100 / 3, en: "a third", fr: "un tiers" },
  { value: 50, en: "half", fr: "la moitié" },
] as const;

/**
 * "About a quarter", or null unless the share is within two percentage points
 * (and a tenth of the fraction itself) of an everyday fraction.
 */
export function fractionWords(sharePercent: number, locale: Locale): string | null {
  const near = FRACTIONS.find((fraction) => Math.abs(sharePercent - fraction.value) <= Math.min(2, fraction.value / 10));
  if (!near) return null;
  return locale === "en" ? `About ${near.en}` : `Environ ${near.fr}`;
}

export function placeLeadSentence(figures: WholeRecordFigures, name: string, locale: Locale): string {
  const known = formatHectares(figures.knownForestHectares, locale);
  const gap = figures.unknownSharePercent === null ? null : formatUnknownSharePercent(figures.unknownSharePercent, locale);

  if (figures.lost.kind === "unknown") {
    return locale === "en"
      ? `Forest loss in ${name} from 1984 to 2022 is Unknown. ${figures.lost.reason.en}`
      : `La perte de forêt de 1984 à 2022 à l’intérieur de cette limite est inconnue. ${figures.lost.reason.fr}`;
  }

  const lost = formatHectares(figures.lost.value, locale);
  if (figures.lostIsMinimum || figures.share.kind !== "figure") {
    // Part of the forest has no satellite data: the hectares are a minimum and
    // the share is Unknown, and the sentence says both.
    return locale === "en"
      ? `Satellites detected loss on at least ${lost} of forest in ${name} from 1984 to 2022. That is a minimum: ${gap} of its forest has no satellite data, so the share lost is Unknown.`
      : `Les satellites ont détecté une perte sur au moins ${lost} de forêt de 1984 à 2022 à l’intérieur de cette limite. C’est un minimum\u202F: ${gap} de sa forêt n’a aucune donnée satellitaire\u202F; la part perdue est donc inconnue.`;
  }

  const share = figures.share.value;
  // An admitted unmapped share (under 1% for ridings and regions) is left out
  // of the share, and the sentence says so.
  const admitted = figures.admittedUnknownPercent === undefined
    ? ""
    : locale === "en"
      ? ` The share leaves out ${formatUnknownSharePercent(figures.admittedUnknownPercent, "en")} of its forest, which has no satellite data.`
      : ` La part laisse de côté ${formatUnknownSharePercent(figures.admittedUnknownPercent, "fr")} de sa forêt, qui n’a aucune donnée satellitaire.`;

  if (figures.lost.value === 0) {
    return locale === "en"
      ? `Satellites detected no forest loss in ${name} from 1984 to 2022, across ${known} of forest mapped in 1984.${admitted}`
      : `Les satellites n’ont détecté aucune perte de forêt de 1984 à 2022 à l’intérieur de cette limite, sur ${known} de forêt cartographiée en 1984.${admitted}`;
  }

  const percent = formatPercent(share, locale);
  const words = fractionWords(share, locale);
  const opening = words ? `${words} (${percent})` : percent;
  return locale === "en"
    ? `${opening} of the forest mapped in ${name} in 1984 was detected as lost at least once by 2022: ${lost} of ${known}.${admitted}`
    : `${opening} de la forêt cartographiée en 1984 à l’intérieur de cette limite a été détectée comme perdue au moins une fois d’ici 2022\u202F: ${lost} sur ${known}.${admitted}`;
}
