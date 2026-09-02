/**
 * What stops a public, per-request-billed route from becoming a bill.
 *
 * Three separate limits, because they fail for different reasons:
 *
 *   - the cache, so the same question is asked of the provider once,
 *   - the per-client window, so one caller cannot spend the day's budget,
 *   - the daily ceiling, so the whole route cannot exceed a known number of
 *     paid requests no matter how many callers arrive.
 *
 * The ceiling is deliberately the last line and not the only one. A counter in
 * eventually consistent storage can undercount when requests land at the same
 * instant, so the number set here is below the number we are actually willing
 * to pay for, and the per-client window keeps the concurrency that could cause
 * the undercount small in the first place.
 */

import { AddressQueryError } from "./query";

/** Paid provider calls per UTC day. Cache hits are not paid and do not count. */
export const ADDRESS_DAILY_CEILING = 1000;

/** Per-client window. A person typing an address does not need more than this. */
export const ADDRESS_CLIENT_WINDOW_MS = 60_000;
export const ADDRESS_CLIENT_LIMIT = 10;

/** How long an answer stays reusable. Addresses move on a scale of years. */
export const ADDRESS_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

export type AddressBudgetStore = Readonly<{
  read(key: string): Promise<string | null>;
  write(key: string, value: string, ttlSeconds: number): Promise<void>;
}>;

export function utcDayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function dailyCounterKey(now: number): string {
  return `address:spend:${utcDayKey(now)}`;
}

export function clientWindowKey(client: string, now: number): string {
  return `address:client:${client}:${Math.floor(now / ADDRESS_CLIENT_WINDOW_MS)}`;
}

function readCount(raw: string | null): number {
  if (raw === null) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Refuses before any paid call is made. Returns nothing on success, because
 * the only useful outcome is permission to continue.
 */
export async function reserveAddressSpend(store: AddressBudgetStore, client: string, now: number): Promise<void> {
  if (!client) throw new AddressQueryError("The address query could not be attributed to a caller.", 400);

  const windowKey = clientWindowKey(client, now);
  const used = readCount(await store.read(windowKey));
  if (used >= ADDRESS_CLIENT_LIMIT) {
    throw new AddressQueryError("Too many address lookups from this connection. Try again in a minute.", 429);
  }

  const dayKey = dailyCounterKey(now);
  const spent = readCount(await store.read(dayKey));
  if (spent >= ADDRESS_DAILY_CEILING) {
    throw new AddressQueryError("Address lookup has reached its daily limit. The map and the riding search still work.", 429);
  }

  // Written before the paid call, so a call that starts is a call that counted.
  // Counting afterwards would let a burst of in-flight calls all pass a stale
  // read of the ceiling.
  const windowTtl = Math.ceil(ADDRESS_CLIENT_WINDOW_MS / 1000) * 2;
  await store.write(windowKey, String(used + 1), windowTtl);
  await store.write(dayKey, String(spent + 1), 60 * 60 * 48);
}

/**
 * The caller identity used for the per-client window. Cloudflare sets
 * CF-Connecting-IP itself on every inbound request and a client cannot forge
 * it, so it is the one identifier available before any session exists.
 */
export function clientIdentity(headers: Headers): string {
  const connecting = headers.get("cf-connecting-ip");
  if (connecting && connecting.trim()) return connecting.trim();
  return "";
}
