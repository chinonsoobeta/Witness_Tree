import { LocationResult } from "witness-tree";
import { LOCATIONS, PLACES, placeById } from "witness-tree/lib/places";

/*
 * What a reader gets after resolving an address to a point: the coordinates with
 * their accuracy, the geographies that contain the point, and every recorded
 * event with its evidence chip, confidence badge, stated limitation and
 * provenance block. It is the densest composition of the policy primitives in the
 * app, which is why it earns a card of its own rather than being read off
 * PlacePage.
 *
 * The events carry two different confidence levels by construction: the 2024
 * official record is high, the 2022 satellite observation is limited and states
 * the coverage limit that caused it. Both are visible in one cell, so the card
 * shows the confidence contrast rather than asserting it.
 */
const LOCATION = LOCATIONS.find((location) => location.id === "location-bc-watershed")!;
const CONTAINING = LOCATION.containingPlaceIds
  .map((id) => placeById(id))
  .filter((place): place is (typeof PLACES)[number] => place !== undefined);

export const English = () => (
  <LocationResult locale="en" location={LOCATION} places={CONTAINING} />
);

export const French = () => (
  <LocationResult locale="fr" location={LOCATION} places={CONTAINING} />
);
