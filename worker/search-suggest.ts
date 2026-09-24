/**
 * Suggestions for the search field, while the reader types.
 *
 * It reads only committed data, through the same function the results page
 * uses, and needs no binding. The riding table and the place-name index stay on
 * the server: each response is at most a dozen rows of display text.
 */

import type { Locale } from "../lib/domain";
import { suggestSearch } from "../lib/search/suggest";

export const SEARCH_SUGGEST_PATH = "/api/search/suggest";

/** Longer queries match nothing a person would type, and cost a full scan. */
const MAX_QUERY_LENGTH = 100;

function json(body: unknown, status: number, cache: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache },
  });
}

export function handleSearchSuggest(request: Request): Response {
  if (request.method !== "GET") return json({ error: "method-not-allowed" }, 405, "no-store");
  const url = new URL(request.url);
  const locale = url.searchParams.get("locale");
  if (locale !== "en" && locale !== "fr") return json({ error: "locale-required" }, 400, "no-store");
  const query = url.searchParams.get("q") ?? "";
  if (query.length > MAX_QUERY_LENGTH) return json({ error: "query-too-long" }, 400, "no-store");
  // The answer changes only when a deploy changes the committed data.
  return json(suggestSearch(query, locale as Locale), 200, "public, max-age=300");
}
