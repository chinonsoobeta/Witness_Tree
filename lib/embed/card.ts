import { colon, EVIDENCE_DEFINITIONS, PRODUCT_NAME, type Locale } from "@/lib/domain";
import { PLACE_DATA_VERSION, placePageParams, placePageRecord, type PlacePageRecord } from "@/lib/place-pages";
import { placeSummary } from "@/lib/place-pages/summary";
import { CARD_TEXT, RECEIPT_TOKENS as TOKENS } from "@/lib/share/card-parts";
import { SITE_ORIGIN } from "@/lib/site-metadata";
import { embedTitle, escapeHtml as escape } from "./paths";

/**
 * A place's embedded figure (feature plan item 3): one self-contained HTML
 * document that another site frames, with the figure or its Unknown statement,
 * coverage, years, evidence class, data version, attribution, licence and a
 * link back to the place page.
 *
 * It is served by a route handler rather than a page, so it carries no Next.js
 * runtime, no navigation, no analytics and no script at all: the link back is
 * its only control (docs/THREAT_MODEL.md, clickjacking). Every figure and caveat
 * comes from lib/place-pages/summary.ts and lib/share/card-parts.ts, the same
 * words the place page and its share card print, so the three cannot disagree.
 *
 * It is set in the BC Sans family when the reader has it and otherwise in the
 * system sans-serif: the licensed font reaches the site through its single root
 * CSS import, which a route handler cannot use.
 */

const COPY = {
  en: {
    attribution: (boundary: string) => `Figure from ${PRODUCT_NAME.en}, ${SITE_ORIGIN.replace("https://", "")}. Boundary: ${boundary}.`,
    link: (name: string) => `Full record for ${name}, with its sources and limits (opens in a new tab)`,
  },
  // Draft French for the owner's review (2026-10-29).
  fr: {
    attribution: (boundary: string) => `Chiffre tiré de ${PRODUCT_NAME.fr}, ${SITE_ORIGIN.replace("https://", "")}. Limite\u202F: ${boundary}.`,
    link: (name: string) => `Registre complet de ${name}, avec ses sources et ses limites (s’ouvre dans un nouvel onglet)`,
  },
} as const;

const STYLE = `
*{box-sizing:border-box}
html{color-scheme:light}
body{margin:0;background:${TOKENS.ground};color:${TOKENS.ink};font:15px/1.4 "BC Sans",system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.embed{display:flex;flex-direction:column;min-height:100vh;border:1px solid ${TOKENS.rule}}
.embed-bar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:0 12px;margin:0;padding:6px 14px;background:${TOKENS.heroFill};color:${TOKENS.heroInk};font-size:13px}
.embed-bar strong{font-weight:700}
.embed-body{padding:10px 14px 0;flex-grow:1}
h1{margin:0;font-size:24px;line-height:1.15}
.embed-label{margin:4px 0 6px;color:${TOKENS.ink2};font-size:14px}
.embed-figure{border-left:6px solid ${TOKENS.edgeSatellite};background:${TOKENS.tintSatellite};padding:8px 12px}
.embed-figure--unknown{border-left-color:${TOKENS.edgeUnknown};background:${TOKENS.tintUnknown}}
.embed-figure p{margin:0}
.embed-value{font-size:28px;font-weight:700;line-height:1.1}
.embed-detail{margin-top:2px!important;font-size:14px}
.embed-minimum{margin-top:2px!important;font-size:13px;color:${TOKENS.ink2}}
.embed-coverage{margin:8px 0;font-size:14px}
.embed-facts{display:flex;flex-wrap:wrap;gap:4px 16px;margin:0;padding:6px 0;border-top:1px solid ${TOKENS.rule};font-size:12px}
.embed-facts dt{color:${TOKENS.muted}}
.embed-facts dd{margin:0;font-weight:700;font-size:13px;overflow-wrap:anywhere}
.embed-foot{padding:6px 14px 8px;background:${TOKENS.surface2};color:${TOKENS.ink2};font-size:12px;line-height:1.35}
.embed-foot p{margin:0 0 3px}
.embed-foot a{color:${TOKENS.accent};font-weight:700;font-size:13px}
`.trim();

function fact(label: string, value: string, className = "") {
  return `<div${className ? ` class="${className}"` : ""}><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`;
}

/** The whole embed document for one place, in one language. */
export function embedDocument(record: PlacePageRecord, locale: Locale): string {
  const text = CARD_TEXT[locale];
  const copy = COPY[locale];
  const summary = placeSummary(record, locale);
  const { figures } = summary;
  const unknown = figures.lost.kind === "unknown";
  const detail = figures.lost.kind === "unknown"
    ? figures.lost.reason[locale]
    : figures.share.kind === "figure"
      ? `${summary.share} ${text.share}`
      : `${text.shareUnknown}${colon(locale)} ${figures.share.reason[locale]}`;
  const evidence = EVIDENCE_DEFINITIONS[figures.lost.evidence].label[locale];
  const placeUrl = `${SITE_ORIGIN}${summary.path}`;

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(embedTitle(locale, summary.name))}</title>
<link rel="canonical" href="${escape(placeUrl)}">
<style>${STYLE}</style>
</head>
<body>
<article class="embed" aria-labelledby="embed-name" data-version="${PLACE_DATA_VERSION}" data-place="${escape(`${record.geography}/${record.code}`)}">
<p class="embed-bar"><strong>${escape(PRODUCT_NAME[locale])}</strong><span>${escape(`${record.typeLabel[locale]} · ${summary.province}`)}</span></p>
<div class="embed-body">
<h1 id="embed-name">${escape(summary.name)}</h1>
<p class="embed-label">${escape(summary.lostLabel)}</p>
<div class="embed-figure embed-figure--${figures.lost.kind}">
<p class="embed-value">${escape(unknown ? `– ${summary.lost}` : summary.lost)}</p>
<p class="embed-detail">${escape(detail)}</p>
${figures.lostIsMinimum ? `<p class="embed-minimum">${escape(text.minimum)}</p>\n` : ""}</div>
<p class="embed-coverage"><strong>${escape(`${text.coverage}${colon(locale)}`)}</strong> ${escape(summary.coverage)}</p>
<dl class="embed-facts">
${fact(text.years, text.span)}
${fact(text.unmapped, summary.unmapped)}
${fact(text.edition, record.boundary.edition)}
${fact(text.evidence, evidence)}
${fact(text.dataVersion, PLACE_DATA_VERSION, "embed-stamp")}
</dl>
</div>
<footer class="embed-foot">
<p>${escape(copy.attribution(record.boundary.title[locale]))}</p>
<p>${escape(`${text.licence} ${text.preview}`)}</p>
<p><a href="${escape(placeUrl)}" target="_blank" rel="noopener">${escape(copy.link(summary.name))}</a></p>
</footer>
</article>
</body>
</html>
`;
}

type PlaceParams = Readonly<{ dataVersion: string; geography: string; code: string }>;

/** Every place with a page has an embed, and no other. */
export function embedStaticParams() {
  return placePageParams().map(({ dataVersion, geography, code }) => ({ dataVersion, geography, code }));
}

/** The embed as a response, or 404 for an address that names no place. */
export async function embedResponse(locale: Locale, params: Promise<PlaceParams>): Promise<Response> {
  const { dataVersion, geography, code } = await params;
  const record = placePageRecord(dataVersion, geography, decodeURIComponent(code));
  if (!record) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(embedDocument(record, locale), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Content-Language": locale },
  });
}
