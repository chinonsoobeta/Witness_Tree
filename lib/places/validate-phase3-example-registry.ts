import { LOCATIONS, PLACES } from "./fixtures";
import { PLACE_PROVINCES, PLACE_TYPES, type Location, type Place } from "./types";

const nonBlank = (value: string) => typeof value === "string" && value.trim().length > 0;
const localized = (value: { en: string; fr: string }) => nonBlank(value.en) && nonBlank(value.fr);

/** Structural guard for the synthetic Phase 3 surface; it cannot admit data to production. */
export function validatePhase3ExampleRegistry(places: readonly Place[] = PLACES, locations: readonly Location[] = LOCATIONS) {
  const expectedIds = new Set(PLACE_PROVINCES.flatMap((province) => PLACE_TYPES.map((type) => `${province.toLowerCase()}-${type}`)));
  const ids = new Set(places.map((place) => place.id));
  if (places.length !== expectedIds.size || ids.size !== expectedIds.size || [...ids].some((id) => !expectedIds.has(id))) {
    throw new Error("Phase 3 example registry must contain the complete Big Four province/type cross-product exactly once.");
  }
  if (locations.length !== places.length) throw new Error("Every example place requires one location permalink record.");

  const locationIds = new Set<string>();
  for (const place of places) {
    if (place.status !== "example") throw new Error(`${place.id}: only example records are permitted in the Phase 3 fixture registry.`);
    if (!PLACE_PROVINCES.includes(place.province) || !PLACE_TYPES.includes(place.type) || place.id !== `${place.province.toLowerCase()}-${place.type}`) throw new Error(`${place.id}: canonical province/type identity drift.`);
    if (!localized(place.name) || !localized(place.aliases)) throw new Error(`${place.id}: English and French place strings are both required.`);
    if (!place.boundaryEdition.trim() || !place.boundaryVersion.trim() || !Number.isFinite(place.forestHectares) || place.forestHectares < 0) throw new Error(`${place.id}: boundary or denominator is invalid.`);
    if (!place.coverage.length || Math.abs(place.coverage.reduce((sum, item) => sum + item.share, 0) - 1) > .001) throw new Error(`${place.id}: coverage shares must sum to one.`);
    if (!place.stats.some((stat) => stat.kind === "unknown" && !("value" in stat) && localized(stat.reason))) throw new Error(`${place.id}: an Unknown must have a bilingual reason and no numeric value.`);
    if (place.events.some((event) => !localized(event.title) || !localized(event.limitation) || !localized(event.confidence.reason) || !event.provenance.dataset.trim() || !event.provenance.version.trim() || !event.provenance.retrievedDate.trim() || !event.provenance.licence.trim())) throw new Error(`${place.id}: event provenance or bilingual explanation is incomplete.`);
  }
  for (const location of locations) {
    if (location.status !== "example" || !location.id.trim() || locationIds.has(location.id)) throw new Error("Location permalink identities must be unique example records.");
    locationIds.add(location.id);
    if (!localized(location.summary) || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) || !Number.isFinite(location.accuracyMetres) || location.accuracyMetres < 0) throw new Error(`${location.id}: location identity or bilingual summary is invalid.`);
    if (!location.containingPlaceIds.length || location.containingPlaceIds.some((id) => !ids.has(id))) throw new Error(`${location.id}: containment must reference registered places.`);
  }
  return Object.freeze({ places: places.length, locations: locations.length, locales: 2, localizedStaticPages: (places.length + locations.length) * 2, placeTypes: PLACE_TYPES.length, provinces: PLACE_PROVINCES.length });
}
