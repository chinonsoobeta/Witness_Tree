import { formatNumber, type Locale } from "@/lib/domain";

type SourceFlags = Readonly<{ preliminary: boolean; revised: boolean; agencyEstimated: boolean }>;
type OfficialPublishedHarvestRow = Readonly<{
  province: string;
  fromYear: number;
  toYear: number;
  witnessTreeObservedForestLossHectares: number | null;
  witnessTreeCoverageGrade: string;
  witnessTreeUnknownRequiredInputHectares: number | null;
  strictNfdExactTotalHectares: null;
  referenceHectaresNominal: number | null;
  referenceHectaresExact?: string | null;
  referenceSourceId: string;
  referenceSourceUrl?: string | null;
  referenceRoundingHalfWidthHectares: number | null;
  referenceSourceFlags: SourceFlags | null;
  comparisonStatus: string;
  nominalSignedDifferenceHectares: number | null;
  withholdReason: string | null;
}>;

const COPY = {
  en: {
    eyebrow: "Early preview",
    title: "Official-source harvest comparison",
    lead: "Detected forest loss shown next to official harvest statistics.",
    scopeTitle: "These columns measure different things",
    scope: "Our figures are forest loss detected by satellite; Statistics Canada reports forest area harvested on provincial, private and federal land. They are not like-for-like, so the difference is not an accuracy score and doesn’t show a cause.",
    rounding: "The 104 official values were published in whole square kilometres, so their hectare figures are conversions accurate to ±50 ha, not exact totals.",
    withheld: "Fourteen later values aren’t shown, because their source allows personal use only. They stay unknown, never zero.",
    gate: "This comparison is not the independent comparison the final release needs.",
    entitlement: "Each row puts two independent measures side by side for the same year. Neither corrects the other, and neither series may be summed across intervals.",
    nfdScope: "Rows from the National Forestry Database (NFD, Table 5.2) keep the publisher’s year labels, precision and notes; matching rows by year label doesn’t prove the reporting periods are the same. Totals with missing parts, and rows where satellite coverage is incomplete, stay unknown.",
    nfdAttribution: "Contains information licensed under the Open Government Licence – Canada 2.0. Source: National Forestry Database, Canadian Council of Forest Ministers, Table 5.2. No publisher endorsement is implied.",
    nfdValue: "NFD reported hectares; source precision",
    incomplete: "Data incomplete; difference unknown",
    unavailable: "Unknown",
    coverage: "Satellite coverage",
    complete: "Complete",
    partial: "Partial",
    unknownArea: "Area with no data (ha)",
    rowSource: "Reference source",
    statcan: "Statistics Canada, Table 2.10",
    nfd: "NFD, Table 5.2; edition undeclared",
    all: "All provinces",
    province: "Province",
    interval: "Years",
    witness: "Detected forest loss (ha)",
    reference: "Reported harvest (ha)",
    difference: "Difference (ha)",
    status: "Reference status",
    rounded: "Rounded official value, ±50 ha",
    notPublished: "Not published",
    restrictedDetail: "Not shown, due to the source’s terms of use.",
    preliminary: "preliminary",
    revised: "revised",
    agency: "agency estimate",
    none: "–",
    caption: "Official-source harvest comparison rows",
    source: "Source and attribution",
    attribution: "Adapted from Statistics Canada, Table 2.10 Forest area harvested by province and territory, 1975 to 2015, 2018. This does not constitute an endorsement by Statistics Canada of this product.",
  },
  fr: {
    eyebrow: "Aperçu préliminaire",
    title: "Comparaison avec une source officielle sur la récolte",
    lead: "La perte de forêt détectée présentée à côté des statistiques officielles sur la récolte.",
    scopeTitle: "Ces colonnes mesurent des choses différentes",
    scope: "Nos chiffres sont la perte de forêt détectée par satellite; Statistique Canada présente la superficie forestière récoltée sur les terres provinciales, privées et fédérales. Ces quantités ne sont pas directement comparables : l’écart n’est donc ni une mesure d’exactitude ni l’indication d’une cause.",
    rounding: "Les 104 valeurs officielles ont été publiées en kilomètres carrés entiers; leurs valeurs en hectares sont donc des conversions précises à ±50 ha, et non des totaux exacts.",
    withheld: "Quatorze valeurs plus récentes ne sont pas affichées, car leur source n’en permet qu’un usage personnel. Elles demeurent inconnues, jamais zéro.",
    gate: "Cette comparaison n’est pas la comparaison indépendante qu’exige la version définitive.",
    entitlement: "Chaque ligne place deux mesures indépendantes côte à côte pour la même année. Aucune ne corrige l’autre, et aucune série ne peut être additionnée entre les intervalles.",
    nfdScope: "Les lignes de la Base de données nationale sur les forêts (BDNF, tableau 5.2) conservent les années, la précision et les notes de l’éditeur; apparier les lignes par année ne prouve pas que les périodes de déclaration sont les mêmes. Les totaux incomplets, et les lignes où la couverture satellitaire est incomplète, demeurent inconnus.",
    nfdAttribution: "Contient de l’information visée par la Licence du gouvernement ouvert – Canada 2.0. Source : Base de données nationale sur les forêts, Conseil canadien des ministres des forêts, tableau 5.2. Aucune approbation par l’éditeur n’est sous-entendue.",
    nfdValue: "Hectares déclarés par la BDNF; précision de la source",
    incomplete: "Données incomplètes; écart inconnu",
    unavailable: "Inconnu",
    coverage: "Couverture satellitaire",
    complete: "Complète",
    partial: "Partielle",
    unknownArea: "Superficie sans données (ha)",
    rowSource: "Source de référence",
    statcan: "Statistique Canada, tableau 2.10",
    nfd: "BDNF, tableau 5.2; édition non déclarée",
    all: "Toutes les provinces",
    province: "Province",
    interval: "Années",
    witness: "Perte de forêt détectée (ha)",
    reference: "Récolte déclarée (ha)",
    difference: "Écart (ha)",
    status: "État de la référence",
    rounded: "Valeur officielle arrondie, ±50 ha",
    notPublished: "Non publiée",
    restrictedDetail: "Non affichée, selon les conditions d’utilisation de la source.",
    preliminary: "provisoire",
    revised: "révisée",
    agency: "estimation de l’organisme",
    none: "–",
    caption: "Lignes de comparaison avec une source officielle sur la récolte",
    source: "Source et attribution",
    attribution: "Adapté de Statistique Canada, tableau 2.10, Superficie forestière récoltée selon la province et le territoire, 1975 à 2015, 2018. Cela ne constitue pas une approbation de ce produit par Statistique Canada.",
  },
} as const;

const PROVINCES = ["BC", "AB", "ON", "QC"] as const;

function number(value: number | null, locale: Locale, maximumFractionDigits: 0 | 1 | 2 = 2) {
  if (value === null) return null;
  return formatNumber(value, locale, maximumFractionDigits);
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
  const hasNfd = visible.some((row) => row.referenceSourceId === "nfd-5.2-undeclared");
  const base = locale === "en" ? "/en/data/official-harvest-comparison" : "/fr/donnees/comparaison-recolte-officielle";
  return <main id="main" className="page-wrap">
    <header className="masthead prose-measure"><p className="eyebrow">{text.eyebrow}</p><h1>{text.title}</h1><p className="dek">{text.lead}</p></header>
    <section className="content-section prose-measure"><h2>{text.scopeTitle}</h2><p>{text.scope}</p><p>{text.entitlement}</p><p>{text.rounding}</p><p>{text.withheld}</p>{hasNfd && <p>{text.nfdScope}</p>}<p><strong>{text.gate}</strong></p></section>
    <section className="content-section">
      <nav aria-label={text.province} className="comparison-filters"><a href={base} aria-current={selectedProvince === null ? "page" : undefined}>{text.all}</a>{PROVINCES.map((item) => <a key={item} href={`${base}?province=${item}`} aria-current={selectedProvince === item ? "page" : undefined}>{item}</a>)}</nav>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={text.caption}><table><caption>{text.caption}{selectedProvince ? `: ${selectedProvince}` : ""}</caption><thead><tr><th scope="col">{text.province}</th><th scope="col">{text.interval}</th><th scope="col">{text.witness}</th><th scope="col">{text.reference}</th><th scope="col">{text.difference}</th><th scope="col">{text.status}</th><th scope="col">{text.coverage}</th><th scope="col">{text.rowSource}</th></tr></thead><tbody>{visible.map((row) => {
        const computed = row.comparisonStatus === "computed-rounded-reference";
        const nfd = row.referenceSourceId === "nfd-5.2-undeclared";
        const reference = nfd && row.referenceHectaresExact != null
          ? new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 20 }).format(Number(row.referenceHectaresExact))
          : computed ? number(row.referenceHectaresNominal, locale, 0) : null;
        const sourceName = nfd ? text.nfd : computed ? text.statcan : text.notPublished;
        return <tr key={`${row.province}:${row.toYear}`}><th scope="row">{row.province}</th><td className="nowrap">{row.fromYear}–{row.toYear}</td><td>{number(row.witnessTreeObservedForestLossHectares, locale) ?? <span className="unknown-value">{text.unavailable}</span>}</td><td>{reference ?? <span className="unknown-value">{nfd ? text.unavailable : text.notPublished}</span>}</td><td>{number(row.nominalSignedDifferenceHectares, locale) ?? <span className="unknown-value">{nfd ? text.unavailable : text.notPublished}</span>}</td><td>{computed || row.comparisonStatus === "computed-nfd-reference" ? <>{nfd ? text.nfdValue : text.rounded}<br /><small>{flags(row.referenceSourceFlags, locale)}</small></> : nfd ? text.incomplete : <><strong>{text.notPublished}</strong><br /><small>{text.restrictedDetail}</small></>}</td><td>{row.witnessTreeCoverageGrade === "complete" ? text.complete : row.witnessTreeCoverageGrade === "partial-with-unknown" ? text.partial : text.unavailable}<br /><small>{text.unknownArea}: {number(row.witnessTreeUnknownRequiredInputHectares, locale) ?? text.unavailable}</small></td><td>{row.referenceSourceUrl ? <a href={row.referenceSourceUrl}>{sourceName}</a> : sourceName}</td></tr>;
      })}</tbody></table></div>
    </section>
    <section className="content-section prose-measure"><h2>{text.source}</h2><p>{text.attribution}</p>{hasNfd && <p>{text.nfdAttribution}</p>}<p><a href={locale === "en" ? "https://www150.statcan.gc.ca/n1/pub/16-201-x/2018001/sec-2/tbl/tbl-2.10-eng.htm" : "https://www150.statcan.gc.ca/n1/pub/16-201-x/2018001/sec-2/tbl/tbl-2.10-fra.htm"}>{locale === "en" ? "Open Statistics Canada Table 2.10" : "Ouvrir le tableau 2.10 de Statistique Canada"}</a></p></section>
  </main>;
}
