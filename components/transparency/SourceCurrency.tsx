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
      `The years on this site are the years that have been ingested. That is not the same as a statement about today, and from the page alone the two look identical. So the publisher is asked directly, and the date it was asked is written here: ${checkedOn}.`,
    product: "Source archive",
    ingested: "Ingested through",
    published: "Published through",
    current: (lastYear: number) =>
      `Nothing later than ${lastYear} is published for any of these archives, so the period on this site is the period the publisher offers.`,
    behind:
      "A later year is published and has not been ingested, so the period on this site is behind the publisher. Finding that gap records it; it does not close it.",
    revised:
      "The publisher has also revised a year that was already ingested, which means a figure here can differ from the same year read from the source today.",
    hostLabel: "Checked against",
  },
  fr: {
    title: "Actualité de la source",
    lead: (checkedOn: string) =>
      `Les années présentées ici sont les années intégrées. Ce n'est pas la même chose qu'un énoncé sur aujourd'hui, et à la lecture de la page les deux se ressemblent. Le diffuseur est donc interrogé directement, et la date de cette vérification est inscrite ici : ${checkedOn}.`,
    product: "Archive source",
    ingested: "Intégrée jusqu'à",
    published: "Diffusée jusqu'à",
    current: (lastYear: number) =>
      `Aucune année postérieure à ${lastYear} n'est diffusée pour ces archives; la période présentée ici est donc celle qu'offre le diffuseur.`,
    behind:
      "Une année postérieure est diffusée sans avoir été intégrée; la période présentée ici est donc en retard sur le diffuseur. Constater cet écart le consigne, sans le combler.",
    revised:
      "Le diffuseur a aussi révisé une année déjà intégrée, ce qui signifie qu'une valeur présentée ici peut différer de la même année lue aujourd'hui à la source.",
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
