import { formatHectares, formatNumber, formatPercent, type Locale } from "@/lib/domain";
import { ridingsByWholeRecordLoss, WHOLE_RECORD_RANK_FLOOR_HECTARES, type WholeRecordRidingRank } from "@/lib/search/site-search";

/*
 * The ridings where the largest share of forest was detected as lost over the
 * whole record. The figures were already on the site, but only a reader who
 * searched for a riding by name ever saw them. Each entry opens that riding's
 * search result, which carries the same 1984 to 2022 figure; Compare is not
 * the target, because it reads 2021 to 2022.
 */

const LIMIT = 5;

const COPY = {
  en: {
    heading: "Ridings with the largest share of forest lost, 1984–2022",
    lead: (floor: string) => `The share of each riding’s mapped forest detected as lost at least once from 1984 to 2022. Only ridings mapped in full, with at least ${floor} of forest, are ranked; the rest are left out, never counted as zero.`,
    federal: "Federal ridings",
    provincial: "Provincial ridings",
    search: "/en/search",
    lost: "lost",
    note: "A share can be high because of harvest, fire or both; a satellite can’t tell why trees are gone. Detected loss is a minimum.",
  },
  fr: {
    heading: "Circonscriptions ayant perdu la plus grande part de leur forêt, 1984–2022",
    lead: (floor: string) => `La part de la forêt cartographiée de chaque circonscription détectée comme perdue au moins une fois de 1984 à 2022. Seules les circonscriptions entièrement cartographiées, avec au moins ${floor} de forêt, sont classées; les autres sont exclues, jamais comptées comme zéro.`,
    federal: "Circonscriptions fédérales",
    provincial: "Circonscriptions provinciales",
    search: "/fr/recherche",
    lost: "perdus",
    note: "Une part peut être élevée à cause de la récolte, du feu ou des deux; un satellite ne peut pas dire pourquoi les arbres ont disparu. La perte détectée est un minimum.",
  },
} as const;

function RankList({ rows, locale, label }: { rows: readonly WholeRecordRidingRank[]; locale: Locale; label: string }) {
  const copy = COPY[locale];
  return (
    <article className="card ridings-most-lost-card">
      <h3>{label}</h3>
      <ol className="ridings-most-lost-list">
        {rows.map((row) => (
          <li key={row.id}>
            <a href={`${copy.search}?q=${encodeURIComponent(row.name[locale])}`}>{row.name[locale]}</a>
            <span className="ridings-most-lost-figure">
              <span className="mark-glyph mark-glyph--satellite" aria-hidden="true" />
              {row.province} · {formatPercent(row.lossPercent, locale)} · {formatHectares(row.lossHectares, locale, 0)} {copy.lost}
            </span>
          </li>
        ))}
      </ol>
    </article>
  );
}

export function RidingsMostLost({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const federal = ridingsByWholeRecordLoss("federal", LIMIT);
  const provincial = ridingsByWholeRecordLoss("provincial", LIMIT);
  if (federal.length === 0 && provincial.length === 0) return null;
  const floor = `${formatNumber(WHOLE_RECORD_RANK_FLOOR_HECTARES, locale, 0)} ha`;
  return (
    <section className="content-section" id="ridings-most-lost" aria-labelledby="ridings-most-lost-heading">
      <h2 id="ridings-most-lost-heading">{copy.heading}</h2>
      <p className="lead">{copy.lead(floor)}</p>
      <div className="ridings-most-lost-grid">
        {federal.length ? <RankList rows={federal} locale={locale} label={copy.federal} /> : null}
        {provincial.length ? <RankList rows={provincial} locale={locale} label={copy.provincial} /> : null}
      </div>
      <p><small>{copy.note}</small></p>
    </section>
  );
}
