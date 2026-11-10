import type { ReactNode } from "react";
import Link from "next/link";
import { formatHectares, formatPercent, type Locale } from "@/lib/domain";
import { formatUnknownSharePercent, type ProvinceSpanMeasurement } from "@/lib/explore";

/*
 * The four provinces on the home page, one short entry each (audit
 * 2026-11-10, A4).
 *
 * They were a ranked list of tall rows with bars and a toggle between two
 * measures. Each entry now says the figure, its share of the forest mapped in
 * 1984, and the part of the province the source could not see, with its
 * reason. The reason is what stops a reader treating that gap as unmeasured
 * forest, so it stays on every entry. The longer gap notes are on "What the
 * record cannot see".
 *
 * The figure is exact to the hundredth of a hectare, as the record states it.
 * Rounding a minimum to the nearest hectare can round it up, and a minimum
 * rounded up is no longer a minimum.
 */

type Row = ProvinceSpanMeasurement;

const COPY = {
  en: {
    unknown: "Unknown",
    lost: (hectares: string) => `${hectares} lost at least once`,
    share: (share: string) => `${share} of its forest mapped in 1984`,
    gap: (unknownShare: string, reason: ReactNode) => <>
      A minimum. The satellite source has no data for {unknownShare} of the province, {reason}. Loss there is unknown, not zero.
    </>,
    methods: "/en/methods#coverage-gap",
  },
  fr: {
    unknown: "Inconnu",
    lost: (hectares: string) => `${hectares} perdus au moins une fois`,
    share: (share: string) => `${share} de sa forêt cartographiée en 1984`,
    gap: (unknownShare: string, reason: ReactNode) => <>
      Un minimum. La source satellitaire n’a pas de données pour {unknownShare} de la province, {reason}. Les pertes à cet endroit sont inconnues, pas nulles.
    </>,
    methods: "/fr/methodes#coverage-gap",
  },
} as const;

export function ProvinceRecordList({ rows, locale, labelledBy }: Readonly<{
  rows: readonly Row[];
  locale: Locale;
  /** The id of the heading that names the list and its years. */
  labelledBy: string;
}>) {
  const copy = COPY[locale];
  // Ranked by the figure each entry prints. A province with no figure goes last.
  const ordered = [...rows].sort((a, b) => (b.unionLossHectares ?? -Infinity) - (a.unionLossHectares ?? -Infinity));

  return (
    <ul className="home-provinces-list" aria-labelledby={labelledBy}>
      {ordered.map((row) => {
        const unknownShare = row.unknownHectares === null
          ? copy.unknown
          : formatUnknownSharePercent(row.unknownSharePercent, locale);
        return (
          <li className="home-province" key={row.id}>
            <p className="home-province-figure">
              <strong className="home-province-name">{row.name[locale]}</strong>{" "}
              <span>{row.unionLossHectares === null ? copy.unknown : copy.lost(formatHectares(row.unionLossHectares, locale))}</span>
              {row.unionLossPercent === null ? null : <>{" · "}<span>{copy.share(formatPercent(row.unionLossPercent, locale))}</span></>}
            </p>
            <p className="home-province-note">
              {copy.gap(unknownShare, <Link href={copy.methods}>{row.unmappedCharacter[locale]}</Link>)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
