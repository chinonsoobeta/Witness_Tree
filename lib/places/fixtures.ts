import type { ConfidenceResult, CoverageGrade, LocalizedString, Provenance } from "@/lib/domain";
import downloadManifest from "@/data/phase3-example-download-manifest.json";
import { GENERATED_RECORD_KINDS, PLACE_PROVINCES, PLACE_TYPES, type GeneratedLocalizedRecord, type GeneratedPageManifest, type GeneratedRecordKind, type Location, type Place, type PlaceProvince, type PlaceType, type PublicFigure, type PublicNumber, type RegistryEntry } from "./types";
import { coordinatePermalinkId } from "./coordinate-identity";

const local = (en: string, fr: string): LocalizedString => ({ en, fr });
const provenance: Provenance = { dataset: "Synthetic Phase 3 registry", version: "example-unapproved-1.0", retrievedDate: "2026-08-21", licence: "ogl-canada-2.0", recordUrl: "https://example.local/phase3-registry" };
const high: ConfidenceResult = { level: "high", ruleId: "CONF-HIGH-001", reason: local("Synthetic value with complete example lineage; it is not a real-world observation.", "Valeur synthétique avec une filiation d’exemple complète; il ne s’agit pas d’une observation réelle.") };
const limited: ConfidenceResult = { level: "limited", ruleId: "CONF-LIMITED-001", reason: local("Synthetic illustration only; no production source has been integrated.", "Illustration synthétique seulement; aucune source de production n’a été intégrée.") };
const unknownReason = local("No approved production value has been integrated for this field.", "Aucune valeur de production approuvée n’a été intégrée pour ce champ.");

const provinceNames: Record<PlaceProvince, LocalizedString> = {
  BC: local("British Columbia", "Colombie-Britannique"), AB: local("Alberta", "Alberta"), ON: local("Ontario", "Ontario"), QC: local("Quebec", "Québec"),
};
const typeNames: Record<PlaceType, LocalizedString> = {
  province: local("province", "province"), watershed: local("watershed", "bassin versant"), "forest-district": local("forest district", "district forestier"), municipality: local("municipality", "municipalité"),
  "provincial-riding": local("provincial riding", "circonscription provinciale"), "federal-riding": local("federal riding", "circonscription fédérale"), reserve: local("reserve", "réserve"), "treaty-area": local("treaty area", "région visée par un traité"),
};

function figure(value: number, unit: PublicFigure["unit"], coverageGrade: CoverageGrade = "national-baseline"): PublicFigure {
  if (!Number.isFinite(value)) throw new Error("Synthetic public figures must be finite.");
  return { kind: "figure", value, unit, evidence: "derived-estimate", confidence: high, coverageGrade, provenance };
}

function unknown(coverageGrade: CoverageGrade = "national-baseline"): PublicNumber {
  return { kind: "unknown", evidence: "unknown", reason: unknownReason, coverageGrade, provenance };
}

function publicValue(value: PublicNumber): number {
  return value.kind === "figure" ? value.value : Number.NEGATIVE_INFINITY;
}

function downloadFor(placeId: string) {
  const entry = downloadManifest.entries.find((candidate) => candidate.placeId === placeId);
  if (!entry || entry.status !== "example" || entry.reviewStatus !== "unapproved" || entry.productionEligible !== false) throw new Error(`Missing bounded download manifest entry for ${placeId}.`);
  return entry;
}

function route(kind: GeneratedRecordKind, entityId: string, locale: "en" | "fr"): string | null {
  if (kind === "place") return locale === "en" ? `/en/places/${entityId}` : `/fr/lieux/${entityId}`;
  if (kind === "location") return locale === "en" ? `/en/location/${entityId}` : `/fr/emplacement/${entityId}`;
  return null;
}

function entityId(entry: RegistryEntry, kind: GeneratedRecordKind): string {
  return kind === "location" ? entry.location.coordinateId : entry[kind].id;
}

function recordStrings(entry: RegistryEntry, kind: GeneratedRecordKind, locale: "en" | "fr"): Readonly<Record<string, string>> {
  return Object.freeze(locale === "en"
    ? { title: entry.place.name.en, status: "Illustrative, unapproved and nonproduction", recordType: kind }
    : { title: entry.place.name.fr, status: "Illustratif, non approuvé et hors production", recordType: kind });
}

function mdxFor(strings: Readonly<Record<string, string>>, kind: GeneratedRecordKind, id: string): string {
  return `---\nkind: ${kind}\nid: ${id}\nstatus: example\nreviewStatus: unapproved\nproductionEligible: false\n---\n\n# ${strings.title}\n\n${strings.status}\n`;
}

function makeEntry(type: PlaceType, province: PlaceProvince, provinceIndex: number, typeIndex: number): RegistryEntry {
  const index = provinceIndex * PLACE_TYPES.length + typeIndex;
  const id = `${province.toLowerCase()}-${type}`;
  const name = local(`Illustrative ${provinceNames[province].en} ${typeNames[type].en}`, `${provinceNames[province].fr} illustrative — ${typeNames[type].fr}`);
  const coverageGrade: CoverageGrade = province === "QC" && index % 2 === 1 ? "national-baseline-plus-local-context" : "national-baseline";
  const firstId = `${id}-event-2024`;
  const secondId = `${id}-event-2022`;
  const events = [
    { id: firstId, year: figure(2024, "year", coverageGrade), evidence: "official-record" as const, title: local("Illustrative recorded intervention", "Intervention consignée illustrative"), confidence: limited, limitation: limited.reason, provenance },
    { id: secondId, year: figure(2022, "year", coverageGrade), evidence: "satellite-observation" as const, title: local("Illustrative detected tree-cover reduction", "Réduction illustrative du couvert arboré détectée"), confidence: limited, limitation: limited.reason, provenance },
  ];
  const sourceId = `${id}-source`;
  const citationId = `${id}-citation`;
  const downloadId = `${id}-download`;
  const place: Place = {
    status: "example", reviewStatus: "unapproved", productionEligible: false, id, type, province, name, aliases: local(`${name.en} example`, `Exemple ${name.fr}`),
    boundaryEdition: `example-boundary-${province.toLowerCase()}-2026`, boundaryVersion: "example-2026.1", forestHectares: figure(1_000 + index * 10, "ha", coverageGrade),
    coverage: [{ grade: coverageGrade, share: figure(70, "%", coverageGrade) }, { grade: "national-baseline", share: figure(30, "%", "national-baseline") }],
    annual: [{ year: figure(2022, "year", coverageGrade), hectares: figure(8 + (index % 8), "ha", coverageGrade), eventIds: [secondId] }, { year: figure(2024, "year", coverageGrade), hectares: figure(5 + (index % 8), "ha", coverageGrade), eventIds: [firstId] }],
    events, stats: [figure(13 + (index % 8), "ha", coverageGrade), unknown(coverageGrade)], sourceIds: [sourceId], citationId, downloadId,
    ...(type === "reserve" || type === "treaty-area" ? { safeguard: local("Synthetic geography only. This example does not speak for rights holders and is not approved for production.", "Géographie synthétique seulement. Cet exemple ne parle pas au nom des titulaires de droits et n’est pas approuvé pour la production.") } : {}),
  };
  const latitude = 48 + provinceIndex * 2 + typeIndex * .05;
  const longitude = -124 + provinceIndex * 4 + typeIndex * .05;
  const coordinateId = coordinatePermalinkId(latitude, longitude);
  const containingPlaceIds = PLACE_TYPES.map((placeType) => `${province.toLowerCase()}-${placeType}`);
  const downloadEntry = downloadFor(id);
  return {
    place,
    location: { status: "example", reviewStatus: "unapproved", productionEligible: false, coordinateId, summary: local(`Illustrative location in ${name.en}.`, `Emplacement illustratif dans ${name.fr}.`), latitude: figure(latitude, "degrees-latitude", coverageGrade), longitude: figure(longitude, "degrees-longitude", coverageGrade), accuracyMetres: figure(100, "m", coverageGrade), containingPlaceIds, events: [...events].sort((a, b) => publicValue(b.year) - publicValue(a.year)) },
    search: { id: `${id}-search`, placeId: id, name, aliases: place.aliases, status: "example", reviewStatus: "unapproved", productionEligible: false },
    source: { id: sourceId, title: local("Synthetic registry source", "Source synthétique du registre"), provenance, status: "example", reviewStatus: "unapproved", productionEligible: false },
    citation: { id: citationId, sourceIds: [sourceId], timeRange: { from: figure(1984, "year", coverageGrade), to: figure(2025, "year", coverageGrade) }, dataVersion: "example-unapproved-1.0", method: "synthetic-page-generator-1", status: "example", reviewStatus: "unapproved", productionEligible: false },
    download: { id: downloadId, label: local("Download synthetic example CSV", "Télécharger l’exemple CSV synthétique"), mediaType: "text/csv", href: downloadEntry.href, bytes: downloadEntry.bytes, sha256: downloadEntry.sha256, status: "example", reviewStatus: "unapproved", productionEligible: false },
  };
}

export const PLACE_REGISTRY: readonly RegistryEntry[] = Object.freeze(PLACE_PROVINCES.flatMap((province, provinceIndex) => PLACE_TYPES.map((type, typeIndex) => makeEntry(type, province, provinceIndex, typeIndex))));
export const PLACES: readonly Place[] = Object.freeze(PLACE_REGISTRY.map(({ place }) => place));
export const LOCATIONS: readonly Location[] = Object.freeze(PLACE_REGISTRY.map(({ location }) => location));
export const SOURCE_RECORDS = Object.freeze(PLACE_REGISTRY.map(({ source }) => source));

export const GENERATED_RECORDS: readonly GeneratedLocalizedRecord[] = Object.freeze(PLACE_REGISTRY.flatMap((entry) => GENERATED_RECORD_KINDS.flatMap((kind) => (["en", "fr"] as const).map((locale) => {
  const id = entityId(entry, kind);
  const ownRoute = route(kind, id, locale);
  const otherLocale = locale === "en" ? "fr" : "en";
  const strings = recordStrings(entry, kind, locale);
  return Object.freeze({ kind, entityId: id, locale, route: ownRoute, alternate: Object.freeze({ locale: otherLocale, href: route(kind, id, otherLocale) }), strings, mdx: mdxFor(strings, kind, id) });
}))));

const encoder = new TextEncoder();
export const PAGE_COUNT_MANIFEST: GeneratedPageManifest = Object.freeze({
  schemaVersion: "witness-tree/phase3-page-manifest/1", status: "example", reviewStatus: "unapproved", productionEligible: false,
  placeTypes: PLACE_TYPES.length, provinces: PLACE_PROVINCES.length, entities: PLACE_REGISTRY.length,
  localizedRecords: GENERATED_RECORDS.length, localizedStaticPages: GENERATED_RECORDS.filter(({ route: value }) => value !== null).length, recordPairs: PLACE_REGISTRY.length * GENERATED_RECORD_KINDS.length,
  byteLengths: Object.freeze(PLACE_REGISTRY.flatMap((entry) => GENERATED_RECORD_KINDS.map((kind) => {
    const id = entityId(entry, kind);
    const en = GENERATED_RECORDS.find((record) => record.kind === kind && record.entityId === id && record.locale === "en")!;
    const fr = GENERATED_RECORDS.find((record) => record.kind === kind && record.entityId === id && record.locale === "fr")!;
    return Object.freeze({ kind, entityId: id, en: encoder.encode(en.mdx).byteLength, fr: encoder.encode(fr.mdx).byteLength });
  }))),
});

export const placeById = (id: string) => PLACES.find((place) => place.id === id);
export const locationByCoordinateId = (coordinateId: string) => LOCATIONS.find((location) => location.coordinateId === coordinateId);
export const registryEntryByPlaceId = (id: string) => PLACE_REGISTRY.find(({ place }) => place.id === id);
export const registryEntryByCoordinateId = (coordinateId: string) => PLACE_REGISTRY.find(({ location }) => location.coordinateId === coordinateId);
export const localizedRecord = (kind: GeneratedRecordKind, id: string, locale: "en" | "fr") => GENERATED_RECORDS.find((record) => record.kind === kind && record.entityId === id && record.locale === locale);
