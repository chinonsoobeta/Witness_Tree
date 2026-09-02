/**
 * The address route. It exists so the browser never holds the provider key.
 *
 * The request arrives as POST with a JSON body rather than GET with a query
 * string, because an address is personal and a query string is the one part of
 * a request that is routinely written to logs, referrers and history. The
 * answer is returned with no-store for the same reason.
 *
 * Nothing here logs the query or the result.
 */

import {
  ADDRESS_CACHE_TTL_SECONDS,
  AddressQueryError,
  type AddressBudgetStore,
  type AddressPoint,
  addressCacheKey,
  addressRequest,
  clientIdentity,
  narrowAddressResponse,
  normalizeAddressQuery,
  reserveAddressSpend,
} from "../lib/address";

export const ADDRESS_SEARCH_PATH = "/api/address/search";
export const ADDRESS_FLAG_HEADER = "x-witness-tree-address";

export type AddressKeyValue = Readonly<{
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}>;

export type AddressEnv = Readonly<{
  ADDRESS_PROVIDER_KEY?: string;
  ADDRESS_BUDGET?: AddressKeyValue;
}>;

export function addressLookupConfigured(env: AddressEnv): boolean {
  return Boolean(env.ADDRESS_PROVIDER_KEY && env.ADDRESS_BUDGET);
}

/**
 * Overwrites whatever the client sent, so the page's view of the flag is the
 * worker's view and not the caller's.
 */
export function withAddressFlag(request: Request, configured: boolean): Request {
  const headers = new Headers(request.headers);
  headers.set(ADDRESS_FLAG_HEADER, configured ? "on" : "off");
  return new Request(request, { headers });
}

function storeFor(binding: AddressKeyValue): AddressBudgetStore {
  return {
    read: (key) => binding.get(key),
    write: (key, value, ttlSeconds) => binding.put(key, value, { expirationTtl: ttlSeconds }),
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function localeOf(raw: unknown): string {
  return raw === "fr" ? "fr" : "en";
}

/**
 * Fetch is injected so the paid call is exercised in tests without a key and
 * without a network.
 */
export async function handleAddressSearch(
  request: Request,
  env: AddressEnv,
  deps: { now: () => number; fetch: typeof fetch } = { now: Date.now, fetch },
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST for an address query." }, 405);
  }
  const key = env.ADDRESS_PROVIDER_KEY;
  const budget = env.ADDRESS_BUDGET;
  if (!key || !budget) {
    return json({ error: "Address lookup is not configured." }, 503);
  }

  let query: string;
  let locale: string;
  try {
    const body = (await request.json()) as { query?: unknown; locale?: unknown };
    query = normalizeAddressQuery(body?.query);
    locale = localeOf(body?.locale);
  } catch (error) {
    if (error instanceof AddressQueryError) return json({ error: error.message }, error.status);
    return json({ error: "The address query could not be read." }, 400);
  }

  const store = storeFor(budget);
  const cacheKey = addressCacheKey(query, locale);
  const cached = await store.read(cacheKey);
  if (cached !== null) {
    try {
      const points = JSON.parse(cached) as readonly AddressPoint[];
      if (Array.isArray(points)) return json({ results: points, cached: true }, 200);
    } catch {
      // A corrupt entry is treated as a miss rather than an error, because the
      // route can still answer by paying for the call once more.
    }
  }

  try {
    await reserveAddressSpend(store, clientIdentity(request.headers), deps.now());
  } catch (error) {
    if (error instanceof AddressQueryError) return json({ error: error.message }, error.status);
    throw error;
  }

  let payload: unknown;
  try {
    const response = await deps.fetch(addressRequest(query, key, locale));
    if (!response.ok) return json({ error: "The address service did not answer." }, 502);
    payload = await response.json();
  } catch {
    return json({ error: "The address service did not answer." }, 502);
  }

  const results = narrowAddressResponse(payload);
  // A miss that produced nothing is still cached, so a misspelling that is
  // retried does not get billed twice.
  await store.write(cacheKey, JSON.stringify(results), ADDRESS_CACHE_TTL_SECONDS);
  return json({ results, cached: false }, 200);
}
