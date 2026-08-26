import type { ConfidenceResult, LocalizedString, Provenance } from "@/lib/domain";
import { PLACE_PROVINCES, PLACE_TYPES, type Location, type Place, type PlaceEvent, type PlaceProvince, type PlaceType } from "./types";

const local = (en: string, fr: string): LocalizedString => ({ en, fr });
const provenance: Provenance = { dataset: "Illustrative source-ledger entry", version: "example-1.0", retrievedDate: "2026-08-11", licence: "ogl-canada-2.0", recordUrl: "https://example.local/record" };
const high: ConfidenceResult = { level: "high", ruleId: "CONF-HIGH-001", reason: local("Direct authoritative record with clear geometry, date and attributes.", "Registre faisant directement autorité, avec une géométrie, une date et des attributs clairs.") };
const limited: ConfidenceResult = { level: "limited", ruleId: "CONF-LIMITED-001", reason: local("Useful indication only because a documented coverage or resolution limit affects this location.", "Indication utile seulement, car une limite documentée de couverture ou de résolution touche cet emplacement.") };

function event(id: string, year: number, evidence: PlaceEvent["evidence"], title: LocalizedString, confidence = high): PlaceEvent {
  return { id, year, evidence, title, confidence, limitation: confidence.reason, provenance };
}

const provinceNames: Record<PlaceProvince, LocalizedString> = {
  BC: local("British Columbia", "Colombie-Britannique"),
  AB: local("Alberta", "Alberta"),
  ON: local("Ontario", "Ontario"),
  QC: local("Quebec", "Québec"),
};

const typeNames: Record<PlaceType, LocalizedString> = {
  province: local("province", "province"),
  watershed: local("watershed", "bassin versant"),
  "forest-district": local("forest district", "district forestier"),
  municipality: local("municipality", "municipalité"),
  "provincial-riding": local("provincial riding", "circonscription provinciale"),
  "federal-riding": local("federal riding", "circonscription fédérale"),
  reserve: local("reserve", "réserve"),
  "treaty-area": local("treaty area", "région visée par un traité"),
};

const specs: ReadonlyArray<readonly [string, PlaceType, PlaceProvince, LocalizedString]> = PLACE_PROVINCES.flatMap((province) => PLACE_TYPES.map((type) => [
  `${province.toLowerCase()}-${type}`,
  type,
  province,
  local(`Illustrative ${provinceNames[province].en} ${typeNames[type].en}`, `${provinceNames[province].fr} illustrative — ${typeNames[type].fr}`),
] as const));

export const PLACES: readonly Place[] = specs.map(([id, type, province, name], index) => {
  const first = event(`${id}-2024`, 2024, "official-record", local("Illustrative recorded intervention", "Intervention consignée illustrative"));
  const second = event(`${id}-2022`, 2022, "satellite-observation", local("Illustrative detected tree cover reduction", "Réduction illustrative du couvert arboré détectée"), limited);
  const aliases = type === "municipality" && province === "QC"
    ? local("Illustrative Quebec municipality alias", "Alias de municipalité québécoise")
    : local(`${name.en} alias`, `Alias de ${name.fr}`);
  return {
    status: "example", id, type, province, name, aliases, boundaryEdition: `example-boundary-${province.toLowerCase()}-2026`, boundaryVersion: "example-2026.1", forestHectares: 1000 + index * 100,
    coverage: [{ grade: "national-baseline", share: 0.7 }, { grade: "national-baseline-plus-local-context", share: 0.3 }],
    annual: [{ year: 2022, hectares: 8 + index, eventIds: [second.id] }, { year: 2024, hectares: 5 + index, eventIds: [first.id] }], events: [first, second],
    stats: [
      { kind: "figure", value: 13 + index, unit: "ha", evidence: "official-record", confidence: high, provenance },
      { kind: "unknown", evidence: "unknown", reason: local("No authoritative public record has been integrated for this question.", "Aucun registre public faisant autorité n’a été intégré pour cette question."), coverageGrade: "national-baseline-plus-local-context" },
    ], sources: ["example-official-record", "example-satellite-observation"], citation: { timeRange: "1984–2025 (illustrative)", dataVersion: "example-1.0", method: "example-method-1" },
    ...(type === "reserve" || type === "treaty-area" ? { safeguard: local("Illustrative geography only. This example does not identify a community contact or speak for rights holders; a right of reply is retained before publication.", "Géographie illustrative seulement. Cet exemple ne désigne aucun contact communautaire et ne parle pas au nom des titulaires de droits; un droit de réponse est maintenu avant publication.") } : {}),
  };
});

export const LOCATIONS: readonly Location[] = PLACES.map((place, index) => ({ status: "example", id: `location-${place.id}`, summary: local(`Illustrative location in ${place.name.en}.`, `Emplacement illustratif dans ${place.name.fr}.`), latitude: 49 + index, longitude: -123 + index, accuracyMetres: 100, containingPlaceIds: [place.id], events: [...place.events].sort((a, b) => b.year - a.year) }));
export const placeById = (id: string) => PLACES.find((place) => place.id === id);
export const locationById = (id: string) => LOCATIONS.find((location) => location.id === id);
