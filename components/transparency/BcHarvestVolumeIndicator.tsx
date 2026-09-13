import { formatNumber, type Locale } from "@/lib/domain";

type BcHarvestVolumeRow = Readonly<{
  year: number;
  region: string;
  sourceId: string;
  totalHarvestMillionCubicMetres: number | null;
  harvestRegulatedByAacMillionCubicMetres: number | null;
  harvestNotRegulatedByAacMillionCubicMetres: number | null;
  allowableAnnualCutMillionCubicMetres: number | null;
  coverageGrade: string;
}>;

const COPY = {
  en: {
    eyebrow: "Volume instrument",
    title: "BC harvest volume and allowable annual cut",
    lead: "How much timber British Columbia billed each year, set beside the cut the province allowed.",
    scopeTitle: "A second instrument, not a second opinion",
    scope: "Everything else on this site measures area: cells a classifier stopped calling forest. This page measures volume: cubic metres a scaler measured on logs already cut. The two sit side by side and neither corrects the other.",
    volume: "Scaled harvest volume is wood already cut and measured. It is not standing timber and says nothing about what remains.",
    aac: "The allowable annual cut is an administrative determination by the Chief Forester. It is a policy number, not a measurement of wood that exists or could be cut.",
    prohibited: "No cubic-metres-per-hectare figure is shown or may be derived by dividing these volumes by detected loss area. The instruments have different boundaries, timing and definitions.",
    stumpage: "Stumpage is not shown. It is a formula price, and from July 2023 the Interior formula depends on the gap between the allowable cut and harvest, so it is not independent evidence about the wood.",
    compare: "Compare the allowable cut with harvest regulated by allowable cuts. The share column does that, and only where both values are published.",
    unknownNote: "Blank cells in the source workbook stay unknown, never zero. Before 1942 the workbook publishes no allowable-cut value.",
    caption: "BC harvest volume and allowable annual cut by year",
    year: "Year",
    region: "Region",
    total: "Total harvest (million m³)",
    regulated: "Harvest regulated by allowable cuts (million m³)",
    unregulated: "Harvest not regulated by allowable cuts (million m³)",
    allowable: "Allowable annual cut, administrative determination (million m³)",
    share: "Regulated harvest as a share of the allowable cut",
    coverage: "Coverage",
    complete: "Complete",
    aacUnknown: "Allowable cut unknown",
    unknown: "Unknown",
    source: "Source and attribution",
    sourceName: "Environmental Reporting BC, Trends in Timber Harvesting indicator, summary data",
    attribution: "Contains information licensed under the Open Government Licence – British Columbia. Source: Environmental Reporting BC, Trends in Timber Harvesting in BC, summary data (bctimberharvest.xlsx). No publisher endorsement is implied.",
    withheld: "The Harvest Billing System reports behind this indicator, BC Timber Sales auction pages and stumpage appraisal documents are not published here. Their terms reserve all rights or are unverified.",
    catalogue: "Open the BC Data Catalogue record",
    licence: "Open Government Licence – British Columbia",
  },
  fr: {
    eyebrow: "Instrument de volume",
    title: "Volume récolté et possibilité annuelle de coupe en C.-B.",
    lead: "Le volume de bois facturé chaque année en Colombie-Britannique, présenté à côté de la coupe autorisée par la province.",
    scopeTitle: "Un second instrument, pas un second avis",
    scope: "Tout le reste de ce site mesure une superficie : des cellules qu’un classificateur a cessé de considérer comme forêt. Cette page mesure un volume : les mètres cubes mesurés par un mesureur sur des billes déjà coupées. Les deux se côtoient et aucun ne corrige l’autre.",
    volume: "Le volume récolté mesuré correspond à du bois déjà coupé et mesuré. Ce n’est pas du bois sur pied et il ne dit rien de ce qui reste.",
    aac: "La possibilité annuelle de coupe est une décision administrative du forestier en chef. C’est une valeur de politique publique, et non une mesure du bois existant ou exploitable.",
    prohibited: "Aucun chiffre en mètres cubes par hectare n’est présenté ni ne peut être obtenu en divisant ces volumes par la superficie de perte détectée. Les instruments ont des limites, des périodes et des définitions différentes.",
    stumpage: "Les droits de coupe ne sont pas présentés. Ils résultent d’une formule, et depuis juillet 2023 la formule de l’Intérieur dépend de l’écart entre la possibilité de coupe et la récolte; ils ne constituent donc pas une preuve indépendante sur le bois.",
    compare: "Comparez la possibilité de coupe à la récolte visée par les possibilités de coupe. La colonne de proportion le fait, seulement lorsque les deux valeurs sont publiées.",
    unknownNote: "Les cellules vides du classeur source demeurent inconnues, jamais zéro. Avant 1942, le classeur ne publie aucune possibilité de coupe.",
    caption: "Volume récolté et possibilité annuelle de coupe en C.-B. par année",
    year: "Année",
    region: "Région",
    total: "Récolte totale (millions de m³)",
    regulated: "Récolte visée par les possibilités de coupe (millions de m³)",
    unregulated: "Récolte non visée par les possibilités de coupe (millions de m³)",
    allowable: "Possibilité annuelle de coupe, décision administrative (millions de m³)",
    share: "Récolte visée en proportion de la possibilité de coupe",
    coverage: "Couverture",
    complete: "Complète",
    aacUnknown: "Possibilité de coupe inconnue",
    unknown: "Inconnu",
    source: "Source et attribution",
    sourceName: "Environmental Reporting BC, indicateur Trends in Timber Harvesting, données sommaires",
    attribution: "Contient de l’information visée par la Licence du gouvernement ouvert – Colombie-Britannique. Source : Environmental Reporting BC, Trends in Timber Harvesting in BC, données sommaires (bctimberharvest.xlsx). Aucune approbation par l’éditeur n’est sous-entendue.",
    withheld: "Les rapports du Harvest Billing System qui alimentent cet indicateur, les pages d’enchères de BC Timber Sales et les documents d’évaluation des droits de coupe ne sont pas publiés ici. Leurs conditions réservent tous les droits ou n’ont pas été vérifiées.",
    catalogue: "Ouvrir la fiche du catalogue de données de la C.-B.",
    licence: "Licence du gouvernement ouvert – Colombie-Britannique",
  },
} as const;

export const BC_HARVEST_VOLUME_ROUTES = { en: "/en/data/bc-harvest-volume", fr: "/fr/donnees/volume-recolte-bc" } as const;

function volume(value: number | null, locale: Locale) {
  return value === null ? null : formatNumber(value, locale, 2);
}

function share(row: BcHarvestVolumeRow, locale: Locale) {
  const regulated = row.harvestRegulatedByAacMillionCubicMetres;
  const allowable = row.allowableAnnualCutMillionCubicMetres;
  if (regulated === null || allowable === null || allowable === 0) return null;
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", { style: "percent", maximumFractionDigits: 1 }).format(regulated / allowable);
}

export function BcHarvestVolumeIndicator({ rows, locale }: Readonly<{ rows: readonly BcHarvestVolumeRow[]; locale: Locale }>) {
  const text = COPY[locale];
  const unknown = <span className="unknown-value">{text.unknown}</span>;
  const ordered = [...rows].sort((left, right) => right.year - left.year);
  // The page route owns <main id="main">, so the accessibility contract can see it.
  return <>
    <header className="masthead prose-measure"><p className="eyebrow">{text.eyebrow}</p><h1>{text.title}</h1><p className="dek">{text.lead}</p></header>
    <section className="content-section prose-measure"><h2>{text.scopeTitle}</h2><p>{text.scope}</p><p>{text.volume}</p><p>{text.aac}</p><p><strong>{text.prohibited}</strong></p><p>{text.stumpage}</p><p>{text.compare}</p><p>{text.unknownNote}</p></section>
    <section className="content-section">
      <div className="table-scroll" tabIndex={0} role="region" aria-label={text.caption}><table><caption>{text.caption}</caption><thead><tr><th scope="col">{text.year}</th><th scope="col">{text.region}</th><th scope="col">{text.total}</th><th scope="col">{text.regulated}</th><th scope="col">{text.unregulated}</th><th scope="col">{text.allowable}</th><th scope="col">{text.share}</th><th scope="col">{text.coverage}</th></tr></thead><tbody>{ordered.map((row) => <tr key={row.year}><th scope="row">{row.year}</th><td>{row.region}</td><td>{volume(row.totalHarvestMillionCubicMetres, locale) ?? unknown}</td><td>{volume(row.harvestRegulatedByAacMillionCubicMetres, locale) ?? unknown}</td><td>{volume(row.harvestNotRegulatedByAacMillionCubicMetres, locale) ?? unknown}</td><td>{volume(row.allowableAnnualCutMillionCubicMetres, locale) ?? unknown}</td><td>{share(row, locale) ?? unknown}</td><td>{row.coverageGrade === "complete" ? text.complete : text.aacUnknown}<br /><small>{text.sourceName}</small></td></tr>)}</tbody></table></div>
    </section>
    <section className="content-section prose-measure"><h2>{text.source}</h2><p>{text.attribution}</p><p>{text.withheld}</p><p><a href="https://catalogue.data.gov.bc.ca/dataset/indicator-summary-data-trends-in-timber-harvesting-in-bc">{text.catalogue}</a> · <a href="https://www2.gov.bc.ca/gov/content?id=A519A56BC2BF44E4A008B33FCF527F61">{text.licence}</a></p></section>
  </>;
}
