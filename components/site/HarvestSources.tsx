import Link from "next/link";
import type { Locale } from "@/lib/domain";
import { HARVEST_FIRE_ROUTES } from "@/lib/harvest-fire";

/*
 * The three pages that bring harvest and fire sources in beside the
 * satellite record. They were reachable only from a list of download files on
 * the Data page, though they answer the question most readers bring: how much
 * of this was logging, and how much was fire.
 */

const COPY = {
  en: {
    heading: "What was logged, and what burned",
    lead: "A satellite can see that trees are gone, but not why. These pages bring in other sources: official harvest statistics, British Columbia’s timber volumes, and Natural Resources Canada’s yearly maps of harvest and fire.",
    cards: [
      {
        eyebrow: "Official statistics",
        title: "Detected loss and official harvest figures",
        body: "Satellite-detected forest loss beside the official area harvested in each province, year by year.",
        link: "Compare with official harvest statistics",
        href: "/en/data/official-harvest-comparison",
      },
      {
        eyebrow: "Harvest and fire",
        title: "Harvest and fire by province, 1985–2022",
        body: "Natural Resources Canada’s maps of forest cleared by harvest and by fire, each year. Choose provinces and years, then download the chart or its numbers.",
        link: "Build a chart",
        href: HARVEST_FIRE_ROUTES.en,
      },
      {
        eyebrow: "Timber volume",
        title: "BC harvest volume and allowable annual cut",
        body: "How much timber British Columbia billed each year, next to the amount the province allowed to be cut.",
        link: "See BC harvest volume",
        href: "/en/data/bc-harvest-volume",
      },
    ],
  },
  fr: {
    heading: "Ce qui a été récolté, et ce qui a brûlé",
    lead: "Un satellite peut voir que des arbres ont disparu, mais pas pourquoi. Ces pages font appel à d’autres sources\u202F: les statistiques officielles sur la récolte, les volumes de bois de la Colombie-Britannique et les cartes annuelles de la récolte et des feux de Ressources naturelles Canada.",
    cards: [
      {
        eyebrow: "Statistiques officielles",
        title: "Perte détectée et chiffres officiels de récolte",
        body: "La perte de forêt détectée par satellite, à côté de la superficie officiellement récoltée dans chaque province, année par année.",
        link: "Comparer aux statistiques officielles sur la récolte",
        href: "/fr/donnees/comparaison-recolte-officielle",
      },
      {
        eyebrow: "Récolte et feu",
        title: "Récolte et feu par province, 1985–2022",
        body: "Les cartes de Ressources naturelles Canada de la forêt dégagée par la récolte et par le feu, chaque année. Choisissez les provinces et les années, puis téléchargez le graphique ou ses chiffres.",
        link: "Créer un graphique",
        href: HARVEST_FIRE_ROUTES.fr,
      },
      {
        eyebrow: "Volume de bois",
        title: "Volume récolté et possibilité annuelle de coupe en C.-B.",
        body: "Le volume de bois facturé chaque année en Colombie-Britannique, à côté du volume que la province permettait de couper.",
        link: "Voir le volume récolté en C.-B.",
        href: "/fr/donnees/volume-recolte-bc",
      },
    ],
  },
} as const;

export function HarvestSources({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  return (
    <section className="content-section" id="harvest-and-fire-sources" aria-labelledby="harvest-and-fire-sources-heading">
      <h2 id="harvest-and-fire-sources-heading">{copy.heading}</h2>
      <p className="lead">{copy.lead}</p>
      <div className="record-grid">
        {copy.cards.map((card) => (
          <article className="record-card" key={card.href}>
            <p className="eyebrow">{card.eyebrow}</p>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
            <Link href={card.href}>{card.link}</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
