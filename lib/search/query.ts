/**
 * The query as search reads it, the one place a query is trimmed: the results
 * page, the suggestion route and the search field in the browser all call it,
 * so they agree on what counts as no query. It holds no data, so the field can
 * import it.
 *
 * Every run of whitespace (including non-breaking and zero-width spaces)
 * becomes one space and the ends are trimmed. A query that is nothing but
 * whitespace, or not a string at all, is no query.
 */
export function cleanSearchQuery(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\s\u200B-\u200D\u2060\uFEFF]+/g, " ").trim();
}
