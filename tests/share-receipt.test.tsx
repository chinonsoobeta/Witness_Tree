import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { PRODUCT_NAME } from "../lib/domain/brand.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { PLACE_DATA_VERSION, placePageParams, placePageRecord, type PlacePageRecord } from "../lib/place-pages/index.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { placeSummary } from "../lib/place-pages/summary.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { RECEIPT_SIZE, receiptAlt, receiptPath } from "../lib/share/meta.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { RECEIPT_TOKENS, ReceiptCard } from "../lib/share/receipt.tsx";

const LOCALES = ["en", "fr"] as const;

/** The card's printed text, as Satori would lay it out. */
function place(dataVersion: string, geography: string, code: string): PlacePageRecord {
  const record = placePageRecord(dataVersion, geography, code);
  assert.ok(record, `no place page for ${geography}/${code}`);
  return record;
}

function cardText(record: PlacePageRecord, locale: "en" | "fr"): string {
  return renderToStaticMarkup(<ReceiptCard record={record} locale={locale} />)
    .replace(/<[^>]*>/g, "\n")
    .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

test("the card's colours are the light palette's tokens in app/globals.css", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const variable = { ground: "ground", surface2: "surface-2", ink: "ink", ink2: "ink-2", muted: "muted", rule: "rule", accent: "accent", heroFill: "hero-fill", heroInk: "hero-ink", tintSatellite: "tint-satellite", edgeSatellite: "edge-satellite", tintUnknown: "tint-unknown", edgeUnknown: "edge-unknown" } as const;
  assert.deepEqual(Object.keys(RECEIPT_TOKENS).sort(), Object.keys(variable).sort());
  for (const [token, name] of Object.entries(variable)) {
    // The first declaration of each variable is the light :root palette.
    const declared = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\s*;`, "i"))?.[1];
    assert.equal(RECEIPT_TOKENS[token as keyof typeof RECEIPT_TOKENS], declared?.toLowerCase(), `--${name}`);
  }
});

test("every place's card carries its caveats, and an Unknown reads as the page's Unknown with its reason, never 0 or blank", () => {
  let unknownCards = 0;
  for (const { dataVersion, geography, code } of placePageParams()) {
    const record = place(dataVersion, geography, code);
    for (const locale of LOCALES) {
      const summary = placeSummary(record, locale);
      const text = cardText(record, locale);
      const where = `${locale}/${geography}/${code}`;
      for (const value of [PRODUCT_NAME[locale], summary.name, summary.lostLabel, summary.coverage, summary.unmapped, record.boundary.edition, PLACE_DATA_VERSION, "1984–2022"]) {
        assert.ok(value && text.includes(value), `${where} lacks ${JSON.stringify(value)}`);
      }
      assert.match(text, locale === "en" ? /Open Government Licence – Canada/ : /Licence du gouvernement ouvert – Canada/, where);
      assert.ok(text.includes(summary.lost) && summary.lost.trim() !== "", `${where} has no whole-record figure`);
      if (summary.figures.lost.kind === "unknown") {
        unknownCards += 1;
        assert.equal(summary.lost, locale === "en" ? "Unknown" : "Inconnu", where);
        assert.ok(text.includes(summary.figures.lost.reason[locale]), `${where} drops the Unknown's reason`);
        assert.doesNotMatch(text, /(^|\D)0(\s|\u202F|\u00a0)*ha\b/, `${where} prints an Unknown as 0`);
      }
    }
  }
  assert.ok(unknownCards > 0, "the data has Unknown places, so the test must have checked some");
});

test("the card's address and download name carry no product name, and each locale has alt text", () => {
  const record = place(PLACE_DATA_VERSION, "csd-2021", "5924034");
  assert.deepEqual(RECEIPT_SIZE, { width: 1200, height: 630 });
  assert.equal(receiptPath("en", record), "/en/places/1984-2022-v1/csd-2021/5924034/opengraph-image");
  assert.equal(receiptPath("fr", record), "/fr/lieux/1984-2022-v1/csd-2021/5924034/opengraph-image");
  for (const locale of LOCALES) {
    for (const name of Object.values(PRODUCT_NAME) as string[]) {
      assert.doesNotMatch(receiptPath(locale, record).toLowerCase(), new RegExp(name.toLowerCase().replace(/\s+/g, "[-_ ]?")));
    }
    assert.ok(receiptAlt(locale).length > 60, `${locale} alt text`);
  }
  assert.notEqual(receiptAlt("en"), receiptAlt("fr"));
  assert.match(receiptAlt("en"), /Unknown/);
  assert.match(receiptAlt("fr"), /Inconnu/);
});
