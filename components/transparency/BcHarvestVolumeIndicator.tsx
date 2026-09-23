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
    eyebrow: "Timber volume",
    title: "BC harvest volume and allowable annual cut",
    lead: "How much timber British Columbia billed each year, next to the amount the province allowed to be cut.",
    scopeTitle: "A different kind of measure",
    scope: "The rest of this site measures the area where forest was lost; this page measures the volume of logs actually cut, in cubic metres. The two sit side by side, and neither corrects the other.",
    volume: "Harvest volume is wood already cut and measured. It is not standing timber and says nothing about what is left.",
    aac: "The allowable annual cut is a limit set by BC’s Chief Forester. It is a policy number, not a measurement of wood that exists or could be cut.",
    prohibited: "No cubic-metres-per-hectare figure is shown, and one shouldn’t be worked out from these volumes and our loss areas, because they use different boundaries, timing and definitions.",
    stumpage: "Stumpage (the fee paid for cut timber) is not shown. It is set by a formula that, since July 2023 in the Interior, depends on the allowable cut and harvest themselves.",
    compare: "The share column compares the allowable cut with the harvest it applies to, only where both are published.",
    unknownNote: "Blank cells in the source stay unknown, never zero. There are no allowable-cut values before 1942.",
    caption: "BC harvest volume and allowable annual cut by year",
    year: "Year",
    region: "Region",
    total: "Total harvest (million m³)",
    regulated: "Harvest covered by the allowable cut (million m³)",
    unregulated: "Harvest not covered by the allowable cut (million m³)",
    allowable: "Allowable annual cut (million m³)",
    share: "Covered harvest as a share of the allowable cut",
    coverage: "Coverage",
    complete: "Complete",
    aacUnknown: "Allowable cut unknown",
    unknown: "Unknown",
    source: "Source and attribution",
    sourceName: "Environmental Reporting BC, Trends in Timber Harvesting indicator, summary data",
    attribution: "Contains information licensed under the Open Government Licence – British Columbia. Source: Environmental Reporting BC, Trends in Timber Harvesting in BC, summary data (bctimberharvest.xlsx). No publisher endorsement is implied.",
    withheld: "The billing reports behind this indicator, BC Timber Sales auction pages and stumpage appraisal documents aren’t published here, because their terms reserve all rights or haven’t been checked.",
    catalogue: "Open the BC Data Catalogue record",
    licence: "Open Government Licence – British Columbia",
  },
  fr: {
    eyebrow: "Volume de bois",
    title: "Volume récolté et possibilité annuelle de coupe en C.-B.",
    lead: "Le volume de bois facturé chaque année en Colombie-Britannique, à côté du volume que la province permettait de couper.",
    scopeTitle: "Un autre type de mesure",
    scope: "Le reste du site mesure la superficie où la forêt a été perdue; cette page mesure le volume de billes réellement coupées, en mètres cubes. Les deux se côtoient, et aucun ne corrige l’autre.",
    volume: "Le volume récolté est du bois déjà coupé et mesuré. Ce n’est pas du bois sur pied et il ne dit rien de ce qui reste.",
    aac: "La possibilité annuelle de coupe est une limite fixée par le forestier en chef de la C.-B. C’est une valeur de politique publique, et non une mesure du bois existant ou exploitable.",
    prohibited: "Aucun chiffre en mètres cubes par hectare n’est présenté, et il ne faut pas en calculer un à partir de ces volumes et de nos superficies de perte, car leurs limites, périodes et définitions diffèrent.",
    stumpage: "Les droits de coupe (le prix payé pour le bois coupé) ne sont pas présentés. Ils sont fixés par une formule qui, depuis juillet 2023 dans l’Intérieur, dépend elle-même de la possibilité de coupe et de la récolte.",
    compare: "La colonne de proportion compare la possibilité de coupe à la récolte qu’elle vise, seulement lorsque les deux valeurs sont publiées.",
    unknownNote: "Les cellules vides de la source demeurent inconnues, jamais zéro. Il n’y a aucune possibilité de coupe avant 1942.",
    caption: "Volume récolté et possibilité annuelle de coupe en C.-B. par année",
    year: "Année",
    region: "Région",
    total: "Récolte totale (millions de m³)",
    regulated: "Récolte visée par les possibilités de coupe (millions de m³)",
    unregulated: "Récolte non visée par les possibilités de coupe (millions de m³)",
    allowable: "Possibilité annuelle de coupe (millions de m³)",
    share: "Récolte visée en proportion de la possibilité de coupe",
    coverage: "Couverture",
    complete: "Complète",
    aacUnknown: "Possibilité de coupe inconnue",
    unknown: "Inconnu",
    source: "Source et attribution",
    sourceName: "Environmental Reporting BC, indicateur Trends in Timber Harvesting, données sommaires",
    attribution: "Contient de l’information visée par la Licence du gouvernement ouvert – Colombie-Britannique. Source : Environmental Reporting BC, Trends in Timber Harvesting in BC, données sommaires (bctimberharvest.xlsx). Aucune approbation par l’éditeur n’est sous-entendue.",
    withheld: "Les rapports de facturation qui alimentent cet indicateur, les pages d’enchères de BC Timber Sales et les documents d’évaluation des droits de coupe ne sont pas publiés ici, car leurs conditions réservent tous les droits ou n’ont pas été vérifiées.",
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
