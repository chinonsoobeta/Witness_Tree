import type { LocalizedString } from "@/lib/domain";
import { PLACE_REGISTRY, SOURCE_RECORDS, type RegistryEntry, type SourceRecord } from "@/lib/places";

const local = (en: string, fr: string): LocalizedString => ({ en, fr });

export const PUBLIC_CONTENT_KINDS = ["methods", "data", "glossary", "corrections"] as const;
export type PublicContentKind = (typeof PUBLIC_CONTENT_KINDS)[number];
export type PublicContentLink = Readonly<{ label: LocalizedString; href: string }>;
export type PublicContentSection = Readonly<{ id: string; heading: LocalizedString; paragraphs: readonly LocalizedString[]; links?: readonly PublicContentLink[] }>;
export type PublicContentRecord = Readonly<{
  kind: PublicContentKind; title: LocalizedString; status: LocalizedString; sections: readonly PublicContentSection[]; sourceLedger: boolean;
  recordStatus: "example"; reviewStatus: "unapproved"; productionEligible: false;
}>;

const bounded = { recordStatus: "example" as const, reviewStatus: "unapproved" as const, productionEligible: false as const };

export const PUBLIC_CONTENT_REGISTRY: readonly PublicContentRecord[] = Object.freeze([
  { ...bounded, kind: "methods", sourceLedger: false, title: local("Methodology", "Méthodologie"), status: local("Illustrative methodology; unapproved and nonproduction.", "Méthodologie illustrative; non approuvée et hors production."), sections: [
    { id: "forest", heading: local("Forest definition", "Définition de la forêt"), paragraphs: [local("Forest is land of at least 1 hectare, with at least 10% crown closure, carrying trees capable of reaching 5 metres at maturity.", "La forêt est une terre d’au moins 1 hectare, présentant un couvert de cimes d’au moins 10 %, avec des arbres capables d’atteindre 5 mètres à maturité.")] },
    { id: "denominator", heading: local("Denominator and period", "Dénominateur et période"), paragraphs: [local("Percentages use forested hectares inside the applicable boundary edition, with the forest mask from the first year of the requested range. Coverage begins in 1984; the default view begins in 2000. Total land area is not a denominator.", "Les pourcentages utilisent les hectares forestiers à l’intérieur de l’édition de limite applicable, avec le masque forestier de la première année de la période demandée. La couverture commence en 1984; la vue par défaut commence en 2000. La superficie totale des terres n’est pas un dénominateur.")] },
    { id: "coverage", heading: local("Geographic coverage", "Couverture géographique"), paragraphs: [local("The national baseline covers British Columbia, Alberta, Ontario and Quebec. Quebec north of 52° is shown as national baseline, not as enhanced local coverage. Coverage is intersected from mapped geometry, not inferred from a province label.", "La référence nationale couvre la Colombie-Britannique, l’Alberta, l’Ontario et le Québec. Le Québec au nord du 52e degré est présenté comme référence nationale, et non comme couverture locale enrichie. La couverture est obtenue par intersection de la géométrie cartographiée et non déduite d’une étiquette provinciale.")] },
    { id: "evidence", heading: local("Evidence and confidence", "Preuves et confiance"), paragraphs: [local("Each public claim is classified as an official record, satellite observation, derived estimate or unknown. Confidence always includes its generated reason; colour alone does not communicate confidence.", "Chaque affirmation publique est classée comme registre officiel, observation satellitaire, estimation dérivée ou inconnue. La confiance comprend toujours sa raison générée; la couleur seule ne communique pas la confiance.")] },
    { id: "matching", heading: local("Matching and precedence", "Appariement et priorité"), paragraphs: [local("Detected change matches an official record when overlap is at least 50% of the smaller geometry. Date tolerance is ±2 years, widened to ±3 years before 1995. Precedence is fire; recorded harvest; recorded insect or disease disturbance; other recorded intervention; then detected change with no matching record. Overlapping evidence is retained.", "Un changement détecté correspond à un registre officiel lorsque le chevauchement atteint au moins 50 % de la plus petite géométrie. La tolérance est de ±2 ans, portée à ±3 ans avant 1995. La priorité est : incendie; récolte consignée; perturbation consignée par insectes ou maladie; autre intervention consignée; puis changement détecté sans registre correspondant. Les preuves qui se chevauchent sont conservées.")] },
    { id: "limits", heading: local("What this record does not claim", "Ce que ce registre n’affirme pas"), paragraphs: [local("A detected change is not labelled as logging, deforestation, a compliance finding or a named responsible organisation. Missing authoritative records remain Unknown rather than becoming a numeric value.", "Un changement détecté n’est pas qualifié d’exploitation, de déforestation, de constat de conformité ni attribué à une organisation responsable nommée. L’absence de registre faisant autorité demeure inconnue plutôt que de devenir une valeur numérique.")] },
  ] },
  { ...bounded, kind: "data", sourceLedger: true, title: local("Data and transparency", "Données et transparence"), status: local("Illustrative source-ledger entries only; no production source is registered.", "Entrées illustratives du registre des sources seulement; aucune source de production n’est enregistrée."), sections: [
    { id: "ledger", heading: local("Illustrative source ledger", "Registre illustratif des sources"), paragraphs: [local("The registered entries below supply the exact source identifiers used by synthetic citations. Each retains dataset, version, retrieval date and licence provenance.", "Les entrées enregistrées ci-dessous fournissent les identifiants de source exacts utilisés par les citations synthétiques. Chacune conserve la provenance du jeu de données, de la version, de la date de récupération et de la licence.")], links: [
      { label: local("Read the source-ledger documentation", "Lire la documentation du registre des sources"), href: "https://github.com/chinonsoobeta/Witness_Tree/blob/main/docs/SOURCE_LEDGER.md" },
    ] },
    { id: "staging", heading: local("Verified local staging", "Mise en attente locale vérifiée"), paragraphs: [local("Two source archives have verified byte lengths, ZIP integrity and SHA-256 checksums in a separate local staging area. A lossless local copy of two clean Québec layers is checksum-bound but is not ingested, immutable or production data. Profiling found 608 self-intersections in Alberta, so Alberta remains blocked.", "Deux archives sources ont une taille en octets, une intégrité ZIP et une somme SHA-256 vérifiées dans une zone locale distincte. Une copie locale sans perte de deux couches québécoises propres est liée par somme de contrôle, mais elle n’est ni ingérée, ni immuable, ni une donnée de production. Le profilage a relevé 608 auto-intersections en Alberta; l’Alberta demeure bloquée.")], links: [
      { label: local("Review staged-acquisition evidence", "Consulter les preuves de mise en attente"), href: "https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/staged-acquisitions.json" },
      { label: local("Review the geospatial profile", "Consulter le profil géospatial"), href: "https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/staged-geospatial-profile.json" },
      { label: local("Review Québec transformation evidence", "Consulter les preuves de transformation du Québec"), href: "https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/transformation-runs/qc-historic-wildfire-v1-2026-08-12.json" },
    ] },
  ] },
  { ...bounded, kind: "glossary", sourceLedger: false, title: local("Glossary", "Glossaire"), status: local("Draft terminology; professional forestry review remains pending.", "Terminologie provisoire; la révision professionnelle forestière reste à faire."), sections: [
    { id: "forest", heading: local("Forest", "Forêt"), paragraphs: [local("Land of at least 1 hectare, with at least 10% crown closure and trees capable of reaching 5 metres at maturity.", "Terre d’au moins 1 hectare, présentant un couvert de cimes d’au moins 10 % et des arbres capables d’atteindre 5 mètres à maturité.")] },
    { id: "evidence", heading: local("Evidence", "Preuves"), paragraphs: [local("Official record is authoritative public evidence; satellite observation does not establish cause; derived estimate is documented calculation; Unknown means no authoritative record was integrated.", "Un registre officiel est une preuve publique faisant autorité; une observation satellitaire n’établit pas la cause; une estimation dérivée est un calcul documenté; Inconnu signifie qu’aucun registre faisant autorité n’a été intégré.")] },
    { id: "coverage", heading: local("Coverage", "Couverture"), paragraphs: [local("Coverage is a property of mapped area and time, not a province-wide promise.", "La couverture est une propriété de la zone cartographiée et de la période, et non une promesse à l’échelle provinciale.")] },
    { id: "change", heading: local("Detected change", "Changement détecté"), paragraphs: [local("A satellite-observed change in tree cover; not by itself a claim of logging, deforestation, illegality or responsibility.", "Un changement du couvert arboré observé par satellite; il ne constitue pas à lui seul une affirmation d’exploitation, de déforestation, d’illégalité ou de responsabilité.")] },
  ] },
  { ...bounded, kind: "corrections", sourceLedger: false, title: local("Corrections", "Corrections"), status: local("No production correction exists because no production data has been published.", "Aucune correction de production n’existe, car aucune donnée de production n’a été publiée."), sections: [
    { id: "service", heading: local("Service levels", "Délais de service"), paragraphs: [local("Critical: acknowledge within 1 business day and resolve within 5. Indigenous geography content: 1 and 10. Material: 3 and 15. Minor: 5 and 30.", "Critique : accusé de réception dans un jour ouvrable et résolution dans cinq. Contenu de géographie autochtone : un et dix. Important : trois et quinze. Mineur : cinq et trente.")] },
    { id: "record", heading: local("Public record", "Registre public"), paragraphs: [local("Every correction will state what changed and why in English and French on the same day; previous figures remain addressable.", "Chaque correction indiquera ce qui a changé et pourquoi en français et en anglais le même jour; les anciennes valeurs resteront accessibles.")] },
    { id: "contact", heading: local("Contact status", "État du contact"), paragraphs: [local("No named accountable recipient or tested intake channel exists. This route does not accept cases.", "Aucun destinataire responsable désigné ni canal de réception testé n’existe. Cette route n’accepte pas de dossiers.")] },
  ] },
]);

export const PUBLIC_INFORMATION_REGISTRY = Object.freeze({
  schemaVersion: "witness-tree/phase3-public-information/1" as const,
  recordStatus: "example" as const,
  reviewStatus: "unapproved" as const,
  productionEligible: false as const,
  pages: PUBLIC_CONTENT_REGISTRY,
  sources: SOURCE_RECORDS,
});

function requireLocalized(value: unknown, context: string): asserts value is LocalizedString {
  if (!value || typeof value !== "object" || typeof (value as LocalizedString).en !== "string" || !(value as LocalizedString).en.trim() || typeof (value as LocalizedString).fr !== "string" || !(value as LocalizedString).fr.trim()) throw new Error(`${context} requires both English and French content.`);
}

export function validatePublicContentRegistry(pages: readonly PublicContentRecord[] = PUBLIC_INFORMATION_REGISTRY.pages, sources: readonly SourceRecord[] = PUBLIC_INFORMATION_REGISTRY.sources, entries: readonly RegistryEntry[] = PLACE_REGISTRY) {
  if (pages.length !== PUBLIC_CONTENT_KINDS.length || new Set(pages.map(({ kind }) => kind)).size !== PUBLIC_CONTENT_KINDS.length || PUBLIC_CONTENT_KINDS.some((kind) => !pages.some((page) => page.kind === kind))) throw new Error("Public content registry must contain each required surface exactly once.");
  for (const page of pages) {
    if (page.recordStatus !== "example" || page.reviewStatus !== "unapproved" || page.productionEligible !== false) throw new Error(`${page.kind} must remain example, unapproved and nonproduction.`);
    requireLocalized(page.title, `${page.kind} title`); requireLocalized(page.status, `${page.kind} status`);
    if (!page.sections.length) throw new Error(`${page.kind} requires content sections.`);
    for (const section of page.sections) { requireLocalized(section.heading, `${page.kind}/${section.id} heading`); for (const paragraph of section.paragraphs) requireLocalized(paragraph, `${page.kind}/${section.id} paragraph`); for (const link of section.links ?? []) requireLocalized(link.label, `${page.kind}/${section.id} link`); }
  }
  const sourceIds = new Set(sources.map(({ id }) => id));
  if (sourceIds.size !== sources.length) throw new Error("Registered source IDs must be unique.");
  for (const source of sources) requireLocalized(source.title, `${source.id} title`);
  for (const entry of entries) for (const sourceId of [...entry.place.sourceIds, ...entry.citation.sourceIds]) if (!sourceIds.has(sourceId)) throw new Error(`Unregistered source ${sourceId} referenced by ${entry.place.id}.`);
  return { pages: pages.length, sources: sources.length, citations: entries.length };
}

export function publicContent(kind: PublicContentKind) {
  const page = PUBLIC_CONTENT_REGISTRY.find((record) => record.kind === kind);
  if (!page) throw new Error(`Missing public content record: ${kind}.`);
  return page;
}
