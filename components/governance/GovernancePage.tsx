import { PRODUCT_NAME, type Locale } from "@/lib/domain";
import { TERMS_LICENCES } from "./terms-licences";

export type GovernancePageKind = "glossary" | "corrections" | "terms";

type Section = Readonly<{
  heading: string;
  paragraphs: readonly string[];
  /** A plain list under the paragraphs, used for the sources and licences on Terms. */
  items?: readonly string[];
  /** A link with a format is a file download and is drawn as a file tile, as on the Data page. */
  links?: readonly Readonly<{ label: string; href: string; format?: string }>[];
}>;
type PageCopy = Readonly<{
  title: string;
  /** Omitted where the page needs no status line under its title. */
  status?: string;
  sections: readonly Section[];
}>;

const enBrand = PRODUCT_NAME.en;
const frBrand = PRODUCT_NAME.fr;

const PAGES: Record<GovernancePageKind, Record<Locale, PageCopy>> = {
  glossary: {
    en: {
      title: "Glossary",
      status:
        "Plain definitions of the terms used in Explore and Compare.",
      sections: [
        {
          heading: "Forest",
          paragraphs: [
            "Land of at least 1 hectare and at least 20 metres wide, where tree crowns cover at least 10% of the ground and trees can grow to 5 metres. Percentages are a share of forest, not of all land.",
          ],
        },
        {
          heading: "Evidence",
          paragraphs: [
            "Official record: a public agency recorded it. Satellite observation: a change seen in satellite images, which can’t show the cause on its own. Derived estimate: a number calculated with a documented method. Unknown: no official public record answers the question yet.",
          ],
        },
        {
          heading: "Coverage",
          paragraphs: [
            "Event coverage grades say how many records support one event, from most to least: enhanced local records, national baseline plus local context, national baseline, extended record with few official matches, or not applicable. A grade describes one event, not a whole province or riding.",
            "Coverage for a province or riding says how much of it was mapped: all of it, part of it with the rest unknown, or none of it. Only a fully mapped area gets a full figure and a percentage. Explore shows these as “Fully mapped” or “Some of this area has no data, so this is a minimum”; Compare uses “Complete mapped coverage”, “Partial mapped coverage; unknown area remains” and “No mapped coverage”.",
          ],
        },
        {
          heading: "Per-cell",
          paragraphs: [
            "The most detailed loss shapes we publish, traced from 30-metre grid cells for a single year. They are separate from province or riding figures.",
          ],
        },
        {
          heading: "Annual interval",
          paragraphs: [
            "The detected loss from one year to the next, the shortest span you can choose on Explore. Choosing 1984 as the first year and 1985 as the last shows what was lost between those two years.",
          ],
        },
        {
          heading: "Province aggregate",
          paragraphs: [
            `A figure for a whole province. Province figures exist for every span of years from 1984 to 2022, and on Explore they follow the year control.`,
          ],
        },
        {
          heading: "Provisional",
          paragraphs: [
            "Published for review and use, with its limits stated, but not the final release. A provisional figure keeps those limits on coverage, comparison and checks on the ground.",
          ],
        },
        {
          heading: "Mapped extent",
          paragraphs: [
            "The area where the source data exists and has been checked. It can be smaller than the official boundary, and nothing outside it is covered.",
          ],
        },
        {
          heading: "Unknown share",
          paragraphs: [
            "The part of a province or riding that has no data. If it is above zero, the loss figure is a minimum for the mapped part, not a full total.",
          ],
        },
        {
          heading: "Representation order",
          paragraphs: [
            "The official set of federal riding boundaries for an election, published by Elections Canada. Compare names the order it uses, so results match a specific set of boundaries.",
          ],
        },
        {
          heading: "Detected loss patch",
          paragraphs: [
            "A simplified map shape showing where satellites detected forest loss in one year. Patches can’t be added up to get an exact area, and a patch alone doesn’t show logging, fire, deforestation, illegality or who is responsible.",
          ],
        },
      ],
    },
    fr: {
      title: "Glossaire",
      status:
        "Définitions simples des termes employés dans Explorer et Comparer.",
      sections: [
        {
          heading: "Forêt",
          paragraphs: [
            "Terre d’au moins 1 hectare et d’au moins 20 mètres de largeur, où les cimes des arbres couvrent au moins 10\u00A0% du sol et où les arbres peuvent atteindre 5 mètres. Les pourcentages sont une part de la forêt, et non de tout le territoire.",
          ],
        },
        {
          heading: "Preuves",
          paragraphs: [
            "Registre officiel\u202F: un organisme public l’a consigné. Observation satellitaire\u202F: un changement vu dans les images satellites, qui ne montre pas à lui seul la cause. Estimation dérivée\u202F: un chiffre calculé selon une méthode documentée. Inconnu\u202F: aucun registre public officiel ne répond encore à la question.",
          ],
        },
        {
          heading: "Couverture",
          paragraphs: [
            "Les catégories de couverture des événements indiquent combien de registres appuient un événement, du plus au moins\u202F: registres locaux enrichis, référence nationale avec contexte local, référence nationale, registre prolongé avec peu d’appariements officiels, ou sans objet. Une catégorie décrit un événement, et non une province ou une circonscription entière.",
            "La couverture d’une province ou d’une circonscription indique quelle part a été cartographiée\u202F: la totalité, une partie avec le reste inconnu, ou rien. Seule une zone entièrement cartographiée reçoit un chiffre complet et un pourcentage. Explorer affiche «\u00A0Entièrement cartographié\u00A0» ou «\u00A0Une partie de cette zone n’a pas de données\u202F: il s’agit donc d’un minimum\u00A0»\u202F; Comparer emploie «\u00A0Couverture cartographiée complète\u00A0», «\u00A0Couverture cartographiée partielle\u202F; une zone inconnue demeure\u00A0» et «\u00A0Aucune couverture cartographiée\u00A0».",
          ],
        },
        {
          heading: "Par cellule",
          paragraphs: [
            "Les formes de perte les plus détaillées que nous publions, tracées à partir de cellules de 30 mètres pour une seule année. Elles sont distinctes des chiffres provinciaux ou par circonscription.",
          ],
        },
        {
          heading: "Intervalle annuel",
          paragraphs: [
            "La perte détectée d’une année à la suivante, soit la période la plus courte que l’on peut choisir sur la page Explorer. Choisir 1984 comme première année et 1985 comme dernière montre ce qui a été perdu entre ces deux années.",
          ],
        },
        {
          heading: "Agrégat provincial",
          paragraphs: [
            "Un chiffre pour une province entière. Les chiffres provinciaux existent pour chaque période de 1984 à 2022 et, dans Explorer, ils suivent la commande d’année.",
          ],
        },
        {
          heading: "Provisoire",
          paragraphs: [
            "Publié pour examen et utilisation, avec ses limites indiquées, mais ce n’est pas la version définitive. Un chiffre provisoire garde ces limites de couverture, de comparaison et de vérification sur le terrain.",
          ],
        },
        {
          heading: "Étendue cartographiée",
          paragraphs: [
            "La zone où les données sources existent et ont été vérifiées. Elle peut être plus petite que la limite officielle, et rien n’est couvert à l’extérieur.",
          ],
        },
        {
          heading: "Part inconnue",
          paragraphs: [
            "La partie d’une province ou d’une circonscription sans données. Si elle dépasse zéro, le chiffre de perte est un minimum pour la partie cartographiée, et non un total complet.",
          ],
        },
        {
          heading: "Décret de représentation",
          paragraphs: [
            "L’ensemble officiel des limites des circonscriptions fédérales pour une élection, publié par Élections Canada. Comparer nomme le décret utilisé, afin que les résultats correspondent à des limites précises.",
          ],
        },
        {
          heading: "Zone de perte détectée",
          paragraphs: [
            "Une forme cartographique simplifiée qui montre où les satellites ont détecté une perte forestière pendant une année. Les zones ne peuvent pas être additionnées pour obtenir une superficie exacte et, à elles seules, ne montrent ni exploitation, ni incendie, ni déforestation, ni illégalité, ni responsable.",
          ],
        },
      ],
    },
  },
  corrections: {
    en: {
      title: "Corrections",
      status:
        "No production correction has been filed, because no final data has been published yet.",
      sections: [
        {
          heading: "Service levels",
          paragraphs: [
            "Response times, in business days to acknowledge and then to resolve: critical, 1 and 5; material, 3 and 15; minor, 5 and 30.",
          ],
        },
        {
          heading: "Public record",
          paragraphs: [
            "Each correction will say what was wrong, what it says now and why, in English and French on the same day. Old figures will stay available, and anyone notified before will get a correction alert.",
          ],
        },
        {
          heading: "Interim instructions",
          paragraphs: [
            `If the mistake is in a source’s own record, follow the source link and use that publisher’s correction process. If it’s on ${enBrand}, write down the page link, the exact words or number, the date and time, the language, why it looks wrong and any official source. There’s no way to send it to us yet, so check back here; don’t send personal information to any address this page doesn’t list. Your notes don’t open a case or start the response clock.`,
          ],
        },
      ],
    },
    fr: {
      title: "Corrections",
      status:
        "Aucune correction de production n’a été déposée, car aucune donnée définitive n’a encore été publiée.",
      sections: [
        {
          heading: "Délais de service",
          paragraphs: [
            "Délais de réponse, en jours ouvrables pour accuser réception puis pour régler\u202F: critique, 1 et 5\u202F; important, 3 et 15\u202F; mineur, 5 et 30.",
          ],
        },
        {
          heading: "Registre public",
          paragraphs: [
            "Chaque correction dira ce qui était erroné, ce qui est indiqué maintenant et pourquoi, en français et en anglais le même jour. Les anciennes valeurs resteront accessibles, et les personnes déjà avisées recevront une alerte de correction.",
          ],
        },
        {
          heading: "Instructions provisoires",
          paragraphs: [
            `Si l’erreur se trouve dans le registre d’une source, suivez le lien source et utilisez le processus de correction de cet éditeur. Si elle se trouve sur ${frBrand}, notez le lien de la page, les mots ou le chiffre exacts, la date et l’heure, la langue, pourquoi l’information semble erronée et toute source officielle. Il n’y a pas encore de moyen de nous l’envoyer\u202F: revenez ici\u202F; n’envoyez aucun renseignement personnel à une adresse que cette page n’indique pas. Vos notes n’ouvrent pas de demande et ne déclenchent aucun délai de réponse.`,
          ],
        },
      ],
    },
  },
  terms: {
    en: {
      title: "Terms",
      sections: [
        {
          heading: "Informational record",
          paragraphs: [
            `${enBrand} is a record of evidence. It is not an emergency service, legal advice, a compliance finding, an ownership history, an estimate of sellable timber or a wildfire forecast. The source agencies remain the authority.`,
          ],
        },
        {
          heading: "Interpretation",
          paragraphs: [
            "A change seen by satellite doesn’t show its cause. An organisation is named only in the exact role, and dated version, given in an official public record; being nearby never makes it responsible.",
          ],
        },
        {
          heading: "Licences and attribution",
          paragraphs: [
            "Each data source keeps its own licence, and none of the publishers below endorses this site. The site uses these sources under these licences and credits:",
          ],
          items: TERMS_LICENCES.en,
        },
      ],
    },
    fr: {
      title: "Conditions",
      sections: [
        {
          heading: "Registre d’information",
          paragraphs: [
            `${frBrand} est un registre de preuves. Ce n’est ni un service d’urgence, ni un avis juridique, ni une conclusion de conformité, ni un historique de propriété, ni une estimation du bois vendable, ni une prévision des incendies. Les organismes sources demeurent l’autorité.`,
          ],
        },
        {
          heading: "Interprétation",
          paragraphs: [
            "Un changement vu par satellite ne montre pas sa cause. Une organisation n’est nommée que dans le rôle exact, et la version datée, indiqués dans un registre public officiel\u202F; la proximité ne la rend jamais responsable.",
          ],
        },
        {
          heading: "Licences et attribution",
          paragraphs: [
            "Chaque source de données garde sa propre licence, et aucun des éditeurs ci-dessous n’approuve ce site. Le site utilise ces sources selon ces licences et mentions\u202F:",
          ],
          items: TERMS_LICENCES.fr,
        },
      ],
    },
  },
};

/**
 * The single source of truth for a governance route's document title. Fourteen
 * route files shipped without a `metadata` export and therefore without a
 * title; they now read it from the same copy the page renders, so a title and
 * its heading cannot drift apart.
 */
export function governancePageTitle(
  kind: GovernancePageKind,
  locale: Locale,
): string {
  return PAGES[kind][locale].title;
}

export function GovernancePage({
  kind,
  locale,
}: Readonly<{ kind: GovernancePageKind; locale: Locale }>) {
  const page = PAGES[kind][locale];
  return (
    <main id="main" className="page-wrap governance-page">
      <header className="masthead">
        <h1>{page.title}</h1>
        {/* This screen reports no figure, so it carries no figures caveat and
            no evidence key. Its status and the way to report an error sit
            under the title as plain text rather than in a plate. */}
        {page.status ? <p className="dek">{page.status}</p> : null}
        <p className="masthead-note">
          <a href={kind === "corrections" ? "#correction-instructions" : `/${locale}/corrections`}>
            {locale === "en" ? "Read the correction instructions" : "Consulter les instructions de correction"}
          </a>
        </p>
      </header>
      <div className="content-section prose-measure">
        {page.sections.map((section, index) => (
          <section className="governance-section" key={section.heading} id={kind === "corrections" && index === 2 ? "correction-instructions" : undefined}>
            <p className="governance-index" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.items ? (
              <ul className="licence-list">
                {section.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : null}
            {section.links ? (
              <ul className="link-list">
                {section.links.map((link) => (
                  link.format ? (
                    <li className="card card--lift file-tile" key={link.href}>
                      <span className="file-tile-format" aria-hidden="true">{link.format}</span>
                      <span className="file-tile-body"><a href={link.href}>{link.label}</a></span>
                    </li>
                  ) : (
                    <li className="card card--lift" key={link.href}>
                      <a href={link.href}>{link.label}</a>
                    </li>
                  )
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </main>
  );
}
