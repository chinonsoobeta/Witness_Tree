import { PRODUCT_NAME, type Locale } from "@/lib/domain";

export type GovernancePageKind = "glossary" | "corrections" | "decisions" | "engagement" | "privacy" | "terms" | "releases";

type Section = Readonly<{ heading: string; paragraphs: readonly string[] }>;
type PageCopy = Readonly<{ title: string; status: string; sections: readonly Section[] }>;

const enBrand = PRODUCT_NAME.en;
const frBrand = PRODUCT_NAME.fr;

const PAGES: Record<GovernancePageKind, Record<Locale, PageCopy>> = {
  glossary: {
    en: { title: "Glossary", status: "Draft terminology; professional forestry terminology review is pending.", sections: [
      { heading: "Forest", paragraphs: ["Land of at least 1 hectare, with at least 10% crown closure, carrying trees capable of reaching 5 metres at maturity. Percentages use forested hectares inside the stated boundary edition, not total land area."] },
      { heading: "Evidence", paragraphs: ["Official record: an authoritative public record. Satellite observation: change visible in imagery without, by itself, establishing cause. Derived estimate: a documented calculation. Unknown: no authoritative public record has been integrated for the question."] },
      { heading: "Coverage", paragraphs: ["National baseline, extended record with sparse official matching, or national baseline plus local context. Coverage is a property of mapped area and time, not a province-wide promise."] },
      { heading: "Detected change", paragraphs: ["A satellite-observed change in tree cover. It is not, by itself, a claim of logging, deforestation, illegality or responsibility."] },
    ] },
    fr: { title: "Glossaire", status: "Terminologie provisoire; la révision professionnelle de la terminologie forestière reste à faire.", sections: [
      { heading: "Forêt", paragraphs: ["Terre d’au moins 1 hectare, présentant un couvert de cimes d’au moins 10 %, avec des arbres capables d’atteindre 5 mètres à maturité. Les pourcentages utilisent les hectares forestiers dans l’édition de limite indiquée, et non la superficie terrestre totale."] },
      { heading: "Preuves", paragraphs: ["Registre officiel : registre public faisant autorité. Observation satellitaire : changement visible dans les images qui, à lui seul, n’en établit pas la cause. Estimation dérivée : calcul documenté. Inconnu : aucun registre public faisant autorité n’a été intégré pour la question."] },
      { heading: "Couverture", paragraphs: ["Référence nationale, registre étendu avec appariement officiel limité, ou référence nationale avec contexte local. La couverture est une propriété de la zone cartographiée et de la période, et non une promesse à l’échelle provinciale."] },
      { heading: "Changement détecté", paragraphs: ["Changement du couvert arboré observé par satellite. À lui seul, il ne constitue pas une affirmation d’exploitation, de déforestation, d’illégalité ou de responsabilité."] },
    ] },
  },
  corrections: {
    en: { title: "Corrections", status: "No production correction has been filed because no production data has been published.", sections: [
      { heading: "Service levels", paragraphs: ["Critical: acknowledge within 1 business day and resolve within 5. Indigenous geography content: 1 and 10. Material: 3 and 15. Minor: 5 and 30."] },
      { heading: "Public record", paragraphs: ["Every correction will state what was wrong, what it is now and why it changed, in English and French on the same day. Previous figures will remain addressable, and people previously notified will receive a correction alert."] },
      { heading: "Contact status", paragraphs: ["A named accountable recipient and tested intake channel have not yet been appointed. The route will not claim to accept cases until that external governance gate is complete."] },
    ] },
    fr: { title: "Corrections", status: "Aucune correction de production n’a été déposée, car aucune donnée de production n’a été publiée.", sections: [
      { heading: "Délais de service", paragraphs: ["Critique : accusé de réception dans un jour ouvrable et résolution dans cinq. Contenu de géographie autochtone : un et dix. Important : trois et quinze. Mineur : cinq et trente."] },
      { heading: "Registre public", paragraphs: ["Chaque correction indiquera ce qui était erroné, la nouvelle information et la raison du changement, en français et en anglais le même jour. Les anciennes valeurs resteront accessibles et les personnes déjà avisées recevront une alerte de correction."] },
      { heading: "État du contact", paragraphs: ["Un destinataire responsable désigné et un canal de réception testé n’ont pas encore été établis. Cette route ne prétendra pas accepter des dossiers avant la réalisation de cette condition de gouvernance externe."] },
    ] },
  },
  decisions: {
    en: { title: "Decision log", status: "Decisions transcribed from implementation plan version 2, dated 11 August 2026.", sections: [
      { heading: "Product", paragraphs: [`Working name: ${enBrand}. Record starts in 1984; the default view starts in 2000. Scope is British Columbia, Alberta, Ontario and Quebec.`, "NTEMS is the satellite spine. Live wildfire, riding comparison, accounts and alerts, reserve and treaty pages are in version 1. Advanced layer controls and asserted traditional territories are excluded."] },
      { heading: "Product name", paragraphs: [`The owner retained ${enBrand} / ${frBrand} and decided not to pursue Mistik or an Indigenous engagement process. No Mistik request, permission, honorarium or terms exist, and the product must not imply otherwise.`] },
      { heading: "Legal sign-off", paragraphs: ["The accountable owner recorded full bilingual legal sign-off on 27 August 2026 for the current defamation safeguards, disclaimers, terms, privacy notice, licensing and attribution rules, account and alert controls, and correction and dispute routes. This owner record is not represented as an independent counsel opinion and does not grant missing source rights or approve a later materially changed scope."] },
      { heading: "Change control", paragraphs: ["Method changes, new sources and changes to published figures require future editorial-board approval. No board has yet been appointed."] },
    ] },
    fr: { title: "Registre des décisions", status: "Décisions transcrites de la version 2 du plan de mise en œuvre, datée du 11 août 2026.", sections: [
      { heading: "Produit", paragraphs: [`Nom de travail : ${frBrand}. Le registre commence en 1984; la vue par défaut commence en 2000. La portée comprend la Colombie-Britannique, l’Alberta, l’Ontario et le Québec.`, "NTEMS constitue la base satellitaire. Les incendies actuels, la comparaison des circonscriptions, les comptes et alertes ainsi que les pages de réserves et de traités sont prévus dans la version 1. Les commandes avancées de couches et les territoires traditionnels revendiqués sont exclus."] },
      { heading: "Nom du produit", paragraphs: [`Le propriétaire a retenu ${enBrand} / ${frBrand} et a décidé de ne pas poursuivre Mistik ni un processus de dialogue avec les peuples autochtones. Il n’existe aucune demande, permission, aucun honoraire ni aucune condition concernant Mistik, et le produit ne doit pas laisser entendre le contraire.`] },
      { heading: "Approbation juridique", paragraphs: ["Le 27 août 2026, le propriétaire responsable a consigné une approbation juridique bilingue complète des mesures contre la diffamation, des avertissements, des conditions, de l’avis de confidentialité, des règles de licence et d’attribution, des contrôles des comptes et des alertes, ainsi que des voies de correction et de contestation actuels. Ce registre du propriétaire n’est pas présenté comme un avis d’un conseiller juridique indépendant et n’accorde aucun droit manquant sur une source ni aucune approbation d’une portée ultérieure sensiblement modifiée."] },
      { heading: "Contrôle des changements", paragraphs: ["Les changements de méthode, les nouvelles sources et les modifications de valeurs publiées devront être approuvés par un futur comité éditorial. Aucun comité n’a encore été nommé."] },
    ] },
  },
  engagement: {
    en: { title: "Indigenous engagement", status: "The owner decided on 27 August 2026 not to operate an Indigenous engagement program for this product.", sections: [
      { heading: "Scope decision", paragraphs: ["No engagement contact route, contact register, Mistik request, or engagement outcome will be represented as existing. Reserve and treaty production surfaces remain unavailable unless a later owner decision establishes the necessary source authority and accountable right-of-reply operation."] },
      { heading: "Name-request record", paragraphs: [`Mistik request: not opened. Terms: none. Honorarium: none. Permission: none. Final outcome: not pursued; ${enBrand} / ${frBrand} retained.`] },
      { heading: "Safeguards", paragraphs: ["Reserve and treaty boundaries are administrative and legal records; they do not describe the full extent of Indigenous lands, rights, title or relationships. No ranking, rights finding, consent finding or compliance claim applies to these geographies.", "A treaty boundary is the boundary of an agreement as recorded by the Crown, not the boundary of a nation. Small areas below the resolution threshold will show the raw record without a computed rate."] },
      { heading: "Public register", paragraphs: ["Contacts made: none. Responses received: none. Confidential contacts, when requested, will not be identified publicly."] },
    ] },
    fr: { title: "Dialogue avec les peuples autochtones", status: "Le propriétaire a décidé le 27 août 2026 de ne pas exploiter de programme de dialogue avec les peuples autochtones pour ce produit.", sections: [
      { heading: "Décision sur la portée", paragraphs: ["Aucune voie de dialogue, aucun registre de contacts, aucune demande concernant Mistik ni aucun résultat de dialogue ne seront présentés comme existants. Les surfaces de production sur les réserves et les traités demeurent indisponibles à moins qu’une décision ultérieure du propriétaire n’établisse l’autorité nécessaire sur les sources et un mécanisme responsable de droit de réponse."] },
      { heading: "Registre de la demande de nom", paragraphs: [`Demande concernant Mistik : non ouverte. Conditions : aucune. Honoraire : aucun. Permission : aucune. Résultat final : non poursuivie; ${enBrand} / ${frBrand} sont retenus.`] },
      { heading: "Mesures de protection", paragraphs: ["Les limites de réserves et de traités sont des registres administratifs et juridiques; elles ne décrivent pas toute l’étendue des terres, droits, titres ou relations autochtones. Aucun classement ni aucune conclusion sur les droits, le consentement ou la conformité ne s’applique à ces géographies.", "Une limite de traité est la limite d’un accord consigné par la Couronne, et non la limite d’une nation. Les petites superficies sous le seuil de résolution présenteront le registre brut sans taux calculé."] },
      { heading: "Registre public", paragraphs: ["Contacts établis : aucun. Réponses reçues : aucune. Les contacts confidentiels ne seront pas identifiés publiquement lorsqu’une demande en ce sens est formulée."] },
    ] },
  },
  privacy: {
    en: { title: "Privacy notice – pre-activation", status: `The current notice has owner-recorded legal sign-off. Accounts are not active and ${enBrand} currently stores no account, email or saved-area data.`, sections: [
      { heading: "Planned minimum data", paragraphs: ["With explicit consent: email, password hash, locale, saved geometries, alert preferences and send history. Saved areas will be treated as sensitive and will not be joined to analytics identifiers or written to logs."] },
      { heading: "Planned controls", paragraphs: ["Database-enforced row-level isolation, encryption at rest, verified email, one-click unsubscribe, deletion within 30 days, send-history purge after 24 months, no tracking pixels and one transactional provider carrying the minimum payload."] },
      { heading: "Hosting", paragraphs: ["Canadian hosting for account data is required but has not been selected or verified. Accounts cannot launch until the location, privacy and security evidence, and operational controls are published."] },
    ] },
    fr: { title: "Avis de confidentialité – avant activation", status: `L’avis actuel a reçu l’approbation juridique consignée du propriétaire. Les comptes ne sont pas actifs et ${frBrand} ne conserve actuellement aucune donnée de compte, d’adresse courriel ou de zone enregistrée.`, sections: [
      { heading: "Données minimales prévues", paragraphs: ["Avec consentement explicite : adresse courriel, condensat du mot de passe, langue, géométries enregistrées, préférences d’alerte et historique d’envoi. Les zones enregistrées seront traitées comme sensibles et ne seront ni reliées à un identifiant analytique ni inscrites dans les journaux."] },
      { heading: "Contrôles prévus", paragraphs: ["Isolement des lignes imposé par la base de données, chiffrement au repos, courriel vérifié, désabonnement en un clic, suppression dans les 30 jours, purge de l’historique d’envoi après 24 mois, aucun pixel de suivi et un seul fournisseur transactionnel recevant le minimum de données."] },
      { heading: "Hébergement", paragraphs: ["L’hébergement canadien des données de compte est exigé, mais n’a pas encore été choisi ou vérifié. Les comptes ne peuvent être lancés avant la publication du lieu, des preuves de confidentialité et de sécurité, et des contrôles opérationnels."] },
    ] },
  },
  terms: {
    en: { title: "Terms and limitations – reviewed", status: "The accountable owner recorded legal sign-off for these terms on 27 August 2026. That sign-off does not by itself authorize a production release.", sections: [
      { heading: "Informational record", paragraphs: [`${enBrand} is an evidence record, not an emergency service, legal opinion, compliance finding, ownership history, merchantable-timber estimate or statement about future wildfire behaviour. Source agencies remain authoritative.`] },
      { heading: "Interpretation", paragraphs: ["Satellite-observed change does not establish cause. A named organisation appears only in the exact role and dated version of an authoritative public record; proximity is never attribution."] },
      { heading: "Licences", paragraphs: ["Code has no open-source licence yet. Data retains source-specific terms. Illustrative fixtures grant no redistribution rights."] },
    ] },
    fr: { title: "Conditions et limites – examinées", status: "Le propriétaire responsable a consigné l’approbation juridique de ces conditions le 27 août 2026. Cette approbation n’autorise pas à elle seule une diffusion de production.", sections: [
      { heading: "Registre d’information", paragraphs: [`${frBrand} est un registre de preuves, et non un service d’urgence, un avis juridique, une conclusion de conformité, un historique de propriété, une estimation du bois marchand ou une déclaration sur le comportement futur des incendies. Les organismes sources demeurent les autorités.`] },
      { heading: "Interprétation", paragraphs: ["Un changement observé par satellite n’en établit pas la cause. Une organisation n’est nommée que dans le rôle exact et la version datée d’un registre public faisant autorité; la proximité ne constitue jamais une attribution."] },
      { heading: "Licences", paragraphs: ["Le code ne possède pas encore de licence libre. Les données conservent leurs conditions propres à la source. Les exemples illustratifs n’accordent aucun droit de redistribution."] },
    ] },
  },
  releases: {
    en: { title: "Data releases", status: "No production data release exists. The current repository contains only an illustrative source-ledger fixture.", sections: [
      { heading: "Future manifests", paragraphs: ["Every release will state its ID and date, latest data end year, boundary edition, method version, bilingual note, corrections link and stale or degraded state. Every artifact requires a licence ID and immutable SHA-256."] },
      { heading: "Citation format", paragraphs: [`${enBrand}, place or record title, time range, boundary edition, data release ID, method version, retrieval date and stable URL. No production citation can be generated until a verified release exists.`] },
    ] },
    fr: { title: "Versions des données", status: "Aucune version de données de production n’existe. Le dépôt actuel ne contient qu’un exemple illustratif de registre des sources.", sections: [
      { heading: "Manifestes futurs", paragraphs: ["Chaque version indiquera son identifiant et sa date, la dernière année de données, l’édition de limite, la version de méthode, une note bilingue, le lien de correction et l’état périmé ou dégradé. Chaque artefact exige un identifiant de licence et une somme SHA-256 immuable."] },
      { heading: "Format de citation", paragraphs: [`${frBrand}, titre du lieu ou du dossier, période, édition de limite, identifiant de version des données, version de méthode, date de consultation et URL stable. Aucune citation de production ne peut être générée avant l’existence d’une version vérifiée.`] },
    ] },
  },
};

export function GovernancePage({ kind, locale }: Readonly<{ kind: GovernancePageKind; locale: Locale }>) {
  const page = PAGES[kind][locale];
  return <main id="main" className="page-wrap"><header className="masthead"><h1>{page.title}</h1><p className="dek">{page.status}</p></header><div className="content-section prose-measure">
    {page.sections.map((section) => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}
  </div></main>;
}
