import { colon, type Locale } from "@/lib/domain";
import { sourceCurrency } from "@/lib/currency";

/**
 * Product names live here rather than in the probe record. The record is an
 * account of what a host answered, and a translation is not something the host
 * said.
 */
const NAMES: Readonly<Record<string, Readonly<Record<Locale, string>>>> = {
  "annual-land-cover-vlce2": { en: "Annual forest land cover (VLCE2)", fr: "Couverture forestière annuelle (VLCE2)" },
  "forest-harvest": { en: "Canada forest harvest", fr: "Récolte forestière du Canada" },
  "forest-wildfire": { en: "Canada forest wildfire", fr: "Feux de forêt du Canada" },
};

const COPY = {
  en: {
    title: "How current the source is",
    lead: (checkedOn: string) =>
      `The years on this site are the years we have loaded, which may not be the latest. So we check with the publisher directly. Last checked: ${checkedOn}.`,
    product: "Source archive",
    ingested: "Loaded up to",
    published: "Published up to",
    current: (lastYear: number) =>
      `The publisher has nothing later than ${lastYear}, so this site is up to date with it.`,
    behind:
      "The publisher has a newer year that we haven’t loaded yet, so this site is behind.",
    revised:
      "The publisher has also revised a year we already loaded, so a figure here may differ from the source today.",
    hostLabel: "Checked against",
  },
  fr: {
    title: "Actualité de la source",
    lead: (checkedOn: string) =>
      `Les années présentées ici sont celles que nous avons chargées, qui ne sont pas forcément les plus récentes. Nous vérifions donc directement auprès du diffuseur. Dernière vérification : ${checkedOn}.`,
    product: "Archive source",
    ingested: "Chargée jusqu'à",
    published: "Diffusée jusqu'à",
    current: (lastYear: number) =>
      `Le diffuseur n'offre rien après ${lastYear}; ce site est donc à jour.`,
    behind:
      "Le diffuseur offre une année plus récente que nous n'avons pas encore chargée; ce site est donc en retard.",
    revised:
      "Le diffuseur a aussi révisé une année déjà chargée; une valeur présentée ici peut donc différer de la source aujourd'hui.",
    hostLabel: "Vérifié auprès de",
  },
} as const;

export function SourceCurrency({ locale }: Readonly<{ locale: Locale }>) {
  const copy = COPY[locale];
  return (
    <section className="content-section prose-measure">
      <h2>{copy.title}</h2>
      <p>{copy.lead(sourceCurrency.checkedOn)}</p>
      <table>
        <caption className="sr-only">{copy.title}</caption>
        <thead>
          <tr>
            <th scope="col">{copy.product}</th>
            <th scope="col">{copy.ingested}</th>
            <th scope="col">{copy.published}</th>
          </tr>
        </thead>
        <tbody>
          {sourceCurrency.products.map((product) => (
            <tr key={product.id}>
              <th scope="row">{NAMES[product.id]?.[locale] ?? product.title}</th>
              <td>{product.ingestedThroughYear}</td>
              <td>{product.latestPublishedYear}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{sourceCurrency.laterYearPublished ? copy.behind : copy.current(sourceCurrency.lastYear)}</p>
      {sourceCurrency.publisherRevisedAnIngestedYear ? <p>{copy.revised}</p> : null}
      <p>
        {copy.hostLabel}{colon(locale)} <code>{sourceCurrency.host}</code>
      </p>
    </section>
  );
}
