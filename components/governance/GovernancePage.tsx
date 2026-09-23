import { formatYearRangeKey, PRODUCT_NAME, type Locale } from "@/lib/domain";
import {
  EXPLORE_COVERAGE_PERIOD,
  EXPLORE_DEFAULT_YEAR,
  EXPLORE_YEAR_MIN,
} from "@/lib/explore";
import {
  PROVINCE_BULK_TIME_RANGE,
  provinceBulkManifestUrl,
  provinceBulkRelease,
} from "@/lib/downloads/releases";

export type GovernancePageKind =
  | "glossary"
  | "corrections"
  | "decisions"
  | "engagement"
  | "privacy"
  | "terms"
  | "releases";

type Section = Readonly<{
  heading: string;
  paragraphs: readonly string[];
  /** A link with a format is a file download and is drawn as a file tile, as on the Data page. */
  links?: readonly Readonly<{ label: string; href: string; format?: string }>[];
}>;
type PageCopy = Readonly<{
  title: string;
  status: string;
  sections: readonly Section[];
}>;

const enBrand = PRODUCT_NAME.en;
const frBrand = PRODUCT_NAME.fr;
const [provinceCsv, provinceGeoPackage] = provinceBulkRelease.artifacts;

const PAGES: Record<GovernancePageKind, Record<Locale, PageCopy>> = {
  glossary: {
    en: {
      title: "Glossary",
      status:
        "Plain definitions of the terms used in Explore and Compare. A professional forestry review of these terms is still to come.",
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
            "Event coverage grades describe how many records sit behind a single event: enhanced local records, national baseline plus local context, national baseline, extended record with sparse official matching, or not applicable. They don’t mean a whole province or riding was measured.",
            "Province and riding measurement coverage states say how much of an area was mapped: complete, partial with unknown area, or none mapped. Only a fully mapped area gets a full figure and percentage. Explore labels these “Fully mapped” or “Partly unmapped, so this is a minimum”; Compare uses “Complete mapped coverage”, “Partial mapped coverage; unknown area remains” and “No mapped coverage”.",
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
            "Published for review and use, with its limits stated, but not the final release. A provisional figure keeps its stated limits on coverage, comparison and checks on the ground.",
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
        "Définitions simples des termes employés dans Explorer et Comparer. Une révision professionnelle de ces termes forestiers reste à faire.",
      sections: [
        {
          heading: "Forêt",
          paragraphs: [
            "Terre d’au moins 1 hectare et d’au moins 20 mètres de largeur, où les cimes des arbres couvrent au moins 10 % du sol et où les arbres peuvent atteindre 5 mètres. Les pourcentages sont une part de la forêt, et non de tout le territoire.",
          ],
        },
        {
          heading: "Preuves",
          paragraphs: [
            "Registre officiel : un organisme public l’a consigné. Observation satellitaire : un changement vu dans les images satellites, qui ne montre pas à lui seul la cause. Estimation dérivée : un chiffre calculé selon une méthode documentée. Inconnu : aucun registre public officiel ne répond encore à la question.",
          ],
        },
        {
          heading: "Couverture",
          paragraphs: [
            "Les catégories de couverture des événements indiquent combien de registres appuient un événement : registres locaux enrichis, référence nationale avec contexte local, référence nationale, registre prolongé avec appariement officiel limité, ou sans objet. Elles ne signifient pas qu’une province ou une circonscription entière a été mesurée.",
            "Les états de couverture des mesures provinciales et des circonscriptions indiquent quelle part d’une zone a été cartographiée : couverture complète, couverture partielle avec zone inconnue, ou aucune couverture cartographiée. Seule une zone entièrement cartographiée reçoit un chiffre complet et un pourcentage. Explorer affiche « Entièrement cartographié » ou « En partie non cartographié; il s’agit donc d’un minimum »; Comparer emploie « Couverture cartographiée complète », « Couverture cartographiée partielle; une zone inconnue demeure » et « Aucune couverture cartographiée ».",
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
            "Publié pour examen et utilisation, avec ses limites indiquées, mais ce n’est pas la version définitive. Une valeur provisoire conserve ses limites de couverture, de comparaison et de vérification sur le terrain.",
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
            "Critical: acknowledge within 1 business day and resolve within 5. Indigenous geography content: 1 and 10. Material: 3 and 15. Minor: 5 and 30.",
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
            `If the problem is in a source’s own public record, follow its source link and use the publisher’s own correction route. If the problem is on ${enBrand}, note the page link, the exact words or number, the date and time, the language, why it looks wrong and any official source, then check back here for where to send it; don’t send personal information to any address not listed on this page. Keeping these notes does not file a case or start the response clock.`,
          ],
        },
        {
          heading: "Contact status",
          paragraphs: [
            "We haven’t yet named a person responsible for corrections or set up a tested way to send them. Until then there is no approved correction address or form, and this page won’t claim to accept cases.",
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
            "Critique : accusé de réception dans un jour ouvrable et résolution dans cinq. Contenu de géographie autochtone : un et dix. Important : trois et quinze. Mineur : cinq et trente.",
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
            `Si le problème se trouve dans le registre public d’une source, suivez son lien source et utilisez la voie de correction de l’éditeur. Si le problème se trouve sur ${frBrand}, notez le lien de la page, les mots ou le chiffre exacts, la date et l’heure, la langue, pourquoi l’information semble erronée et toute source officielle, puis revenez ici pour savoir où l’envoyer; n’envoyez aucun renseignement personnel à une adresse qui n’est pas indiquée sur cette page. Prendre ces notes ne dépose pas de demande et ne déclenche aucun délai de réponse.`,
          ],
        },
        {
          heading: "État du contact",
          paragraphs: [
            "Nous n’avons pas encore désigné de responsable des corrections ni mis en place un moyen testé de les envoyer. D’ici là, aucune adresse de correction ni aucun formulaire n’est approuvé, et cette page ne prétendra pas accepter de demandes.",
          ],
        },
      ],
    },
  },
  decisions: {
    en: {
      title: "Decision log",
      status:
        "Decisions copied from version 2 of the implementation plan, dated 11 August 2026.",
      sections: [
        {
          heading: "Product",
          paragraphs: [
            `Working name: ${enBrand}. The record covers ${EXPLORE_COVERAGE_PERIOD.en} in British Columbia, Alberta, Ontario and Quebec; the year control starts at ${EXPLORE_YEAR_MIN}, the first year-to-year change, and opens on ${EXPLORE_DEFAULT_YEAR}.`,
            "The satellite data comes from NTEMS, Canada’s national land-monitoring system. Version 1 includes live wildfire, riding comparison, accounts and alerts, and reserve and treaty pages; advanced layer controls and asserted traditional territories are left out.",
          ],
        },
        {
          heading: "Product name",
          paragraphs: [
            `The owner kept the name ${enBrand} / ${frBrand} and decided not to pursue Mistik or an Indigenous engagement process. No Mistik request, permission, payment or terms exist, and the site must not suggest otherwise.`,
          ],
        },
        {
          heading: "Legal sign-off",
          paragraphs: [
            "On 27 August 2026 the owner recorded full legal sign-off, in both languages, for the site’s defamation safeguards, disclaimers, terms, privacy notice, licensing and credit rules, account and alert controls, and correction and dispute routes. This is the owner’s own record, not an independent lawyer’s opinion, and it doesn’t grant missing data rights or approve major later changes.",
          ],
        },
        {
          heading: "Change control",
          paragraphs: [
            "Changes to methods, sources or published figures will need approval from an editorial board. No board has been appointed yet.",
          ],
        },
      ],
    },
    fr: {
      title: "Registre des décisions",
      status:
        "Décisions reprises de la version 2 du plan de mise en œuvre, datée du 11 août 2026.",
      sections: [
        {
          heading: "Produit",
          paragraphs: [
            `Nom de travail : ${frBrand}. Le registre couvre la période de ${EXPLORE_COVERAGE_PERIOD.fr} en Colombie-Britannique, en Alberta, en Ontario et au Québec; la commande d’année commence à ${EXPLORE_YEAR_MIN}, le premier changement d’une année à l’autre, et s’ouvre sur ${EXPLORE_DEFAULT_YEAR}.`,
            "Les données satellitaires proviennent de NTEMS, le système national de surveillance du territoire du Canada. La version 1 comprend les incendies actuels, la comparaison des circonscriptions, les comptes et alertes, et les pages de réserves et de traités; les commandes avancées de couches et les territoires traditionnels revendiqués sont exclus.",
          ],
        },
        {
          heading: "Nom du produit",
          paragraphs: [
            `Le propriétaire a gardé le nom ${enBrand} / ${frBrand} et a décidé de ne pas poursuivre Mistik ni un processus de dialogue avec les peuples autochtones. Il n’existe aucune demande, permission, rémunération ni condition concernant Mistik, et le site ne doit pas laisser entendre le contraire.`,
          ],
        },
        {
          heading: "Approbation juridique",
          paragraphs: [
            "Le 27 août 2026, le propriétaire a consigné une approbation juridique complète, dans les deux langues, des mesures contre la diffamation, des avertissements, des conditions, de l’avis de confidentialité, des règles de licence et de mention des sources, des contrôles des comptes et des alertes, et des voies de correction et de contestation du site. Il s’agit du registre du propriétaire, et non de l’avis d’un avocat indépendant; il n’accorde aucun droit manquant sur les données et n’approuve pas de changements importants ultérieurs.",
          ],
        },
        {
          heading: "Contrôle des changements",
          paragraphs: [
            "Les changements de méthode, de sources ou de chiffres publiés devront être approuvés par un comité éditorial. Aucun comité n’a encore été nommé.",
          ],
        },
      ],
    },
  },
  engagement: {
    en: {
      title: "Indigenous engagement",
      status:
        "On 27 August 2026 the owner decided not to run an Indigenous engagement program for this product.",
      sections: [
        {
          heading: "Scope decision",
          paragraphs: [
            "No engagement contact route, contact list, Mistik request or engagement outcome will be presented as existing. Reserve and treaty pages stay unavailable unless the owner later secures the right data authority and a working process for communities to reply.",
          ],
        },
        {
          heading: "Name-request record",
          paragraphs: [
            `Mistik request: not opened. Terms: none. Honorarium: none. Permission: none. Final outcome: not pursued; ${enBrand} / ${frBrand} retained.`,
          ],
        },
        {
          heading: "Safeguards",
          paragraphs: [
            "Reserve and treaty boundaries are government and legal records; they do not describe the full extent of Indigenous lands, rights, title or relationships. No ranking, rights finding, consent finding or compliance claim applies to these areas.",
            "A treaty boundary marks an agreement as recorded by the Crown, not the boundary of a nation. Areas too small to measure reliably will show the original record, without a calculated rate.",
          ],
        },
        {
          heading: "Public register",
          paragraphs: [
            "Contacts made: none. Responses received: none. Anyone who asks to stay confidential will not be named.",
          ],
        },
      ],
    },
    fr: {
      title: "Dialogue avec les peuples autochtones",
      status:
        "Le 27 août 2026, le propriétaire a décidé de ne pas mener de programme de dialogue avec les peuples autochtones pour ce produit.",
      sections: [
        {
          heading: "Décision sur la portée",
          paragraphs: [
            "Aucune voie de dialogue, aucune liste de contacts, aucune demande concernant Mistik ni aucun résultat de dialogue ne seront présentés comme existants. Les pages sur les réserves et les traités restent indisponibles à moins que le propriétaire n’obtienne plus tard l’autorité nécessaire sur les données et un processus fonctionnel permettant aux communautés de répondre.",
          ],
        },
        {
          heading: "Registre de la demande de nom",
          paragraphs: [
            `Demande concernant Mistik : non ouverte. Conditions : aucune. Honoraire : aucun. Permission : aucune. Résultat final : non poursuivie; ${enBrand} / ${frBrand} sont retenus.`,
          ],
        },
        {
          heading: "Mesures de protection",
          paragraphs: [
            "Les limites de réserves et de traités sont des registres gouvernementaux et juridiques; elles ne décrivent pas toute l’étendue des terres, droits, titres ou relations autochtones. Aucun classement ni aucune conclusion sur les droits, le consentement ou la conformité ne s’applique à ces zones.",
            "Une limite de traité marque un accord consigné par la Couronne, et non la limite d’une nation. Les zones trop petites pour être mesurées de façon fiable présenteront le registre original, sans taux calculé.",
          ],
        },
        {
          heading: "Registre public",
          paragraphs: [
            "Contacts établis : aucun. Réponses reçues : aucune. Toute personne qui demande la confidentialité ne sera pas nommée.",
          ],
        },
      ],
    },
  },
  privacy: {
    en: {
      title: "Privacy notice – pre-activation",
      status: `This notice has legal sign-off recorded by the owner. Accounts are not active yet, and ${enBrand} stores no account, email or saved-area data.`,
      sections: [
        {
          heading: "Planned minimum data",
          paragraphs: [
            "Only with your clear consent: your email, a scrambled (hashed) password, language, saved areas, alert settings and a history of alerts sent. Saved areas will be treated as sensitive, and never linked to analytics or written to logs.",
          ],
        },
        {
          heading: "Planned controls",
          paragraphs: [
            "Each account’s data kept apart by the database, stored data encrypted, verified email, one-click unsubscribe, deletion within 30 days, alert history erased after 24 months, no tracking pixels, and a single email provider that gets only what it needs.",
          ],
        },
        {
          heading: "Hosting",
          paragraphs: [
            "Account data must be hosted in Canada, but a host hasn’t been chosen or checked yet. Accounts can’t launch until the location, the privacy and security checks, and the operating controls are published.",
          ],
        },
      ],
    },
    fr: {
      title: "Avis de confidentialité – avant activation",
      status: `Cet avis a reçu l’approbation juridique consignée par le propriétaire. Les comptes ne sont pas encore actifs, et ${frBrand} ne conserve actuellement aucune donnée de compte, d’adresse courriel ou de zone enregistrée.`,
      sections: [
        {
          heading: "Données minimales prévues",
          paragraphs: [
            "Seulement avec votre consentement clair : votre adresse courriel, un mot de passe brouillé (haché), la langue, les zones enregistrées, les réglages d’alerte et l’historique des alertes envoyées. Les zones enregistrées seront traitées comme sensibles, et ne seront jamais reliées à des outils d’analyse ni inscrites dans les journaux.",
          ],
        },
        {
          heading: "Contrôles prévus",
          paragraphs: [
            "Données de chaque compte séparées par la base de données, données stockées chiffrées, courriel vérifié, désabonnement en un clic, suppression dans les 30 jours, historique des alertes effacé après 24 mois, aucun pixel de suivi, et un seul fournisseur de courriel qui reçoit seulement le nécessaire.",
          ],
        },
        {
          heading: "Hébergement",
          paragraphs: [
            "Les données de compte doivent être hébergées au Canada, mais aucun hébergeur n’a encore été choisi ni vérifié. Les comptes ne pourront pas être lancés avant la publication du lieu, des vérifications de confidentialité et de sécurité, et des contrôles d’exploitation.",
          ],
        },
      ],
    },
  },
  terms: {
    en: {
      title: "Terms and limitations – reviewed",
      status:
        "The owner recorded legal sign-off for these terms on 27 August 2026. That alone doesn’t approve a full public release.",
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
          heading: "Licences",
          paragraphs: [
            "The code has no open-source licence yet. Data keeps its source’s own terms. The example data gives no right to redistribute.",
          ],
        },
      ],
    },
    fr: {
      title: "Conditions et limites – examinées",
      status:
        "Le propriétaire a consigné l’approbation juridique de ces conditions le 27 août 2026. Cela seul n’approuve pas une diffusion publique complète.",
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
            "Un changement vu par satellite ne montre pas sa cause. Une organisation n’est nommée que dans le rôle exact, et la version datée, indiqués dans un registre public officiel; la proximité ne la rend jamais responsable.",
          ],
        },
        {
          heading: "Licences",
          paragraphs: [
            "Le code n’a pas encore de licence libre. Les données gardent les conditions de leur source. Les données d’exemple ne donnent aucun droit de redistribution.",
          ],
        },
      ],
    },
  },
  releases: {
    en: {
      title: "Data releases",
      status:
        "One early preview release is published here. It is not the final release.",
      sections: [
        {
          heading: "Published preview release",
          paragraphs: [
            `Release ${provinceBulkRelease.id} holds the ${formatYearRangeKey(PROVINCE_BULK_TIME_RANGE, "en", "span")} province figures for British Columbia, Alberta, Ontario and Quebec, as a CSV and a GeoPackage. Each file comes with its checksum (SHA-256), licence credit, boundary version and method version.`,
            "It is a province-level preview, not detailed map shapes. Every province has some land with no data, so its loss figures are minimums.",
          ],
          links: [
            { label: "Download the province CSV", href: provinceCsv.url, format: "CSV" },
            { label: "Download the province GeoPackage", href: provinceGeoPackage.url, format: "GPKG" },
            { label: "Open the machine-readable release manifest", href: provinceBulkManifestUrl },
          ],
        },
        {
          heading: "Final release",
          paragraphs: [
            "There is no final release yet. It needs an independent comparison of the figures, which hasn’t been done, and this preview doesn’t replace it.",
          ],
        },
        {
          heading: "Citation format",
          paragraphs: [
            `${enBrand}, province aggregate, ${formatYearRangeKey(PROVINCE_BULK_TIME_RANGE, "en")}, ${provinceCsv.boundaryEdition}, release ${provinceBulkRelease.id}, method ${provinceCsv.methodVersion}, retrieval date and stable artifact URL. Cite it as a technical preview; a citation for the final release will be possible once that release exists.`,
          ],
        },
      ],
    },
    fr: {
      title: "Versions des données",
      status:
        "Une version d’aperçu préliminaire est publiée ici. Ce n’est pas la version définitive.",
      sections: [
        {
          heading: "Version d’aperçu publiée",
          paragraphs: [
            `La version ${provinceBulkRelease.id} contient les chiffres provinciaux ${formatYearRangeKey(PROVINCE_BULK_TIME_RANGE, "fr", "from")} pour la Colombie-Britannique, l’Alberta, l’Ontario et le Québec, en formats CSV et GeoPackage. Chaque fichier est accompagné de sa somme de contrôle (SHA-256), de la mention de licence, de la version des limites et de la version de la méthode.`,
            "Il s’agit d’un aperçu au niveau provincial, et non de formes cartographiques détaillées. Chaque province compte un territoire sans données; ses chiffres de perte sont donc des minimums.",
          ],
          links: [
            { label: "Télécharger le CSV provincial", href: provinceCsv.url, format: "CSV" },
            { label: "Télécharger le GeoPackage provincial", href: provinceGeoPackage.url, format: "GPKG" },
            { label: "Ouvrir le manifeste de version lisible par machine", href: provinceBulkManifestUrl },
          ],
        },
        {
          heading: "Version définitive",
          paragraphs: [
            "Il n’existe pas encore de version définitive. Elle exige une comparaison indépendante des chiffres, qui n’a pas été faite, et cet aperçu ne la remplace pas.",
          ],
        },
        {
          heading: "Format de citation",
          paragraphs: [
            `${frBrand}, agrégat provincial, ${formatYearRangeKey(PROVINCE_BULK_TIME_RANGE, "fr")}, ${provinceCsv.boundaryEdition}, version ${provinceBulkRelease.id}, méthode ${provinceCsv.methodVersion}, date de consultation et URL stable de l’artefact. Citez-la comme aperçu technique; une citation de la version définitive sera possible une fois cette version publiée.`,
          ],
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
        <p className="dek">{page.status}</p>
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
