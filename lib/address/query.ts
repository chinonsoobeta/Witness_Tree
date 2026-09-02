/**
 * Address lookup, kept to the smallest thing that can answer "where is this".
 *
 * Nothing here holds the key. The key lives in the worker secret and the
 * browser never sees it, which is why the site's connect-src can stay 'self':
 * the page talks to our own origin and the origin talks to the provider.
 *
 * The query is normalized before it reaches the network, because the key is
 * billed per request and the route is public. A query that differs only by
 * spacing or case is the same question, and the same question must be the same
 * cache entry.
 *
 * The response is narrowed to the three fields the page needs. Everything else
 * the provider returns is discarded before it reaches the page, so a provider
 * that starts returning more does not silently start publishing more.
 */

export const ADDRESS_QUERY_MAX_LENGTH = 120;
export const ADDRESS_RESULT_LIMIT = 5;

/** The whole country, so a result outside it is refused rather than mapped. */
export const CANADA_BOUNDS = Object.freeze({
  south: 41.6,
  west: -141.1,
  north: 83.2,
  east: -52.6,
});

export type AddressPoint = Readonly<{ id: string; label: string; latitude: number; longitude: number }>;

export class AddressQueryError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AddressQueryError";
    this.status = status;
  }
}

/**
 * Written as a code-point scan rather than a character class so the rule is
 * legible and the source file stays free of the very bytes it rejects.
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * One spelling per question. Case and internal spacing are not different
 * questions, and treating them as different questions is how a per-request
 * bill multiplies without producing another answer.
 *
 * Ordinary whitespace collapses first, so a pasted address that arrived with a
 * line break is accepted. What remains in the control range is refused, since
 * it cannot be part of an address and can only be an attempt to reach past the
 * query into a log or a header.
 */
export function normalizeAddressQuery(raw: unknown): string {
  if (typeof raw !== "string") throw new AddressQueryError("An address query is required.", 400);
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (hasControlCharacter(collapsed)) throw new AddressQueryError("The address query contains control characters.", 400);
  if (!collapsed) throw new AddressQueryError("An address query is required.", 400);
  if (collapsed.length > ADDRESS_QUERY_MAX_LENGTH) throw new AddressQueryError("The address query is too long.", 400);
  return collapsed.toLocaleLowerCase("en-CA");
}

export function addressCacheKey(query: string, locale: string): string {
  return `address:${locale}:${query}`;
}

export const ADDRESS_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
export const ADDRESS_FIELD_MASK = "places.id,places.formattedAddress,places.location";

/**
 * Built here rather than inside the worker so the request the key signs is
 * covered by tests. The key is passed in and never stored.
 */
export function addressRequest(query: string, key: string, locale: string): Request {
  if (!key) throw new AddressQueryError("The address service is not configured.", 503);
  return new Request(ADDRESS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": ADDRESS_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: locale === "fr" ? "fr-CA" : "en-CA",
      regionCode: "CA",
      maxResultCount: ADDRESS_RESULT_LIMIT,
      locationRestriction: {
        rectangle: {
          low: { latitude: CANADA_BOUNDS.south, longitude: CANADA_BOUNDS.west },
          high: { latitude: CANADA_BOUNDS.north, longitude: CANADA_BOUNDS.east },
        },
      },
    }),
  });
}

function insideCanada(latitude: number, longitude: number): boolean {
  return (
    latitude >= CANADA_BOUNDS.south &&
    latitude <= CANADA_BOUNDS.north &&
    longitude >= CANADA_BOUNDS.west &&
    longitude <= CANADA_BOUNDS.east
  );
}

/**
 * Drops anything that is not a usable Canadian point. A malformed or
 * out-of-country result is discarded rather than repaired, because a repaired
 * coordinate is an invented location.
 */
export function narrowAddressResponse(payload: unknown): readonly AddressPoint[] {
  if (!payload || typeof payload !== "object") return [];
  const places = (payload as { places?: unknown }).places;
  if (!Array.isArray(places)) return [];
  const points: AddressPoint[] = [];
  const seen = new Set<string>();
  for (const candidate of places) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as { id?: unknown; formattedAddress?: unknown; location?: unknown };
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const label = typeof record.formattedAddress === "string" ? record.formattedAddress.trim() : "";
    const location = record.location as { latitude?: unknown; longitude?: unknown } | undefined;
    const latitude = typeof location?.latitude === "number" ? location.latitude : Number.NaN;
    const longitude = typeof location?.longitude === "number" ? location.longitude : Number.NaN;
    if (!id || !label || seen.has(id)) continue;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (!insideCanada(latitude, longitude)) continue;
    seen.add(id);
    points.push(Object.freeze({ id, label, latitude, longitude }));
    if (points.length === ADDRESS_RESULT_LIMIT) break;
  }
  return Object.freeze(points);
}
