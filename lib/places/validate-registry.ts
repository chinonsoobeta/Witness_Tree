import { PLACE_REGISTRY } from "./fixtures";
import { coordinatePermalinkId } from "./coordinate-identity";
import { PLACE_PROVINCES, PLACE_TYPES, type RegistryEntry } from "./types";

function figureValue(value: RegistryEntry["location"]["latitude"], field: string): number {
  if (value.kind !== "figure") throw new Error(`${field} must be a Figure for a coordinate permalink.`);
  return value.value;
}

export function validatePlaceRegistry(registry: readonly RegistryEntry[] = PLACE_REGISTRY) {
  const expectedPlaceIds = new Set(PLACE_PROVINCES.flatMap((province) => PLACE_TYPES.map((type) => `${province.toLowerCase()}-${type}`)));
  const placeIds = new Set(registry.map(({ place }) => place.id));
  if (registry.length !== expectedPlaceIds.size || placeIds.size !== registry.length || JSON.stringify([...placeIds].sort()) !== JSON.stringify([...expectedPlaceIds].sort())) throw new Error("Place registry must contain the complete canonical province/type cross-product exactly once.");
  const coordinateIds = new Set<string>();
  for (const entry of registry) {
    const records = [entry.place, entry.location, entry.search, entry.source, entry.citation, entry.download];
    if (records.some((record) => record.status !== "example" || record.reviewStatus !== "unapproved" || record.productionEligible !== false)) throw new Error(`${entry.place.id}: a registry record escaped the example boundary.`);
    if (!PLACE_PROVINCES.includes(entry.place.province) || !PLACE_TYPES.includes(entry.place.type)) throw new Error(`${entry.place.id}: province and type must use the canonical registry enums.`);
    if (entry.place.id !== `${entry.place.province.toLowerCase()}-${entry.place.type}`) throw new Error(`${entry.place.id}: place identity is inconsistent with its province and type.`);
    if (entry.search.id !== `${entry.place.id}-search` || entry.search.placeId !== entry.place.id) throw new Error(`${entry.place.id}: search identity is inconsistent.`);
    const boundaryRecords = [entry.source, entry.citation];
    if (boundaryRecords.some((record) => record.status !== "example" || record.reviewStatus !== "unapproved" || record.productionEligible !== false)) throw new Error(`${entry.place.id}: citation/source record escaped the example boundary.`);
    if (entry.place.citationId !== entry.citation.id) throw new Error(`${entry.place.id}: citation identity is inconsistent.`);
    if (entry.place.downloadId !== entry.download.id) throw new Error(`${entry.place.id}: download identity is inconsistent.`);
    const placeSources = [...new Set(entry.place.sourceIds)].sort();
    const citationSources = [...new Set(entry.citation.sourceIds)].sort();
    if (placeSources.length !== entry.place.sourceIds.length || citationSources.length !== entry.citation.sourceIds.length || JSON.stringify(placeSources) !== JSON.stringify([entry.source.id]) || JSON.stringify(citationSources) !== JSON.stringify(placeSources)) throw new Error(`${entry.place.id}: place, citation and source identifiers are inconsistent.`);
    const expectedCoordinateId = coordinatePermalinkId(figureValue(entry.location.latitude, "Latitude"), figureValue(entry.location.longitude, "Longitude"));
    if (entry.location.coordinateId !== expectedCoordinateId) throw new Error(`${entry.place.id}: coordinate permalink identity drift.`);
    if (coordinateIds.has(expectedCoordinateId)) throw new Error(`${entry.place.id}: duplicate coordinate permalink identity.`);
    coordinateIds.add(expectedCoordinateId);
    const expectedContaining = registry.filter(({ place }) => place.province === entry.place.province).map(({ place }) => place.id).sort();
    const actualContaining = [...new Set(entry.location.containingPlaceIds)].sort();
    if (actualContaining.length !== entry.location.containingPlaceIds.length || JSON.stringify(actualContaining) !== JSON.stringify(expectedContaining)) throw new Error(`${entry.place.id}: missing or duplicate applicable containing geography.`);
    if (actualContaining.some((id) => !placeIds.has(id))) throw new Error(`${entry.place.id}: containment references an unregistered place.`);
    if (entry.download.href !== `/examples/downloads/${entry.place.id}.csv` || !/^[a-f0-9]{64}$/.test(entry.download.sha256) || !Number.isSafeInteger(entry.download.bytes) || entry.download.bytes <= 0) throw new Error(`${entry.place.id}: download is not checksum-bound to its registered example file.`);
  }
  return { places: registry.length, coordinatePermalinks: coordinateIds.size, containmentLinks: registry.reduce((sum, entry) => sum + entry.location.containingPlaceIds.length, 0) };
}
