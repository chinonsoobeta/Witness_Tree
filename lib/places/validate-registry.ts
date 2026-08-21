import { PLACE_REGISTRY } from "./fixtures";
import { coordinatePermalinkId } from "./coordinate-identity";
import type { RegistryEntry } from "./types";

function figureValue(value: RegistryEntry["location"]["latitude"], field: string): number {
  if (value.kind !== "figure") throw new Error(`${field} must be a Figure for a coordinate permalink.`);
  return value.value;
}

export function validatePlaceRegistry(registry: readonly RegistryEntry[] = PLACE_REGISTRY) {
  const placeIds = new Set(registry.map(({ place }) => place.id));
  const coordinateIds = new Set<string>();
  for (const entry of registry) {
    const expectedCoordinateId = coordinatePermalinkId(figureValue(entry.location.latitude, "Latitude"), figureValue(entry.location.longitude, "Longitude"));
    if (entry.location.coordinateId !== expectedCoordinateId) throw new Error(`${entry.place.id}: coordinate permalink identity drift.`);
    if (coordinateIds.has(expectedCoordinateId)) throw new Error(`${entry.place.id}: duplicate coordinate permalink identity.`);
    coordinateIds.add(expectedCoordinateId);
    const expectedContaining = registry.filter(({ place }) => place.province === entry.place.province).map(({ place }) => place.id).sort();
    const actualContaining = [...new Set(entry.location.containingPlaceIds)].sort();
    if (actualContaining.length !== entry.location.containingPlaceIds.length || JSON.stringify(actualContaining) !== JSON.stringify(expectedContaining)) throw new Error(`${entry.place.id}: missing or duplicate applicable containing geography.`);
    if (actualContaining.some((id) => !placeIds.has(id))) throw new Error(`${entry.place.id}: containment references an unregistered place.`);
    if (entry.download.href.startsWith("data:") || !entry.download.href.startsWith("/examples/downloads/") || !/^[a-f0-9]{64}$/.test(entry.download.sha256) || !Number.isSafeInteger(entry.download.bytes) || entry.download.bytes <= 0) throw new Error(`${entry.place.id}: download is not checksum-bound to a registered example file.`);
  }
  return { places: registry.length, coordinatePermalinks: coordinateIds.size, containmentLinks: registry.reduce((sum, entry) => sum + entry.location.containingPlaceIds.length, 0) };
}
