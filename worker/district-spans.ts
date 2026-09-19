/**
 * One span's district figures, for the Explore page while its sliders move.
 *
 * The page is rendered for the span in its address, and the year control moves
 * the span without a navigation, so the figures the server rendered go stale
 * the moment the reader drags a handle. This route answers the span the control
 * now shows. It reads the same checked-in table the page route reads, through
 * the same function, so the two can only ever disagree about which span was
 * asked for, and the caller checks that.
 *
 * The table itself never leaves the server: every response is one span, about
 * 774 districts, never the 741 spans behind it.
 */

import { parseExploreInterval } from "../lib/explore/interval";
import { ridingIntervalMeasurements } from "../lib/explore/riding-intervals";

export const DISTRICT_SPANS_PATH = "/api/explore/district-spans";

function json(body: unknown, status: number, cache: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache },
  });
}

export function handleDistrictSpans(request: Request): Response {
  if (request.method !== "GET") return json({ error: "method-not-allowed" }, 405, "no-store");
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  // A span the record cannot answer is refused, not quietly moved to one it can:
  // the caller would otherwise label the answer with the years it asked for.
  if (from === null || to === null || !/^\d{4}$/.test(from) || !/^\d{4}$/.test(to)) {
    return json({ error: "span-required" }, 400, "no-store");
  }
  const interval = parseExploreInterval(from, to);
  if (interval.fromYear !== Number(from) || interval.toYear !== Number(to)) {
    return json({ error: "span-outside-record" }, 400, "no-store");
  }
  // The answer changes only when a deploy changes the table, so a short shared
  // cache is safe and spares the worker a recomputation per slider step.
  return json(
    { fromYear: interval.fromYear, toYear: interval.toYear, measurements: ridingIntervalMeasurements(interval) },
    200,
    "public, max-age=300",
  );
}
