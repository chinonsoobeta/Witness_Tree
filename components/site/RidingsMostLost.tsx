import { formatHectares, formatNumber, formatPercent, type Locale } from "@/lib/domain";
import { formatUnknownSharePercent } from "@/lib/explore/map-style";
import { provinceSpanDisplayRows } from "@/lib/explore/province-spans";
import { CITY_RANK_FLOOR_HECTARES, citiesByWholeRecordLoss, RIDING_RANK_UNKNOWN_TOLERANCE_PERCENT, ridingsByWholeRecordLoss, WHOLE_RECORD_RANK_FLOOR_HECTARES, type WholeRecordRidingRank } from "@/lib/search/site-search";

/*
 * The ridings where the largest share of forest was detected as lost over the
 * whole record. The figures were already on the site, but only a reader who
 * searched for a riding by name ever saw them. Each entry opens that riding's
 * search result, which carries the same 1984 to 2022 figure; Compare is not
 * the target, because it reads 2021 to 2022.
 */

const LIMIT = 5;
const PROVINCES = ["BC", "AB", "ON", "QC"] as const;

const COPY = {
  en: {
    heading: "Ridings with the largest share of forest lost, 1984–2022",
    lead: (floor: string, tolerance: string) => `The share of each riding’s mapped forest detected as lost at least once from 1984 to 2022, top five in each province. Only ridings with at least ${floor} of forest, mapped in full or with less than ${tolerance} unmapped, are ranked. Where a small part is unmapped, the share is of the mapped forest and the unmapped share is shown beside it. The rest are left out, never counted as zero.`,
    federal: "Federal ridings",
    provincial: "Provincial ridings",
    search: "/en/search",
    lost: "lost",
    none: "No riding here is mapped well enough, with enough forest, to rank.",
    fewer: (count: number) => `Only ${count} ${count === 1 ? "riding is" : "ridings are"} mapped well enough, with enough forest, to rank.`,
    unmapped: "unmapped",
    reason: (where: string) => `Unmapped land here lies ${where}.`,
    note: "A share can be high because of harvest, fire or both; satellite imagery can’t tell why trees are gone.",
  },
  fr: {
    heading: "Circonscriptions ayant perdu la plus grande part de leur forêt, 1984–2022",
    lead: (floor: string, tolerance: string) => `La part de la forêt cartographiée de chaque circonscription détectée comme perdue au moins une fois de 1984 à 2022, les cinq premières de chaque province. Seules les circonscriptions ayant au moins ${floor} de forêt, entièrement cartographiées ou avec moins de ${tolerance} non cartographié, sont classées. Lorsqu’une petite partie n’est pas cartographiée, la part porte sur la forêt cartographiée et la part non cartographiée est indiquée à côté. Les autres sont exclues, jamais comptées comme zéro.`,
    federal: "Circonscriptions fédérales",
    provincial: "Circonscriptions provinciales",
    search: "/fr/recherche",
    lost: "perdus",
    none: "Aucune circonscription d’ici n’est assez cartographiée, avec assez de forêt, pour être classée.",
    fewer: (count: number) => `Seulement ${count} ${count === 1 ? "circonscription est assez cartographiée" : "circonscriptions sont assez cartographiées"}, avec assez de forêt, pour être classées.`,
    unmapped: "non cartographié",
    reason: (where: string) => `Les terres non cartographiées se trouvent ici ${where}.`,
    note: "Une part peut être élevée à cause de la récolte, du feu ou des deux\u202F; l’imagerie satellitaire ne peut pas dire pourquoi les arbres ont disparu.",
  },
} as const;

/** Full province names, as the rest of the home page spells them (Québec, not Quebec). */
const PROVINCE_ROWS = provinceSpanDisplayRows({ fromYear: 1984, toYear: 2022 });
const PROVINCE_NAMES: Readonly<Record<string, Readonly<{ en: string; fr: string }>>> = Object.fromEntries(
  PROVINCE_ROWS.map((row) => [row.code, row.name]),
);
/** Where each province's unmapped land lies, as the rest of the site says it. */
const PROVINCE_UNMAPPED: Readonly<Record<string, Readonly<{ en: string; fr: string }>>> = Object.fromEntries(
  PROVINCE_ROWS.map((row) => [row.code, row.unmappedCharacter]),
);

function RankList({ rows, locale, label, empty }: { rows: readonly WholeRecordRidingRank[]; locale: Locale; label: string; empty: string | null }) {
  const copy = COPY[locale];
  return (
    <article className="card ridings-most-lost-card">
      <h4>{label}</h4>
      {rows.length ? (
        <ol className="ridings-most-lost-list">
          {rows.map((row) => (
            <li key={row.id}>
              <a href={`${copy.search}?q=${encodeURIComponent(row.name[locale])}`}>{row.name[locale]}</a>
              <span className="ridings-most-lost-figure">
                <span className="mark-glyph mark-glyph--satellite" aria-hidden="true" />
                {formatPercent(row.lossPercent, locale)} · {formatHectares(row.lossHectares, locale, 0)} {copy.lost}
                {row.unmappedPercent === undefined ? null : ` · ${formatUnknownSharePercent(row.unmappedPercent, locale)} ${copy.unmapped}`}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {empty ? <p className="ridings-most-lost-empty"><small>{empty}</small></p> : null}
    </article>
  );
}

/** One row of four province columns, BC, AB, ON and QC from left to right. */
function ProvinceColumns({ ranks, locale, none, fewer, reason }: {
  ranks: (province: string) => readonly WholeRecordRidingRank[];
  locale: Locale;
  none: string;
  fewer: (count: number) => string;
  /** Says where the unmapped land lies, for a column cut short by it. */
  reason?: (where: string) => string;
}) {
  return (
    <div className="ridings-most-lost-grid">
      {PROVINCES.map((province) => {
        const rows = ranks(province);
        const short = rows.length === 0 ? none : rows.length < LIMIT ? fewer(rows.length) : null;
        const where = PROVINCE_UNMAPPED[province]?.[locale];
        const empty = short && reason && where ? `${short} ${reason(where)}` : short;
        return <RankList key={province} rows={rows} locale={locale} label={PROVINCE_NAMES[province]?.[locale] ?? province} empty={empty} />;
      })}
    </div>
  );
}

export function RidingsMostLost({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const floor = `${formatNumber(WHOLE_RECORD_RANK_FLOOR_HECTARES, locale, 0)} ha`;
  return (
    <section className="content-section" id="ridings-most-lost" aria-labelledby="ridings-most-lost-heading">
      <h2 id="ridings-most-lost-heading">{copy.heading}</h2>
      <p className="lead">{copy.lead(floor, formatPercent(RIDING_RANK_UNKNOWN_TOLERANCE_PERCENT, locale))}</p>
      <h3>{copy.federal}</h3>
      <ProvinceColumns ranks={(province) => ridingsByWholeRecordLoss("federal", LIMIT, province)} locale={locale} none={copy.none} fewer={copy.fewer} reason={copy.reason} />
      <h3>{copy.provincial}</h3>
      <ProvinceColumns ranks={(province) => ridingsByWholeRecordLoss("provincial", LIMIT, province)} locale={locale} none={copy.none} fewer={copy.fewer} reason={copy.reason} />
      <p><small>{copy.note}</small></p>
    </section>
  );
}

/*
 * The same ranking for cities, from each place's own 1984 to 2022 figure, the
 * one search shows. Each entry opens that city's search result.
 */

const CITY_COPY = {
  en: {
    heading: "Cities with the largest share of forest lost, 1984–2022",
    lead: (floor: string) => `The share of each city’s mapped forest detected as lost at least once from 1984 to 2022, top five in each province. A city here is a place Statistics Canada lists as a city (City, Ville or Cité). Only cities with at least ${floor} of forest are ranked.`,
    none: "No city here had enough forest to rank.",
    fewer: (count: number) => `Only ${count} ${count === 1 ? "city is" : "cities are"} mapped in full with enough forest to rank.`,
    note: "A share can be high because of harvest, fire or both. Satellite imagery can’t tell why trees are gone.",
  },
  fr: {
    heading: "Villes ayant perdu la plus grande part de leur forêt, 1984–2022",
    lead: (floor: string) => `La part de la forêt cartographiée de chaque ville détectée comme perdue au moins une fois de 1984 à 2022, les cinq premières de chaque province. Une ville est ici un lieu que Statistique Canada classe comme ville (City, Ville ou Cité). Seules les villes ayant au moins ${floor} de forêt sont classées.`,
    none: "Aucune ville d’ici n’avait assez de forêt pour être classée.",
    fewer: (count: number) => `Seulement ${count} ${count === 1 ? "ville est entièrement cartographiée" : "villes sont entièrement cartographiées"} avec assez de forêt pour être classées.`,
    note: "Une part peut être élevée à cause de la récolte, du feu ou des deux. L’imagerie satellitaire ne peut pas dire pourquoi les arbres ont disparu.",
  },
} as const;

export function CitiesMostLost({ locale }: { locale: Locale }) {
  const copy = CITY_COPY[locale];
  const floor = `${formatNumber(CITY_RANK_FLOOR_HECTARES, locale, 0)} ha`;
  return (
    <section className="content-section" id="cities-most-lost" aria-labelledby="cities-most-lost-heading">
      <h2 id="cities-most-lost-heading">{copy.heading}</h2>
      <p className="lead">{copy.lead(floor)}</p>
      <ProvinceColumns ranks={(province) => citiesByWholeRecordLoss(LIMIT, province)} locale={locale} none={copy.none} fewer={copy.fewer} />
      <p><small>{copy.note}</small></p>
    </section>
  );
}
