import { PRODUCT_NAME, type Locale } from "@/lib/domain";
import {
  EXPLORE_COVERAGE_PERIOD,
  EXPLORE_DEFAULT_YEAR,
  EXPLORE_YEAR_MIN,
} from "@/lib/explore";
import {
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
  links?: readonly Readonly<{ label: string; href: string }>[];
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
        "Terms used in Explore and Compare; professional forestry terminology review is pending.",
      sections: [
        {
          heading: "Forest",
          paragraphs: [
            "Land of at least 1 hectare, with at least 10% crown closure, carrying trees capable of reaching 5 metres at maturity. Percentages use forested hectares inside the stated boundary edition, not total land area.",
          ],
        },
        {
          heading: "Evidence",
          paragraphs: [
            "Official record: an authoritative public record. Satellite observation: change visible in imagery without, by itself, establishing cause. Derived estimate: a documented calculation. Unknown: no authoritative public record has been integrated for the question.",
          ],
        },
        {
          heading: "Coverage",
          paragraphs: [
            "Event coverage grades describe the records and context available for an event or reported value: enhanced local records, national baseline plus local context, national baseline, extended record with sparse official matching, or not applicable. These grades appear with event-level evidence and do not say that a whole province or riding was measured.",
            "Province and riding measurement coverage states describe whether the required mapped inputs cover the selected boundary: complete, partial with unknown area, or none mapped. Explore labels these as “Every input pixel present” or “Some pixels unknown, so this is a minimum”; Compare uses “Complete mapped coverage”, “Partial mapped coverage; unknown area remains” and “No mapped coverage”. These states determine whether a boundary total or percentage can be reported. The two taxonomies answer different questions and are not interchangeable.",
          ],
        },
        {
          heading: "Per-cell",
          paragraphs: [
            "The most detailed published loss geometry. Each record represents one connected component traced from 30 metre source cells for one annual interval. Per-cell geometry is distinct from a province or riding aggregate.",
          ],
        },
        {
          heading: "Annual interval",
          paragraphs: [
            "The period between two annual observations. The year control names the ending year, so 1985 means the interval from 1984 to 1985 rather than the 1985 calendar year.",
          ],
        },
        {
          heading: "Province aggregate",
          paragraphs: [
            "A summary calculated for an entire provincial boundary. The available 2020 to 2022 province aggregate is a separate layer from the annual per-cell map and does not change when the year control moves.",
          ],
        },
        {
          heading: "Provisional",
          paragraphs: [
            "Published with stated limits for review and use, but not admitted as the formal Phase 2 production release. A provisional figure remains subject to the stated coverage, comparison and ground-verification limits.",
          ],
        },
        {
          heading: "Mapped extent",
          paragraphs: [
            "The area where the required source inputs are present and their extent has been checked. It may be smaller than the administrative boundary and does not imply complete coverage outside it.",
          ],
        },
        {
          heading: "Unknown share",
          paragraphs: [
            "The portion of a province or riding for which a required mapped input is unavailable. A non-zero unknown share means a detected-loss value is a known-area minimum, not a complete boundary total.",
          ],
        },
        {
          heading: "Representation order",
          paragraphs: [
            "The official Elections Canada boundary edition that defines federal electoral districts for an election. Compare uses the named order so results are tied to a specific set of riding boundaries rather than a generic current riding.",
          ],
        },
        {
          heading: "Detected loss patch",
          paragraphs: [
            "A simplified map shape traced from connected source cells where satellite data detected forest loss in one annual interval. Display patches cannot be added to recover exact area, and a patch alone does not establish logging, fire, deforestation, illegality or responsibility.",
          ],
        },
      ],
    },
    fr: {
      title: "Glossaire",
      status:
        "Termes employés dans Explorer et Comparer; la révision professionnelle de la terminologie forestière reste à faire.",
      sections: [
        {
          heading: "Forêt",
          paragraphs: [
            "Terre d’au moins 1 hectare, présentant un couvert de cimes d’au moins 10 %, avec des arbres capables d’atteindre 5 mètres à maturité. Les pourcentages utilisent les hectares forestiers dans l’édition de limite indiquée, et non la superficie terrestre totale.",
          ],
        },
        {
          heading: "Preuves",
          paragraphs: [
            "Registre officiel : registre public faisant autorité. Observation satellitaire : changement visible dans les images qui, à lui seul, n’en établit pas la cause. Estimation dérivée : calcul documenté. Inconnu : aucun registre public faisant autorité n’a été intégré pour la question.",
          ],
        },
        {
          heading: "Couverture",
          paragraphs: [
            "Les catégories de couverture des événements décrivent les registres et le contexte disponibles pour un événement ou une valeur rapportée : registres locaux enrichis, référence nationale avec contexte local, référence nationale, registre prolongé avec appariement officiel limité, ou sans objet. Elles accompagnent les preuves au niveau de l’événement et n’indiquent pas qu’une province ou une circonscription entière a été mesurée.",
            "Les états de couverture des mesures provinciales et des circonscriptions indiquent si les intrants cartographiés requis couvrent la limite choisie : couverture complète, couverture partielle avec zone inconnue, ou aucune couverture cartographiée. Explorer affiche « Tous les pixels d’entrée sont présents » ou « Certains pixels sont inconnus; il s’agit donc d’un minimum »; Comparer emploie « Couverture cartographiée complète », « Couverture cartographiée partielle; une zone inconnue demeure » et « Aucune couverture cartographiée ». Ces états déterminent si un total ou un pourcentage peut être rapporté pour la limite. Les deux taxonomies répondent à des questions différentes et ne sont pas interchangeables.",
          ],
        },
        {
          heading: "Par cellule",
          paragraphs: [
            "La géométrie de perte publiée la plus détaillée. Chaque enregistrement représente une composante connectée tracée à partir de cellules sources de 30 mètres pour un intervalle annuel. La géométrie par cellule est distincte d’un agrégat provincial ou de circonscription.",
          ],
        },
        {
          heading: "Intervalle annuel",
          paragraphs: [
            "La période entre deux observations annuelles. Le contrôle de l’année nomme l’année de fin; 1985 désigne donc l’intervalle de 1984 à 1985 et non l’année civile 1985.",
          ],
        },
        {
          heading: "Agrégat provincial",
          paragraphs: [
            "Un résumé calculé pour toute une limite provinciale. L’agrégat provincial disponible de 2020 à 2022 constitue une couche distincte de la carte annuelle par cellule et ne change pas lorsque le contrôle de l’année est déplacé.",
          ],
        },
        {
          heading: "Provisoire",
          paragraphs: [
            "Publié avec des limites déclarées pour examen et utilisation, mais non admis comme version de production formelle de la phase 2. Une valeur provisoire demeure assujettie aux limites indiquées de couverture, de comparaison et de vérification sur le terrain.",
          ],
        },
        {
          heading: "Étendue cartographiée",
          paragraphs: [
            "La zone où les intrants sources requis sont présents et dont l’étendue a été vérifiée. Elle peut être plus petite que la limite administrative et n’implique pas une couverture complète à l’extérieur.",
          ],
        },
        {
          heading: "Part inconnue",
          paragraphs: [
            "La portion d’une province ou d’une circonscription pour laquelle un intrant cartographié requis n’est pas disponible. Une part inconnue non nulle signifie qu’une valeur de perte détectée est un minimum pour la zone connue, et non un total complet pour la limite.",
          ],
        },
        {
          heading: "Décret de représentation",
          paragraphs: [
            "L’édition officielle des limites d’Élections Canada qui définit les circonscriptions fédérales pour une élection. Comparer utilise le décret nommé afin de rattacher les résultats à un ensemble précis de limites plutôt qu’à une circonscription actuelle générique.",
          ],
        },
        {
          heading: "Zone de perte détectée",
          paragraphs: [
            "Une forme cartographique simplifiée tracée à partir de cellules sources connectées où les données satellitaires ont détecté une perte forestière pendant un intervalle annuel. Les zones affichées ne peuvent pas être additionnées pour retrouver la superficie exacte et, à elles seules, n’établissent ni exploitation, ni incendie, ni déforestation, ni illégalité, ni responsabilité.",
          ],
        },
      ],
    },
  },
  corrections: {
    en: {
      title: "Corrections",
      status:
        "No production correction has been filed because no production data has been published.",
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
            "Every correction will state what was wrong, what it is now and why it changed, in English and French on the same day. Previous figures will remain addressable, and people previously notified will receive a correction alert.",
          ],
        },
        {
          heading: "Interim instructions",
          paragraphs: [
            `If the concern is with an underlying public record, follow its source link and use the publisher’s own correction route. For a ${enBrand} display or transcription concern, keep the page URL, exact wording or value, date and time, displayed language, why it appears wrong, and any supporting official source link, then return here for the verified intake channel. Do not send personal or sensitive information to an address that is not published on this page. Preparing this record does not file a case or start a service-level clock.`,
          ],
        },
        {
          heading: "Contact status",
          paragraphs: [
            "Owner action is still required to appoint a named accountable recipient and publish a tested intake channel. No correction address or submission form is currently authorized, and this route will not claim to accept cases until that governance gate is complete.",
          ],
        },
      ],
    },
    fr: {
      title: "Corrections",
      status:
        "Aucune correction de production n’a été déposée, car aucune donnée de production n’a été publiée.",
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
            "Chaque correction indiquera ce qui était erroné, la nouvelle information et la raison du changement, en français et en anglais le même jour. Les anciennes valeurs resteront accessibles et les personnes déjà avisées recevront une alerte de correction.",
          ],
        },
        {
          heading: "Instructions provisoires",
          paragraphs: [
            `Si le problème concerne un registre public sous-jacent, suivez son lien source et utilisez la voie de correction de l’éditeur. Pour un problème d’affichage ou de transcription d’${frBrand}, conservez l’URL de la page, le libellé ou la valeur exacte, la date et l’heure, la langue affichée, la raison pour laquelle l’information semble erronée et tout lien vers une source officielle à l’appui, puis revenez ici pour connaître le canal de réception vérifié. N’envoyez aucun renseignement personnel ou sensible à une adresse qui n’est pas publiée sur cette page. La préparation de ce dossier ne dépose pas de demande et ne déclenche aucun délai de service.`,
          ],
        },
        {
          heading: "État du contact",
          paragraphs: [
            "Le propriétaire doit encore désigner un destinataire responsable et publier un canal de réception testé. Aucune adresse de correction ni aucun formulaire de soumission n’est actuellement autorisé, et cette route ne prétendra pas accepter des dossiers avant la réalisation de cette condition de gouvernance.",
          ],
        },
      ],
    },
  },
  decisions: {
    en: {
      title: "Decision log",
      status:
        "Decisions transcribed from implementation plan version 2, dated 11 August 2026.",
      sections: [
        {
          heading: "Product",
          paragraphs: [
            `Working name: ${enBrand}. The record covers ${EXPLORE_COVERAGE_PERIOD.en}; the year control starts at ${EXPLORE_YEAR_MIN} because that is the first annual interval, and the default view is ${EXPLORE_DEFAULT_YEAR}. Scope is British Columbia, Alberta, Ontario and Quebec.`,
            "NTEMS is the satellite spine. Live wildfire, riding comparison, accounts and alerts, reserve and treaty pages are in version 1. Advanced layer controls and asserted traditional territories are excluded.",
          ],
        },
        {
          heading: "Product name",
          paragraphs: [
            `The owner retained ${enBrand} / ${frBrand} and decided not to pursue Mistik or an Indigenous engagement process. No Mistik request, permission, honorarium or terms exist, and the product must not imply otherwise.`,
          ],
        },
        {
          heading: "Legal sign-off",
          paragraphs: [
            "The accountable owner recorded full bilingual legal sign-off on 27 August 2026 for the current defamation safeguards, disclaimers, terms, privacy notice, licensing and attribution rules, account and alert controls, and correction and dispute routes. This owner record is not represented as an independent counsel opinion and does not grant missing source rights or approve a later materially changed scope.",
          ],
        },
        {
          heading: "Change control",
          paragraphs: [
            "Method changes, new sources and changes to published figures require future editorial-board approval. No board has yet been appointed.",
          ],
        },
      ],
    },
    fr: {
      title: "Registre des décisions",
      status:
        "Décisions transcrites de la version 2 du plan de mise en œuvre, datée du 11 août 2026.",
      sections: [
        {
          heading: "Produit",
          paragraphs: [
            `Nom de travail : ${frBrand}. Le registre couvre la période de ${EXPLORE_COVERAGE_PERIOD.fr}; la commande d’année commence à ${EXPLORE_YEAR_MIN}, soit le premier intervalle annuel, et la vue par défaut est ${EXPLORE_DEFAULT_YEAR}. La portée comprend la Colombie-Britannique, l’Alberta, l’Ontario et le Québec.`,
            "NTEMS constitue la base satellitaire. Les incendies actuels, la comparaison des circonscriptions, les comptes et alertes ainsi que les pages de réserves et de traités sont prévus dans la version 1. Les commandes avancées de couches et les territoires traditionnels revendiqués sont exclus.",
          ],
        },
        {
          heading: "Nom du produit",
          paragraphs: [
            `Le propriétaire a retenu ${enBrand} / ${frBrand} et a décidé de ne pas poursuivre Mistik ni un processus de dialogue avec les peuples autochtones. Il n’existe aucune demande, permission, aucun honoraire ni aucune condition concernant Mistik, et le produit ne doit pas laisser entendre le contraire.`,
          ],
        },
        {
          heading: "Approbation juridique",
          paragraphs: [
            "Le 27 août 2026, le propriétaire responsable a consigné une approbation juridique bilingue complète des mesures contre la diffamation, des avertissements, des conditions, de l’avis de confidentialité, des règles de licence et d’attribution, des contrôles des comptes et des alertes, ainsi que des voies de correction et de contestation actuels. Ce registre du propriétaire n’est pas présenté comme un avis d’un conseiller juridique indépendant et n’accorde aucun droit manquant sur une source ni aucune approbation d’une portée ultérieure sensiblement modifiée.",
          ],
        },
        {
          heading: "Contrôle des changements",
          paragraphs: [
            "Les changements de méthode, les nouvelles sources et les modifications de valeurs publiées devront être approuvés par un futur comité éditorial. Aucun comité n’a encore été nommé.",
          ],
        },
      ],
    },
  },
  engagement: {
    en: {
      title: "Indigenous engagement",
      status:
        "The owner decided on 27 August 2026 not to operate an Indigenous engagement program for this product.",
      sections: [
        {
          heading: "Scope decision",
          paragraphs: [
            "No engagement contact route, contact register, Mistik request, or engagement outcome will be represented as existing. Reserve and treaty production surfaces remain unavailable unless a later owner decision establishes the necessary source authority and accountable right-of-reply operation.",
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
            "Reserve and treaty boundaries are administrative and legal records; they do not describe the full extent of Indigenous lands, rights, title or relationships. No ranking, rights finding, consent finding or compliance claim applies to these geographies.",
            "A treaty boundary is the boundary of an agreement as recorded by the Crown, not the boundary of a nation. Small areas below the resolution threshold will show the raw record without a computed rate.",
          ],
        },
        {
          heading: "Public register",
          paragraphs: [
            "Contacts made: none. Responses received: none. Confidential contacts, when requested, will not be identified publicly.",
          ],
        },
      ],
    },
    fr: {
      title: "Dialogue avec les peuples autochtones",
      status:
        "Le propriétaire a décidé le 27 août 2026 de ne pas exploiter de programme de dialogue avec les peuples autochtones pour ce produit.",
      sections: [
        {
          heading: "Décision sur la portée",
          paragraphs: [
            "Aucune voie de dialogue, aucun registre de contacts, aucune demande concernant Mistik ni aucun résultat de dialogue ne seront présentés comme existants. Les surfaces de production sur les réserves et les traités demeurent indisponibles à moins qu’une décision ultérieure du propriétaire n’établisse l’autorité nécessaire sur les sources et un mécanisme responsable de droit de réponse.",
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
            "Les limites de réserves et de traités sont des registres administratifs et juridiques; elles ne décrivent pas toute l’étendue des terres, droits, titres ou relations autochtones. Aucun classement ni aucune conclusion sur les droits, le consentement ou la conformité ne s’applique à ces géographies.",
            "Une limite de traité est la limite d’un accord consigné par la Couronne, et non la limite d’une nation. Les petites superficies sous le seuil de résolution présenteront le registre brut sans taux calculé.",
          ],
        },
        {
          heading: "Registre public",
          paragraphs: [
            "Contacts établis : aucun. Réponses reçues : aucune. Les contacts confidentiels ne seront pas identifiés publiquement lorsqu’une demande en ce sens est formulée.",
          ],
        },
      ],
    },
  },
  privacy: {
    en: {
      title: "Privacy notice – pre-activation",
      status: `The current notice has owner-recorded legal sign-off. Accounts are not active and ${enBrand} currently stores no account, email or saved-area data.`,
      sections: [
        {
          heading: "Planned minimum data",
          paragraphs: [
            "With explicit consent: email, password hash, locale, saved geometries, alert preferences and send history. Saved areas will be treated as sensitive and will not be joined to analytics identifiers or written to logs.",
          ],
        },
        {
          heading: "Planned controls",
          paragraphs: [
            "Database-enforced row-level isolation, encryption at rest, verified email, one-click unsubscribe, deletion within 30 days, send-history purge after 24 months, no tracking pixels and one transactional provider carrying the minimum payload.",
          ],
        },
        {
          heading: "Hosting",
          paragraphs: [
            "Canadian hosting for account data is required but has not been selected or verified. Accounts cannot launch until the location, privacy and security evidence, and operational controls are published.",
          ],
        },
      ],
    },
    fr: {
      title: "Avis de confidentialité – avant activation",
      status: `L’avis actuel a reçu l’approbation juridique consignée du propriétaire. Les comptes ne sont pas actifs et ${frBrand} ne conserve actuellement aucune donnée de compte, d’adresse courriel ou de zone enregistrée.`,
      sections: [
        {
          heading: "Données minimales prévues",
          paragraphs: [
            "Avec consentement explicite : adresse courriel, condensat du mot de passe, langue, géométries enregistrées, préférences d’alerte et historique d’envoi. Les zones enregistrées seront traitées comme sensibles et ne seront ni reliées à un identifiant analytique ni inscrites dans les journaux.",
          ],
        },
        {
          heading: "Contrôles prévus",
          paragraphs: [
            "Isolement des lignes imposé par la base de données, chiffrement au repos, courriel vérifié, désabonnement en un clic, suppression dans les 30 jours, purge de l’historique d’envoi après 24 mois, aucun pixel de suivi et un seul fournisseur transactionnel recevant le minimum de données.",
          ],
        },
        {
          heading: "Hébergement",
          paragraphs: [
            "L’hébergement canadien des données de compte est exigé, mais n’a pas encore été choisi ou vérifié. Les comptes ne peuvent être lancés avant la publication du lieu, des preuves de confidentialité et de sécurité, et des contrôles opérationnels.",
          ],
        },
      ],
    },
  },
  terms: {
    en: {
      title: "Terms and limitations – reviewed",
      status:
        "The accountable owner recorded legal sign-off for these terms on 27 August 2026. That sign-off does not by itself authorize a production release.",
      sections: [
        {
          heading: "Informational record",
          paragraphs: [
            `${enBrand} is an evidence record, not an emergency service, legal opinion, compliance finding, ownership history, merchantable-timber estimate or statement about future wildfire behaviour. Source agencies remain authoritative.`,
          ],
        },
        {
          heading: "Interpretation",
          paragraphs: [
            "Satellite-detected change does not establish cause. A named organisation appears only in the exact role and dated version of an authoritative public record; proximity is never attribution.",
          ],
        },
        {
          heading: "Licences",
          paragraphs: [
            "Code has no open-source licence yet. Data retains source-specific terms. Illustrative fixtures grant no redistribution rights.",
          ],
        },
      ],
    },
    fr: {
      title: "Conditions et limites – examinées",
      status:
        "Le propriétaire responsable a consigné l’approbation juridique de ces conditions le 27 août 2026. Cette approbation n’autorise pas à elle seule une diffusion de production.",
      sections: [
        {
          heading: "Registre d’information",
          paragraphs: [
            `${frBrand} est un registre de preuves, et non un service d’urgence, un avis juridique, une conclusion de conformité, un historique de propriété, une estimation du bois marchand ou une déclaration sur le comportement futur des incendies. Les organismes sources demeurent les autorités.`,
          ],
        },
        {
          heading: "Interprétation",
          paragraphs: [
            "Un changement détecté par satellite n’en établit pas la cause. Une organisation n’est nommée que dans le rôle exact et la version datée d’un registre public faisant autorité; la proximité ne constitue jamais une attribution.",
          ],
        },
        {
          heading: "Licences",
          paragraphs: [
            "Le code ne possède pas encore de licence libre. Les données conservent leurs conditions propres à la source. Les exemples illustratifs n’accordent aucun droit de redistribution.",
          ],
        },
      ],
    },
  },
  releases: {
    en: {
      title: "Data releases",
      status:
        "One bounded technical-preview release is published and indexed here. It is not the production release required to close the formal Phase 2 gate.",
      sections: [
        {
          heading: "Published bounded release",
          paragraphs: [
            `Release ${provinceBulkRelease.id} contains the bounded 2020 to 2022 province aggregate for British Columbia, Alberta, Ontario and Quebec as a CSV and GeoPackage. Each artifact has a published SHA-256, licence attribution, boundary edition and method version.`,
            "This release is a province-level technical preview, not per-cell geometry. All four provinces have some unknown mapped area, so its detected-loss figures are minima. It does not complete the formal Phase 2 gate.",
          ],
          links: [
            { label: "Download the province CSV", href: provinceCsv.url },
            { label: "Download the province GeoPackage", href: provinceGeoPackage.url },
            { label: "Open the machine-readable release manifest", href: provinceBulkManifestUrl },
          ],
        },
        {
          heading: "Formal Phase 2 gate",
          paragraphs: [
            "No production data release satisfying the formal Phase 2 gate exists. The published technical-preview release does not supply the still-missing independent-comparison envelope or turn local per-cell outputs into an admitted production release.",
          ],
        },
        {
          heading: "Citation format",
          paragraphs: [
            `${enBrand}, province aggregate, 2020 to 2022, ${provinceCsv.boundaryEdition}, release ${provinceBulkRelease.id}, method ${provinceCsv.methodVersion}, retrieval date and stable artifact URL. Cite it as a bounded technical preview. A production citation for the formal Phase 2 release cannot be generated until that specific gate has a verified release.`,
          ],
        },
      ],
    },
    fr: {
      title: "Versions des données",
      status:
        "Une version d’aperçu technique limitée est publiée et répertoriée ici. Elle n’est pas la version de production exigée pour satisfaire au critère formel de la phase 2.",
      sections: [
        {
          heading: "Version limitée publiée",
          paragraphs: [
            `La version ${provinceBulkRelease.id} contient l’agrégat provincial limité de 2020 à 2022 pour la Colombie-Britannique, l’Alberta, l’Ontario et le Québec, en formats CSV et GeoPackage. Chaque artefact possède une somme SHA-256 publiée, une attribution de licence, une édition de limite et une version de méthode.`,
            "Cette version est un aperçu technique au niveau provincial, et non une géométrie par cellule. Les quatre provinces comportent une superficie cartographiée inconnue; les valeurs de perte détectée sont donc des minimums. Cette version ne satisfait pas au critère formel de la phase 2.",
          ],
          links: [
            { label: "Télécharger le CSV provincial", href: provinceCsv.url },
            { label: "Télécharger le GeoPackage provincial", href: provinceGeoPackage.url },
            { label: "Ouvrir le manifeste de version lisible par machine", href: provinceBulkManifestUrl },
          ],
        },
        {
          heading: "Critère formel de la phase 2",
          paragraphs: [
            "Aucune version de données de production satisfaisant au critère formel de la phase 2 n’existe. La version d’aperçu technique publiée ne fournit pas l’enveloppe de comparaison indépendante encore manquante et ne transforme pas les sorties locales par cellule en une version de production admise.",
          ],
        },
        {
          heading: "Format de citation",
          paragraphs: [
            `${frBrand}, agrégat provincial, 2020 à 2022, ${provinceCsv.boundaryEdition}, version ${provinceBulkRelease.id}, méthode ${provinceCsv.methodVersion}, date de consultation et URL stable de l’artefact. La citation doit préciser qu’il s’agit d’un aperçu technique limité. Une citation de production pour la version formelle de la phase 2 ne peut être générée avant qu’une version vérifiée ne satisfasse précisément à ce critère.`,
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
        <p className="dek">{page.status}</p>
      </header>
      <div className="content-section prose-measure">
        {page.sections.map((section, index) => (
          <section className="governance-section" key={section.heading}>
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
                  <li className="card card--lift" key={link.href}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </main>
  );
}
