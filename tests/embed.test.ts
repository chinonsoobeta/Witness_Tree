import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { PRODUCT_NAME } from "../lib/domain/brand.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { embedDocument } from "../lib/embed/card.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { handleOembed } from "../lib/embed/oembed.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { EMBED_SIZE, embedPath, embedSnippet, oembedDiscoveryPath, parsePlacePath } from "../lib/embed/paths.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { PLACE_DATA_VERSION, placePageParams, placePageRecord, type PlacePageRecord } from "../lib/place-pages/index.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { placeSummary } from "../lib/place-pages/summary.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { CARD_TEXT } from "../lib/share/card-parts.ts";

const LOCALES = ["en", "fr"] as const;
const SITE = "https://www.witnesstree.ca";

function place(geography: string, code: string): PlacePageRecord {
  const record = placePageRecord(PLACE_DATA_VERSION, geography, code);
  assert.ok(record, `no place page for ${geography}/${code}`);
  return record;
}

/** The embed's visible text, tags removed and entities read back. */
function visibleText(html: string): string {
  const body = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? "";
  return body.replace(/<[^>]*>/g, "\n").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

test("every place's embed says what its page and share card say, and an Unknown is never 0 or blank", () => {
  let unknown = 0;
  for (const { geography, code } of placePageParams()) {
    const record = place(geography, code);
    for (const locale of LOCALES) {
      const html = embedDocument(record, locale);
      const text = visibleText(html);
      const summary = placeSummary(record, locale);
      const where = `${locale}/${geography}/${code}`;
      for (const value of [PRODUCT_NAME[locale], summary.name, summary.lostLabel, summary.lost, summary.coverage, summary.unmapped, record.boundary.edition, PLACE_DATA_VERSION, CARD_TEXT[locale].span, CARD_TEXT[locale].licence, CARD_TEXT[locale].preview]) {
        assert.ok(value && text.includes(value), `${where} lacks ${JSON.stringify(value)}`);
      }
      assert.ok(html.includes(`data-version="${PLACE_DATA_VERSION}"`), `${where} data-version`);
      assert.ok(html.includes(`<html lang="${locale}">`), `${where} lang`);
      assert.ok(html.includes(`href="${SITE}${summary.path}" target="_blank" rel="noopener"`), `${where} link back`);
      assert.doesNotMatch(html, /<script\b/i, `${where} carries a script`);
      if (summary.figures.lost.kind === "unknown") {
        unknown += 1;
        assert.ok(text.includes(summary.figures.lost.reason[locale]), `${where} drops the Unknown's reason`);
        assert.doesNotMatch(text, /(^|\D)0(\s|\u202F|\u00a0)*ha\b/, `${where} prints an Unknown as 0`);
      }
      if (summary.figures.lostIsMinimum) assert.ok(text.includes(CARD_TEXT[locale].minimum), `${where} drops the minimum note`);
    }
  }
  assert.ok(unknown > 0, "the data has Unknown places, so the test must have checked some");
});

test("an embed's address mirrors its page's and carries no product name; the snippet escapes the name", () => {
  assert.equal(embedPath("en", "csd-2021", "5924034"), "/en/embed/1984-2022-v1/csd-2021/5924034");
  assert.equal(embedPath("fr", "csd-2021", "5924034"), "/fr/integrer/1984-2022-v1/csd-2021/5924034");
  for (const locale of LOCALES) {
    for (const name of Object.values(PRODUCT_NAME) as string[]) {
      assert.doesNotMatch(embedPath(locale, "federal-2023", "59001").toLowerCase(), new RegExp(name.toLowerCase().replace(/\s+/g, "[-_ ]?")));
    }
  }
  const snippet = embedSnippet("en", { geography: "csd-2021", code: "5924034", name: `A "quoted" <place> & co` });
  assert.match(snippet, /^<iframe src="https:\/\/www\.witnesstree\.ca\/en\/embed\/1984-2022-v1\/csd-2021\/5924034" title="Forest lost in A &quot;quoted&quot; &lt;place&gt; &amp; co, 1984–2022 \([^)]+\)" width="560" height="560" style="border:0;max-width:100%" loading="lazy"><\/iframe>$/);
  assert.equal(
    oembedDiscoveryPath("fr", "csd-2021", "5924034"),
    `/api/oembed?url=${encodeURIComponent(`${SITE}/fr/lieux/1984-2022-v1/csd-2021/5924034`)}&format=json`,
  );
});

test("only a place page address parses as a place", () => {
  assert.deepEqual(parsePlacePath("/en/places/1984-2022-v1/csd-2021/5924034"), { locale: "en", dataVersion: "1984-2022-v1", geography: "csd-2021", code: "5924034" });
  assert.deepEqual(parsePlacePath("/fr/lieux/1984-2022-v1/federal-2023/59001/"), { locale: "fr", dataVersion: "1984-2022-v1", geography: "federal-2023", code: "59001" });
  for (const path of ["/en/lieux/1984-2022-v1/csd-2021/5924034", "/fr/places/1984-2022-v1/csd-2021/5924034", "/en/places/1984-2022-v1/csd-2021", "/en/places/1984-2022-v1/csd-2021/5924034/opengraph-image", "/en/places/1984-2022-v1/nowhere/1", "/en/embed/1984-2022-v1/csd-2021/5924034", "/en/places/1984-2022-v1/csd-2021/%E0%A4%A"]) {
    assert.equal(parsePlacePath(path), null, path);
  }
});

type OembedBody = Partial<Record<"version" | "type" | "provider_name" | "provider_url" | "title" | "html" | "error", string>> & { width?: number; height?: number };

async function oembed(query: string, init?: RequestInit) {
  const response = handleOembed(new Request(`https://www.witnesstree.ca/api/oembed?${query}`, init));
  return { status: response.status, body: (await response.json()) as OembedBody, cache: response.headers.get("cache-control") };
}

test("oEmbed answers for a place page in either language with the same iframe the page offers", async () => {
  const record = place("csd-2021", "5924034");
  for (const locale of LOCALES) {
    const page = `${SITE}${placeSummary(record, locale).path}`;
    const { status, body, cache } = await oembed(`url=${encodeURIComponent(page)}`);
    assert.equal(status, 200, locale);
    assert.equal(cache, "public, max-age=300");
    assert.equal(body.version, "1.0");
    assert.equal(body.type, "rich");
    assert.equal(body.provider_name, PRODUCT_NAME[locale]);
    assert.equal(body.provider_url, SITE);
    assert.equal(body.html, embedSnippet(locale, { geography: "csd-2021", code: "5924034", name: record.name[locale] }));
    assert.deepEqual([body.width, body.height], [EMBED_SIZE.width, EMBED_SIZE.height]);
  }
  // The bare domain and a narrower frame; the width never drops below the card's minimum.
  const narrow = await oembed(`url=${encodeURIComponent("https://witnesstree.ca/en/places/1984-2022-v1/csd-2021/5924034")}&maxwidth=400&maxheight=300&format=json`);
  assert.deepEqual([narrow.status, narrow.body.width, narrow.body.height], [200, 400, 300]);
  assert.match(narrow.body.html ?? "", /width="400" height="300"/);
  assert.equal((await oembed(`url=${encodeURIComponent(`${SITE}/en/places/1984-2022-v1/csd-2021/5924034`)}&maxwidth=100`)).body.width, 280);
});

test("oEmbed refuses anything that is not a place page on this site, and any method but GET", async () => {
  for (const [query, status, error] of [
    ["", 400, "url-required"],
    ["url=not%20a%20url", 400, "url-invalid"],
    [`url=${encodeURIComponent(`${SITE}/en/places/1984-2022-v1/csd-2021/5924034`)}&maxwidth=wide`, 400, "dimension-invalid"],
    [`url=${encodeURIComponent(`${SITE}/en/places/1984-2022-v1/csd-2021/0000000`)}`, 404, "not-a-place-page"],
    [`url=${encodeURIComponent(`${SITE}/en/explore`)}`, 404, "not-a-place-page"],
    [`url=${encodeURIComponent(`${SITE}/en/embed/1984-2022-v1/csd-2021/5924034`)}`, 404, "not-a-place-page"],
    [`url=${encodeURIComponent("https://example.com/en/places/1984-2022-v1/csd-2021/5924034")}`, 404, "not-a-place-page"],
    [`url=${encodeURIComponent("javascript:alert(1)//www.witnesstree.ca/en/places/1984-2022-v1/csd-2021/5924034")}`, 404, "not-a-place-page"],
    [`url=${encodeURIComponent(`${SITE}/en/places/1984-2022-v1/csd-2021/5924034`)}&format=xml`, 501, "format-not-supported"],
  ] as const) {
    const response = await oembed(query);
    assert.deepEqual([response.status, response.body.error, response.cache], [status, error, "no-store"], query);
  }
  const posted = await oembed(`url=${encodeURIComponent(`${SITE}/en/places/1984-2022-v1/csd-2021/5924034`)}`, { method: "POST", body: "{}" });
  assert.deepEqual([posted.status, posted.body.error], [405, "method-not-allowed"]);
});
