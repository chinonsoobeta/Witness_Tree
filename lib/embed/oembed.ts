import { PRODUCT_NAME } from "@/lib/domain";
import { placePageRecord } from "@/lib/place-pages";
import { SITE_ORIGIN } from "@/lib/site-metadata";
import { EMBED_MIN_WIDTH, EMBED_SIZE, embedSnippet, embedTitle, parsePlacePath } from "./paths";

/**
 * The oEmbed endpoint (https://oembed.com), so a CMS that is given a place
 * page's address in either language frames its figure. It answers only for a
 * place page on this site that exists; anything else is refused.
 *
 *     GET /api/oembed?url=https://www.witnesstree.ca/en/places/1984-2022-v1/csd-2021/5924034
 *
 * It follows the other API handlers: GET only (405 otherwise), JSON errors
 * with no-store, and a short public cache on an answer, which changes only
 * when a deploy changes the committed data.
 */

export const OEMBED_PATH = "/api/oembed";

/** Addresses longer than any place page are refused before parsing. */
const MAX_URL_LENGTH = 300;

/** The hosts a place page address may name: the site, its bare domain, and the origin serving the request (a preview deployment). */
function isSiteOrigin(url: URL, requestOrigin: string) {
  if (url.origin === requestOrigin) return true;
  return (url.protocol === "https:" || url.protocol === "http:") && (url.host === "www.witnesstree.ca" || url.host === "witnesstree.ca");
}

function json(body: unknown, status: number, cache: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache },
  });
}

/** A requested maximum, or null when absent; NaN when it is not a positive whole number. */
function dimension(value: string | null): number | null {
  if (value === null) return null;
  return /^[1-9]\d{0,4}$/.test(value) ? Number(value) : Number.NaN;
}

export function handleOembed(request: Request): Response {
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method-not-allowed" }, 405, "no-store");
  const requestUrl = new URL(request.url);
  const format = requestUrl.searchParams.get("format") ?? "json";
  // oEmbed asks a provider to answer 501 for a format it does not serve.
  if (format !== "json") return json({ error: "format-not-supported" }, 501, "no-store");
  const target = requestUrl.searchParams.get("url");
  if (!target) return json({ error: "url-required" }, 400, "no-store");
  if (target.length > MAX_URL_LENGTH) return json({ error: "url-too-long" }, 400, "no-store");
  const maxWidth = dimension(requestUrl.searchParams.get("maxwidth"));
  const maxHeight = dimension(requestUrl.searchParams.get("maxheight"));
  if (Number.isNaN(maxWidth) || Number.isNaN(maxHeight)) return json({ error: "dimension-invalid" }, 400, "no-store");

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return json({ error: "url-invalid" }, 400, "no-store");
  }
  const address = isSiteOrigin(url, requestUrl.origin) ? parsePlacePath(url.pathname) : null;
  const record = address ? placePageRecord(address.dataVersion, address.geography, address.code) : undefined;
  if (!address || !record) return json({ error: "not-a-place-page" }, 404, "no-store");

  const { locale } = address;
  const name = record.name[locale];
  // The card reflows to any width down to its minimum. A frame shorter than
  // the card scrolls inside it, so a smaller height never removes a line.
  const width = Math.max(EMBED_MIN_WIDTH, Math.min(EMBED_SIZE.width, maxWidth ?? EMBED_SIZE.width));
  const height = Math.min(EMBED_SIZE.height, maxHeight ?? EMBED_SIZE.height);
  return json({
    version: "1.0",
    type: "rich",
    provider_name: PRODUCT_NAME[locale],
    provider_url: SITE_ORIGIN,
    title: embedTitle(locale, name),
    html: embedSnippet(locale, { geography: record.geography, code: record.code, name }, { width, height }),
    width,
    height,
  }, 200, "public, max-age=300");
}
