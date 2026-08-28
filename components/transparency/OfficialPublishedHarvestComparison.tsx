/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The horizontally scrollable table region must be keyboard-focusable. */
import type { Locale } from "@/lib/domain";

type SourceFlags = Readonly<{ preliminary: boolean; revised: boolean; agencyEstimated: boolean }>;
type OfficialPublishedHarvestRow = Readonly<{
  province: string;
  fromYear: number;
  toYear: number;
  witnessTreeObservedForestLossHectares: number;
  strictNfdExactTotalHectares: null;
  referenceHectaresNominal: number | null;
  referenceRoundingHalfWidthHectares: number | null;
  referenceSourceFlags: SourceFlags | null;
  comparisonStatus: string;
  nominalSignedDifferenceHectares: number | null;
  nominalRelativeDifference: number | null;
  withholdReason: string | null;
}>;

const COPY = {
  en: {
    eyebrow: "Phase 2 technical preview",
    title: "Official-source harvest comparison",
    lead: "A separate descriptive comparison between Witness Tree observed forest loss and official published harvest statistics.",
    scopeTitle: "Read these columns as different measurements",
    scope: "Witness Tree measures observed forest loss. Statistics Canada reports forest area harvested across provincial, private and federal land. These quantities are not like-for-like and the difference is not an accuracy score or a causal claim.",
    rounding: "The 104 available reference values were published as whole square kilometres. Their hectare values are nominal conversions with a ±50 ha rounding range, not exact NFD totals.",
    withheld: "Fourteen later reference values are not published here because their repository states personal use only and all rights reserved. They remain unknown, never zero.",
    gate: "This harvest-only track does not complete the formal Phase 2 independent-comparison gate.",
    all: "All provinces",
    province: "Province",
    interval: "Annual interval",
    witness: "Observed forest loss (ha)",
    reference: "Reported harvest, nominal (ha)",
    difference: "Nominal difference (ha)",
    relative: "Nominal relative difference",
    status: "Reference status",
    rounded: "Rounded official value, ±50 ha",
    notPublished: "Not published",
    restrictedDetail: "Later source value withheld under the repository terms.",
    preliminary: "preliminary",
    revised: "revised",
    agency: "agency estimate",
    none: "no additional source flag",
    caption: "Official-source harvest comparison rows",
    source: "Source and attribution",
    attribution: "Adapted from Statistics Canada, Table 2.10 Forest area harvested by province and territory, 1975 to 2015, 2018. This does not constitute an endorsement by Statistics Canada of this product.",
  },
  fr: {
    eyebrow: "Aperçu technique de la phase 2",
    title: "Comparaison avec une source officielle sur la récolte",
    lead: "Une comparaison descriptive distincte entre la perte de forêt observée par Witness Tree et les statistiques officielles publiées sur la récolte.",
    scopeTitle: "Lire ces colonnes comme des mesures différentes",
    scope: "Witness Tree mesure la perte de forêt observée. Statistique Canada présente la superficie forestière récoltée sur les terres provinciales, privées et fédérales. Ces quantités ne sont pas directement comparables et l’écart n’est ni une mesure d’exactitude ni une affirmation causale.",
    rounding: "Les 104 valeurs de référence disponibles ont été publiées en kilomètres carrés entiers. Les valeurs en hectares sont des conversions nominales assorties d’une plage d’arrondissement de ±50 ha, et non des totaux exacts de la BDNF.",
    withheld: "Quatorze valeurs de référence plus récentes ne sont pas publiées ici, car leur dépôt indique un usage personnel seulement et tous droits réservés. Elles demeurent inconnues, jamais zéro.",
    gate: "Ce volet sur la récolte ne satisfait pas à lui seul le critère formel de comparaison indépendante de la phase 2.",
    all: "Toutes les provinces",
    province: "Province",
    interval: "Intervalle annuel",
    witness: "Perte de forêt observée (ha)",
    reference: "Récolte déclarée, valeur nominale (ha)",
    difference: "Écart nominal (ha)",
    relative: "Écart relatif nominal",
    status: "État de la référence",
    rounded: "Valeur officielle arrondie, ±50 ha",
    notPublished: "Non publiée",
    restrictedDetail: "Valeur plus récente retenue selon les conditions du dépôt.",
    preliminary: "provisoire",
    revised: "révisée",
    agency: "estimation de l’organisme",
    none: "aucun indicateur supplémentaire",
    caption: "Lignes de comparaison avec une source officielle sur la récolte",
    source: "Source et attribution",
    attribution: "Adapté de Statistique Canada, tableau 2.10, Superficie forestière récoltée selon la province et le territoire, 1975 à 2015, 2018. Cela ne constitue pas une approbation de ce produit par Statistique Canada.",
  },
} as const;

const PROVINCES = ["BC", "AB", "ON", "QC"] as const;

function number(value: number | null, locale: Locale, maximumFractionDigits = 2) {
  if (value === null) return null;
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits }).format(value);
}

function flags(value: SourceFlags | null, locale: Locale) {
  if (!value) return null;
  const text = COPY[locale];
  const labels = [value.preliminary ? text.preliminary : null, value.revised ? text.revised : null, value.agencyEstimated ? text.agency : null].filter(Boolean);
  return labels.length ? labels.join(", ") : text.none;
}

export function OfficialPublishedHarvestComparison({ rows, locale, province }: Readonly<{ rows: readonly OfficialPublishedHarvestRow[]; locale: Locale; province?: string }>) {
  const text = COPY[locale];
  const selectedProvince = PROVINCES.includes(province as typeof PROVINCES[number]) ? province : null;
  const visible = selectedProvince ? rows.filter((row) => row.province === selectedProvince) : rows;
  const base = locale === "en" ? "/en/data/official-harvest-comparison" : "/fr/donnees/comparaison-recolte-officielle";
  return <main id="main" className="page-wrap">
    <header className="masthead prose-measure"><p className="eyebrow">{text.eyebrow}</p><h1>{text.title}</h1><p className="dek">{text.lead}</p></header>
    <section className="content-section prose-measure"><h2>{text.scopeTitle}</h2><p>{text.scope}</p><p>{text.rounding}</p><p>{text.withheld}</p><p><strong>{text.gate}</strong></p></section>
    <section className="content-section">
      <nav aria-label={text.province} className="comparison-filters"><a href={base} aria-current={selectedProvince === null ? "page" : undefined}>{text.all}</a>{PROVINCES.map((item) => <a key={item} href={`${base}?province=${item}`} aria-current={selectedProvince === item ? "page" : undefined}>{item}</a>)}</nav>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={text.caption}><table><caption>{text.caption}{selectedProvince ? `: ${selectedProvince}` : ""}</caption><thead><tr><th scope="col">{text.province}</th><th scope="col">{text.interval}</th><th scope="col">{text.witness}</th><th scope="col">{text.reference}</th><th scope="col">{text.difference}</th><th scope="col">{text.relative}</th><th scope="col">{text.status}</th></tr></thead><tbody>{visible.map((row) => {
        const computed = row.comparisonStatus === "computed-rounded-reference";
        return <tr key={`${row.province}:${row.toYear}`}><th scope="row">{row.province}</th><td>{row.fromYear}–{row.toYear}</td><td>{number(row.witnessTreeObservedForestLossHectares, locale)}</td><td>{computed ? number(row.referenceHectaresNominal, locale, 0) : <span className="unknown-value">{text.notPublished}</span>}</td><td>{computed ? number(row.nominalSignedDifferenceHectares, locale) : <span className="unknown-value">{text.notPublished}</span>}</td><td>{computed && row.nominalRelativeDifference !== null ? number(row.nominalRelativeDifference * 100, locale, 1) + "%" : <span className="unknown-value">{text.notPublished}</span>}</td><td>{computed ? <>{text.rounded}<br /><small>{flags(row.referenceSourceFlags, locale)}</small></> : <><strong>{text.notPublished}</strong><br /><small>{text.restrictedDetail}</small></>}</td></tr>;
      })}</tbody></table></div>
    </section>
    <section className="content-section prose-measure"><h2>{text.source}</h2><p>{text.attribution}</p><p><a href={locale === "en" ? "https://www150.statcan.gc.ca/n1/pub/16-201-x/2018001/sec-2/tbl/tbl-2.10-eng.htm" : "https://www150.statcan.gc.ca/n1/pub/16-201-x/2018001/sec-2/tbl/tbl-2.10-fra.htm"}>{locale === "en" ? "Open Statistics Canada Table 2.10" : "Ouvrir le tableau 2.10 de Statistique Canada"}</a></p></section>
  </main>;
}
