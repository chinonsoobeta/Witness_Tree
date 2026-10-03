import { formatNumber, type Locale } from "@/lib/domain";

type VolumeFigure = Readonly<{ cubicMetres: number; complete: boolean; estimated: boolean }> | null;

export type ProvincialVolumeRow = Readonly<{
  province: string;
  year: number;
  harvest: VolumeFigure;
  woodSupply: VolumeFigure;
}>;

const PROVINCES = ["AB", "ON", "QC"] as const;

const COPY = {
  en: {
    eyebrow: "Timber volume",
    title: "Alberta, Ontario and Québec harvest volume and allowable cut",
    lead: "How much timber each province harvested from its own land every year, next to the wood supply it set, the counterpart of BC’s allowable annual cut.",
    scopeTitle: "A different kind of measure",
    scope: "The rest of this site measures the area where forest was lost; this page measures the volume of wood actually cut, in cubic metres. The two sit side by side, and neither corrects the other.",
    volume: "Harvest is industrial roundwood cut on provincial land: logs, pulpwood and other industrial wood. Firewood is left out. It is wood already cut, and says nothing about what is left standing.",
    supply: "The wood supply is the volume each province says can be cut from its land in a year, set through its own forest management planning. It is a policy number, not a measurement of wood that exists.",
    prohibited: "No cubic-metres-per-hectare figure is shown, and one shouldn’t be worked out from these volumes and our loss areas, because they use different boundaries, timing and definitions.",
    bcNote: "British Columbia has its own page, from the province’s own timber harvest indicator.",
    bcLink: "BC harvest volume and allowable annual cut",
    unknownNote: "Blank cells in the source stay unknown, never zero. Where some cells are blank, the figure is the sum of the rest and is marked as a minimum. Figures marked as estimates are the publisher’s own estimates; some repeat the year before.",
    caption: (province: string) => `${province}: harvest and wood supply on provincial land, by year`,
    year: "Year",
    harvest: "Harvested (million m³)",
    supplyColumn: "Wood supply (million m³)",
    share: "Harvest as a share of wood supply",
    minimum: "at least",
    estimate: "estimate",
    unknown: "Unknown",
    source: "Source and attribution",
    attribution: "Canadian Council of Forest Ministers, National Forestry Database: Net merchantable volume of roundwood harvested, and Wood supply estimates. Contains information licensed under the Open Government Licence – Canada. Retrieved 3 October 2026. No publisher endorsement is implied.",
    download: "National Forestry Database downloads",
    licence: "Open Government Licence – Canada",
    names: { AB: "Alberta", ON: "Ontario", QC: "Québec" },
  },
  fr: {
    eyebrow: "Volume de bois",
    title: "Volume récolté et possibilité de coupe en Alberta, en Ontario et au Québec",
    lead: "Le volume de bois que chaque province a récolté sur ses propres terres chaque année, à côté de l’approvisionnement en bois qu’elle a fixé, l’équivalent de la possibilité annuelle de coupe de la C.-B.",
    scopeTitle: "Un autre type de mesure",
    scope: "Le reste du site mesure la superficie où la forêt a été perdue\u202F; cette page mesure le volume de bois réellement coupé, en mètres cubes. Les deux se côtoient, et aucun ne corrige l’autre.",
    volume: "La récolte est le bois rond industriel coupé sur les terres provinciales\u202F: billes, bois à pâte et autre bois industriel. Le bois de chauffage est exclu. C’est du bois déjà coupé, qui ne dit rien de ce qui reste sur pied.",
    supply: "L’approvisionnement en bois est le volume que chaque province juge pouvoir être coupé sur ses terres en un an, fixé par sa propre planification de l’aménagement forestier. C’est une valeur de politique publique, et non une mesure du bois existant.",
    prohibited: "Aucun chiffre en mètres cubes par hectare n’est présenté, et il ne faut pas en calculer un à partir de ces volumes et de nos superficies de perte, car leurs limites, périodes et définitions diffèrent.",
    bcNote: "La Colombie-Britannique a sa propre page, tirée de l’indicateur de récolte de bois de la province.",
    bcLink: "Volume récolté et possibilité annuelle de coupe en C.-B.",
    unknownNote: "Les cellules vides de la source demeurent inconnues, jamais zéro. Lorsque certaines cellules sont vides, le chiffre est la somme des autres et est indiqué comme un minimum. Les chiffres indiqués comme estimations sont celles de l’éditeur\u202F; certains reprennent l’année précédente.",
    caption: (province: string) => `${province}\u202F: récolte et approvisionnement en bois sur les terres provinciales, par année`,
    year: "Année",
    harvest: "Récolte (millions de m³)",
    supplyColumn: "Approvisionnement en bois (millions de m³)",
    share: "Récolte en proportion de l’approvisionnement",
    minimum: "au moins",
    estimate: "estimation",
    unknown: "Inconnu",
    source: "Source et attribution",
    attribution: "Conseil canadien des ministres des forêts, Base de données nationale sur les forêts\u202F: volume marchand net de bois rond récolté, et estimations de l’approvisionnement en bois. Contient des informations visées par la Licence du gouvernement ouvert – Canada. Consulté le 3 octobre 2026. Aucune approbation par l’éditeur n’est sous-entendue.",
    download: "Téléchargements de la Base de données nationale sur les forêts",
    licence: "Licence du gouvernement ouvert – Canada",
    names: { AB: "Alberta", ON: "Ontario", QC: "Québec" },
  },
} as const;

export const PROVINCIAL_HARVEST_VOLUME_ROUTES = {
  en: "/en/data/provincial-harvest-volume",
  fr: "/fr/donnees/volume-recolte-provinces",
} as const;

const millions = (value: number, locale: Locale) => formatNumber(value / 1_000_000, locale, 2);

function Volume({ figure, locale }: Readonly<{ figure: VolumeFigure; locale: Locale }>) {
  const text = COPY[locale];
  if (!figure) return <span className="unknown-value">{text.unknown}</span>;
  return (
    <>
      {figure.complete ? null : <>{text.minimum} </>}
      {millions(figure.cubicMetres, locale)}
      {figure.estimated ? <small> ({text.estimate})</small> : null}
    </>
  );
}

function share(row: ProvincialVolumeRow, locale: Locale) {
  const { harvest, woodSupply } = row;
  // Only where both are whole: a minimum over a minimum is no share at all.
  if (!harvest?.complete || !woodSupply?.complete || woodSupply.cubicMetres === 0) return null;
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", { style: "percent", maximumFractionDigits: 0 }).format(harvest.cubicMetres / woodSupply.cubicMetres);
}

export function ProvincialHarvestVolume({ rows, locale }: Readonly<{ rows: readonly ProvincialVolumeRow[]; locale: Locale }>) {
  const text = COPY[locale];
  const unknown = <span className="unknown-value">{text.unknown}</span>;
  return <>
    <header className="masthead prose-measure"><p className="eyebrow">{text.eyebrow}</p><h1>{text.title}</h1><p className="dek">{text.lead}</p></header>
    <section className="content-section prose-measure">
      <h2>{text.scopeTitle}</h2>
      <p>{text.scope}</p>
      <p>{text.volume}</p>
      <p>{text.supply}</p>
      <p><strong>{text.prohibited}</strong></p>
      <p>{text.unknownNote}</p>
      <p>{text.bcNote} <a href={locale === "en" ? "/en/data/bc-harvest-volume" : "/fr/donnees/volume-recolte-bc"}>{text.bcLink}</a></p>
    </section>
    {PROVINCES.map((province) => {
      const name = text.names[province];
      const ordered = rows.filter((row) => row.province === province).sort((left, right) => right.year - left.year);
      return (
        <section className="content-section" key={province} aria-labelledby={`volume-${province}`}>
          <h2 id={`volume-${province}`}>{name}</h2>
          <div className="table-scroll" tabIndex={0} role="region" aria-label={text.caption(name)}>
            <table>
              <caption>{text.caption(name)}</caption>
              <thead><tr><th scope="col">{text.year}</th><th scope="col">{text.harvest}</th><th scope="col">{text.supplyColumn}</th><th scope="col">{text.share}</th></tr></thead>
              <tbody>{ordered.map((row) => (
                <tr key={row.year}>
                  <th scope="row">{row.year}</th>
                  <td><Volume figure={row.harvest} locale={locale} /></td>
                  <td><Volume figure={row.woodSupply} locale={locale} /></td>
                  <td>{share(row, locale) ?? unknown}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      );
    })}
    <section className="content-section prose-measure">
      <h2>{text.source}</h2>
      <p>{text.attribution}</p>
      <p><a href="http://nfdp.ccfm.org/en/download.php">{text.download}</a> · <a href="https://open.canada.ca/en/open-government-licence-canada">{text.licence}</a></p>
    </section>
  </>;
}
