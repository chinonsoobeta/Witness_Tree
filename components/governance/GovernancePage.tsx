import type { Locale } from "@/lib/domain";

export type GovernancePageKind = "glossary" | "corrections" | "decisions" | "engagement" | "privacy" | "terms" | "releases";

type Section = Readonly<{ heading: string; paragraphs: readonly string[] }>;
type PageCopy = Readonly<{ title: string; status: string; sections: readonly Section[] }>;

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
      { heading: "Product", paragraphs: ["Working name: Witness Tree. Record starts in 1984; the default view starts in 2000. Scope is British Columbia, Alberta, Ontario and Quebec.", "NTEMS is the satellite spine. Live wildfire, riding comparison, accounts and alerts, reserve and treaty pages are in version 1. Advanced layer controls and asserted traditional territories are excluded."] },
      { heading: "Mistik request", paragraphs: ["Mistik is not an approved product name. No request outcome, permission, honorarium or terms exist yet. The working name remains Witness Tree unless written permission is obtained through the engagement process."] },
      { heading: "Change control", paragraphs: ["Method changes, new sources and changes to published figures require future editorial-board approval. No board has yet been appointed."] },
    ] },
    fr: { title: "Registre des décisions", status: "Décisions transcrites de la version 2 du plan de mise en œuvre, datée du 11 août 2026.", sections: [
      { heading: "Produit", paragraphs: ["Nom de travail : Witness Tree. Le registre commence en 1984; la vue par défaut commence en 2000. La portée comprend la Colombie-Britannique, l’Alberta, l’Ontario et le Québec.", "NTEMS constitue la base satellitaire. Les incendies actuels, la comparaison des circonscriptions, les comptes et alertes ainsi que les pages de réserves et de traités sont prévus dans la version 1. Les commandes avancées de couches et les territoires traditionnels revendiqués sont exclus."] },
      { heading: "Demande concernant Mistik", paragraphs: ["Mistik n’est pas un nom de produit approuvé. Aucun résultat de demande, aucune permission, aucun honoraire ni aucune condition n’existent encore. Le nom de travail demeure Witness Tree sauf obtention d’une permission écrite par le processus de dialogue."] },
      { heading: "Contrôle des changements", paragraphs: ["Les changements de méthode, les nouvelles sources et les modifications de valeurs publiées devront être approuvés par un futur comité éditorial. Aucun comité n’a encore été nommé."] },
    ] },
  },
  engagement: {
    en: { title: "Indigenous engagement", status: "No engagement contact has been made or recorded. A named engagement lead and funded contact process remain external gates.", sections: [
      { heading: "Commitment", paragraphs: ["Before reserve or treaty records are presented as production pages, affected First Nations, Métis and Inuit governments and organisations will be offered a briefing and a right of reply. A dedicated named contact will commit to respond within 5 business days."] },
      { heading: "Safeguards", paragraphs: ["Reserve and treaty boundaries are administrative and legal records; they do not describe the full extent of Indigenous lands, rights, title or relationships. No ranking, rights finding, consent finding or compliance claim applies to these geographies.", "A treaty boundary is the boundary of an agreement as recorded by the Crown, not the boundary of a nation. Small areas below the resolution threshold will show the raw record without a computed rate."] },
      { heading: "Public register", paragraphs: ["Contacts made: none. Responses received: none. Confidential contacts, when requested, will not be identified publicly."] },
    ] },
    fr: { title: "Dialogue avec les peuples autochtones", status: "Aucun contact de dialogue n’a été établi ou consigné. La nomination d’une personne responsable et le financement du processus demeurent des conditions externes.", sections: [
      { heading: "Engagement", paragraphs: ["Avant que les dossiers de réserves ou de traités soient présentés comme pages de production, les gouvernements et organismes des Premières Nations, des Métis et des Inuit concernés se verront offrir une séance d’information et un droit de réponse. Une personne-ressource désignée s’engagera à répondre dans un délai de cinq jours ouvrables."] },
      { heading: "Mesures de protection", paragraphs: ["Les limites de réserves et de traités sont des registres administratifs et juridiques; elles ne décrivent pas toute l’étendue des terres, droits, titres ou relations autochtones. Aucun classement ni aucune conclusion sur les droits, le consentement ou la conformité ne s’applique à ces géographies.", "Une limite de traité est la limite d’un accord consigné par la Couronne, et non la limite d’une nation. Les petites superficies sous le seuil de résolution présenteront le registre brut sans taux calculé."] },
      { heading: "Registre public", paragraphs: ["Contacts établis : aucun. Réponses reçues : aucune. Les contacts confidentiels ne seront pas identifiés publiquement lorsqu’une demande en ce sens est formulée."] },
    ] },
  },
  privacy: {
    en: { title: "Privacy notice — draft", status: "Accounts are not active and Witness Tree currently stores no account, email or saved-area data.", sections: [
      { heading: "Planned minimum data", paragraphs: ["With explicit consent: email, password hash, locale, saved geometries, alert preferences and send history. Saved areas will be treated as sensitive and will not be joined to analytics identifiers or written to logs."] },
      { heading: "Planned controls", paragraphs: ["Database-enforced row-level isolation, encryption at rest, verified email, one-click unsubscribe, deletion within 30 days, send-history purge after 24 months, no tracking pixels and one transactional provider carrying the minimum payload."] },
      { heading: "Hosting", paragraphs: ["Canadian hosting for account data is required but has not been selected or verified. Accounts cannot launch until the location and legal review are published."] },
    ] },
    fr: { title: "Avis de confidentialité — ébauche", status: "Les comptes ne sont pas actifs et Witness Tree ne conserve actuellement aucune donnée de compte, d’adresse courriel ou de zone enregistrée.", sections: [
      { heading: "Données minimales prévues", paragraphs: ["Avec consentement explicite : adresse courriel, condensat du mot de passe, langue, géométries enregistrées, préférences d’alerte et historique d’envoi. Les zones enregistrées seront traitées comme sensibles et ne seront ni reliées à un identifiant analytique ni inscrites dans les journaux."] },
      { heading: "Contrôles prévus", paragraphs: ["Isolement des lignes imposé par la base de données, chiffrement au repos, courriel vérifié, désabonnement en un clic, suppression dans les 30 jours, purge de l’historique d’envoi après 24 mois, aucun pixel de suivi et un seul fournisseur transactionnel recevant le minimum de données."] },
      { heading: "Hébergement", paragraphs: ["L’hébergement canadien des données de compte est exigé, mais n’a pas encore été choisi ou vérifié. Les comptes ne peuvent être lancés avant la publication du lieu et de l’examen juridique."] },
    ] },
  },
  terms: {
    en: { title: "Terms and limitations — draft", status: "These terms have not received legal review and do not authorize a production release.", sections: [
      { heading: "Informational record", paragraphs: ["Witness Tree is an evidence record, not an emergency service, legal opinion, compliance finding, ownership history, merchantable-timber estimate or wildfire forecast. Source agencies remain authoritative."] },
      { heading: "Interpretation", paragraphs: ["Satellite-observed change does not establish cause. A named organisation appears only in the exact role and dated version of an authoritative public record; proximity is never attribution."] },
      { heading: "Licences", paragraphs: ["Code has no open-source licence yet. Data retains source-specific terms. Illustrative fixtures grant no redistribution rights."] },
    ] },
    fr: { title: "Conditions et limites — ébauche", status: "Ces conditions n’ont pas fait l’objet d’un examen juridique et n’autorisent pas une diffusion de production.", sections: [
      { heading: "Registre d’information", paragraphs: ["Witness Tree est un registre de preuves, et non un service d’urgence, un avis juridique, une conclusion de conformité, un historique de propriété, une estimation du bois marchand ou une prévision d’incendie. Les organismes sources demeurent les autorités."] },
      { heading: "Interprétation", paragraphs: ["Un changement observé par satellite n’en établit pas la cause. Une organisation n’est nommée que dans le rôle exact et la version datée d’un registre public faisant autorité; la proximité ne constitue jamais une attribution."] },
      { heading: "Licences", paragraphs: ["Le code ne possède pas encore de licence libre. Les données conservent leurs conditions propres à la source. Les exemples illustratifs n’accordent aucun droit de redistribution."] },
    ] },
  },
  releases: {
    en: { title: "Data releases", status: "No production data release exists. The current repository contains only an illustrative source-ledger fixture.", sections: [
      { heading: "Future manifests", paragraphs: ["Every release will state its ID and date, latest data end year, boundary edition, method version, bilingual note, corrections link and stale or degraded state. Every artifact requires a licence ID and immutable SHA-256."] },
      { heading: "Citation format", paragraphs: ["Witness Tree, place or record title, time range, boundary edition, data release ID, method version, retrieval date and stable URL. No production citation can be generated until a verified release exists."] },
    ] },
    fr: { title: "Versions des données", status: "Aucune version de données de production n’existe. Le dépôt actuel ne contient qu’un exemple illustratif de registre des sources.", sections: [
      { heading: "Manifestes futurs", paragraphs: ["Chaque version indiquera son identifiant et sa date, la dernière année de données, l’édition de limite, la version de méthode, une note bilingue, le lien de correction et l’état périmé ou dégradé. Chaque artefact exige un identifiant de licence et une somme SHA-256 immuable."] },
      { heading: "Format de citation", paragraphs: ["Witness Tree, titre du lieu ou du dossier, période, édition de limite, identifiant de version des données, version de méthode, date de consultation et URL stable. Aucune citation de production ne peut être générée avant l’existence d’une version vérifiée."] },
    ] },
  },
};

export function GovernancePage({ kind, locale }: Readonly<{ kind: GovernancePageKind; locale: Locale }>) {
  const page = PAGES[kind][locale];
  return <main id="main" className="page-wrap"><header className="masthead"><h1>{page.title}</h1><p className="dek">{page.status}</p></header><div className="content-section prose-measure">
    {page.sections.map((section) => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}
  </div></main>;
}
