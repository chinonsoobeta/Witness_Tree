import type { ConfidenceResult, LocalizedString, Provenance } from "@/lib/domain";
import { EXPLORE_COVERAGE_PERIOD } from "@/lib/explore/types";
import { PLACE_PROVINCES, PLACE_TYPES, type Location, type Place, type PlaceEvent, type PlaceProvince, type PlaceType } from "./types";

const local = (en: string, fr: string): LocalizedString => ({ en, fr });
const provenance: Provenance = { dataset: "Illustrative source-ledger entry", version: "example-1.0", retrievedDate: "2026-08-11", licence: "ogl-canada-2.0", recordUrl: "https://example.local/record" };
const high: ConfidenceResult = { level: "high", ruleId: "CONF-HIGH-001", reason: local("An official record with a clear location, date and details.", "Un registre officiel avec un emplacement, une date et des détails clairs.") };
const limited: ConfidenceResult = { level: "limited", ruleId: "CONF-LIMITED-001", reason: local("A rough guide only: the data here has a known gap or is not detailed enough.", "Simple indication : les données ont ici une lacune connue ou manquent de précision.") };

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
  "economic-region": local("economic region", "région économique"),
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
  local(`Illustrative ${provinceNames[province].en} ${typeNames[type].en}`, `${provinceNames[province].fr} illustrative : ${typeNames[type].fr}`),
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
      { kind: "unknown", evidence: "unknown", reason: local("No official public record answers this question yet.", "Aucun registre public officiel ne répond encore à cette question."), coverageGrade: "national-baseline-plus-local-context" },
    ], sources: ["example-official-record", "example-satellite-observation"], citation: { timeRange: `${EXPLORE_COVERAGE_PERIOD.compact} (illustrative)`, dataVersion: "example-1.0", method: "example-method-1" },
    ...(type === "reserve" || type === "treaty-area" ? { safeguard: local("Example area only. It names no community contact and does not speak for rights holders; communities will be able to reply before anything is published.", "Zone d’exemple seulement. Elle ne désigne aucun contact communautaire et ne parle pas au nom des titulaires de droits; les communautés pourront répondre avant toute publication.") } : {}),
  };
});

export const LOCATIONS: readonly Location[] = PLACES.map((place, index) => ({ status: "example", id: `location-${place.id}`, summary: local(`Illustrative location in ${place.name.en}.`, `Emplacement illustratif dans ${place.name.fr}.`), latitude: 49 + index, longitude: -123 + index, accuracyMetres: 100, containingPlaceIds: [place.id], events: [...place.events].sort((a, b) => b.year - a.year) }));
export const placeById = (id: string) => PLACES.find((place) => place.id === id);
export const locationById = (id: string) => LOCATIONS.find((location) => location.id === id);
