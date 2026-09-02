import assert from "node:assert/strict";
import test from "node:test";

import {
  ADDRESS_CLIENT_LIMIT,
  ADDRESS_DAILY_CEILING,
  ADDRESS_FIELD_MASK,
  ADDRESS_QUERY_MAX_LENGTH,
  ADDRESS_RESULT_LIMIT,
  AddressQueryError,
  addressCacheKey,
  addressRequest,
  clientIdentity,
  clientWindowKey,
  dailyCounterKey,
  narrowAddressResponse,
  normalizeAddressQuery,
  reserveAddressSpend,
  type AddressBudgetStore,
} from "../lib/address";
import {
  ADDRESS_FLAG_HEADER,
  ADDRESS_SEARCH_PATH,
  addressLookupConfigured,
  handleAddressSearch,
  withAddressFlag,
  type AddressEnv,
  type AddressKeyValue,
} from "../worker/address";

function memoryStore(): AddressKeyValue & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    async get(key) {
      return entries.has(key) ? (entries.get(key) as string) : null;
    },
    async put(key, value) {
      entries.set(key, value);
    },
  };
}

const budgetStore = (kv: AddressKeyValue): AddressBudgetStore => ({
  read: (key) => kv.get(key),
  write: (key, value, ttl) => kv.put(key, value, { expirationTtl: ttl }),
});

function providerPayload(count: number) {
  return {
    places: Array.from({ length: count }, (_, index) => ({
      id: `place-${index}`,
      formattedAddress: `${index} Main Street, Prince George, BC`,
      location: { latitude: 53.9 + index / 1000, longitude: -122.75 },
    })),
  };
}

function searchRequest(body: unknown, ip = "198.51.100.7"): Request {
  return new Request(`https://example.invalid${ADDRESS_SEARCH_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  });
}

function envWith(kv: AddressKeyValue): AddressEnv {
  return { ADDRESS_PROVIDER_KEY: "test-key", ADDRESS_BUDGET: kv };
}

test("a query is one question no matter how it is typed", () => {
  const canonical = normalizeAddressQuery("1500  Main   St, Prince George BC");
  assert.equal(canonical, "1500 main st, prince george bc");
  assert.equal(normalizeAddressQuery("\n1500 Main St, Prince George BC\t"), canonical);
  assert.equal(normalizeAddressQuery("1500 MAIN ST, PRINCE GEORGE BC"), canonical);
  assert.equal(addressCacheKey(canonical, "fr"), `address:fr:${canonical}`);
  assert.notEqual(addressCacheKey(canonical, "fr"), addressCacheKey(canonical, "en"));
});

test("a query that is not an address is refused before any paid call", () => {
  const rejected: Array<[unknown, number]> = [
    [undefined, 400],
    [42, 400],
    ["", 400],
    ["   ", 400],
    ["a".repeat(ADDRESS_QUERY_MAX_LENGTH + 1), 400],
    [`1500 Main${String.fromCharCode(0)}St`, 400],
    [`1500 Main${String.fromCharCode(0x7f)}St`, 400],
  ];
  for (const [candidate, status] of rejected) {
    assert.throws(
      () => normalizeAddressQuery(candidate),
      (error: unknown) => error instanceof AddressQueryError && error.status === status,
      `expected a refusal for ${JSON.stringify(candidate)}`,
    );
  }
  // Ordinary whitespace is not a control character for this purpose, because a
  // pasted address legitimately arrives with a line break in it.
  assert.equal(normalizeAddressQuery("1500 Main\nSt"), "1500 main st");
});

test("the outbound request carries the key in a header, restricts to Canada, and asks for three fields", () => {
  const request = addressRequest("1500 main st", "secret-key", "fr");
  assert.equal(request.method, "POST");
  assert.equal(request.headers.get("X-Goog-Api-Key"), "secret-key");
  assert.equal(request.headers.get("X-Goog-FieldMask"), ADDRESS_FIELD_MASK);
  assert.equal(new URL(request.url).search, "", "the query must never appear in a URL");
  assert.throws(() => addressRequest("1500 main st", "", "en"), (error: unknown) => error instanceof AddressQueryError && error.status === 503);
});

test("the response is narrowed to points inside Canada and nothing else survives", () => {
  const points = narrowAddressResponse({
    places: [
      { id: "keep", formattedAddress: "1500 Main St", location: { latitude: 53.9, longitude: -122.75 }, rating: 4.5, priceLevel: "CHEAP" },
      { id: "keep", formattedAddress: "1500 Main St", location: { latitude: 53.9, longitude: -122.75 } },
      { id: "outside", formattedAddress: "1 Market St, San Francisco", location: { latitude: 37.79, longitude: -122.4 } },
      { id: "no-label", formattedAddress: "", location: { latitude: 53.9, longitude: -122.75 } },
      { id: "no-point", formattedAddress: "Somewhere", location: { latitude: "53.9", longitude: -122.75 } },
      { formattedAddress: "No identifier", location: { latitude: 53.9, longitude: -122.75 } },
    ],
  });
  assert.equal(points.length, 1);
  assert.deepEqual(Object.keys(points[0]).sort(), ["id", "label", "latitude", "longitude"]);
  assert.equal(narrowAddressResponse(null).length, 0);
  assert.equal(narrowAddressResponse({ places: "no" }).length, 0);
  assert.equal(narrowAddressResponse(providerPayload(20)).length, ADDRESS_RESULT_LIMIT);
});

test("the per-client window and the daily ceiling each refuse on their own", async () => {
  const kv = memoryStore();
  const store = budgetStore(kv);
  const now = Date.UTC(2026, 8, 1, 12, 0, 0);

  for (let index = 0; index < ADDRESS_CLIENT_LIMIT; index += 1) {
    await reserveAddressSpend(store, "198.51.100.7", now);
  }
  await assert.rejects(
    () => reserveAddressSpend(store, "198.51.100.7", now),
    (error: unknown) => error instanceof AddressQueryError && error.status === 429,
  );
  // A different minute is a different window, so the refusal is temporary.
  await reserveAddressSpend(store, "198.51.100.7", now + 60_000);
  assert.notEqual(clientWindowKey("198.51.100.7", now), clientWindowKey("198.51.100.7", now + 60_000));

  // The day counter is shared, so a second caller inherits what the first spent.
  kv.entries.set(dailyCounterKey(now), String(ADDRESS_DAILY_CEILING));
  await assert.rejects(
    () => reserveAddressSpend(store, "203.0.113.9", now),
    (error: unknown) => error instanceof AddressQueryError && error.status === 429,
  );
  // The same day for a caller who has spent nothing is still refused, which is
  // what makes the ceiling a ceiling rather than a per-caller allowance.
  assert.equal(dailyCounterKey(now), dailyCounterKey(now + 60_000));

  await assert.rejects(
    () => reserveAddressSpend(store, "", now),
    (error: unknown) => error instanceof AddressQueryError && error.status === 400,
  );
  assert.equal(clientIdentity(new Headers({ "CF-Connecting-IP": " 198.51.100.7 " })), "198.51.100.7");
  assert.equal(clientIdentity(new Headers()), "");
});

test("without a key the route answers 503 and never calls the provider", async () => {
  let calls = 0;
  const response = await handleAddressSearch(searchRequest({ query: "1500 Main St" }), {}, {
    now: () => 0,
    fetch: async () => {
      calls += 1;
      return new Response("{}");
    },
  });
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
  assert.equal(addressLookupConfigured({}), false);
  assert.equal(addressLookupConfigured({ ADDRESS_PROVIDER_KEY: "k" }), false);
  assert.equal(addressLookupConfigured(envWith(memoryStore())), true);
});

test("the same question is paid for once", async () => {
  const kv = memoryStore();
  let calls = 0;
  const deps = {
    now: () => Date.UTC(2026, 8, 1, 12, 0, 0),
    fetch: async () => {
      calls += 1;
      return new Response(JSON.stringify(providerPayload(2)), { status: 200 });
    },
  };

  const first = await handleAddressSearch(searchRequest({ query: "1500 Main St, Prince George BC" }), envWith(kv), deps);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("Cache-Control"), "no-store");
  const firstBody = (await first.json()) as { results: unknown[]; cached: boolean };
  assert.equal(firstBody.cached, false);
  assert.equal(firstBody.results.length, 2);

  const second = await handleAddressSearch(searchRequest({ query: "1500  MAIN ST,  prince george bc " }), envWith(kv), deps);
  const secondBody = (await second.json()) as { results: unknown[]; cached: boolean };
  assert.equal(secondBody.cached, true);
  assert.deepEqual(secondBody.results, firstBody.results);
  assert.equal(calls, 1, "a repeat of the same question must not be billed again");

  // A query that found nothing is cached too, so a misspelling retried is free.
  const empty = { ...deps, fetch: async () => { calls += 1; return new Response(JSON.stringify({ places: [] }), { status: 200 }); } };
  await handleAddressSearch(searchRequest({ query: "nowhere at all" }), envWith(kv), empty);
  await handleAddressSearch(searchRequest({ query: "nowhere at all" }), envWith(kv), empty);
  assert.equal(calls, 2);
});

test("a provider failure is reported without leaking the provider", async () => {
  const kv = memoryStore();
  const now = () => Date.UTC(2026, 8, 1, 12, 0, 0);
  const failed = await handleAddressSearch(searchRequest({ query: "1500 Main St" }), envWith(kv), {
    now,
    fetch: async () => new Response("upstream detail", { status: 500 }),
  });
  assert.equal(failed.status, 502);
  assert.equal(await failed.clone().text(), JSON.stringify({ error: "The address service did not answer." }));

  const threw = await handleAddressSearch(searchRequest({ query: "1600 Main St" }), envWith(kv), {
    now,
    fetch: async () => { throw new Error("connection reset to places.googleapis.com"); },
  });
  assert.equal(threw.status, 502);
  assert.ok(!(await threw.text()).includes("googleapis"));
});

test("the route takes POST only and never puts the address in a URL", async () => {
  const kv = memoryStore();
  const deps = { now: () => 0, fetch: async () => new Response(JSON.stringify(providerPayload(1))) };
  const getRequest = new Request(`https://example.invalid${ADDRESS_SEARCH_PATH}?query=1500+Main+St`, { method: "GET" });
  const response = await handleAddressSearch(getRequest, envWith(kv), deps);
  assert.equal(response.status, 405);

  const malformed = new Request(`https://example.invalid${ADDRESS_SEARCH_PATH}`, { method: "POST", body: "not json" });
  assert.equal((await handleAddressSearch(malformed, envWith(kv), deps)).status, 400);
});

test("the feature flag is stamped by the worker and cannot be forged", () => {
  const forged = new Request("https://example.invalid/en/explore", { headers: { [ADDRESS_FLAG_HEADER]: "on" } });
  assert.equal(withAddressFlag(forged, false).headers.get(ADDRESS_FLAG_HEADER), "off");
  assert.equal(withAddressFlag(forged, true).headers.get(ADDRESS_FLAG_HEADER), "on");
  const plain = new Request("https://example.invalid/en/explore");
  assert.equal(withAddressFlag(plain, false).headers.get(ADDRESS_FLAG_HEADER), "off");
});
