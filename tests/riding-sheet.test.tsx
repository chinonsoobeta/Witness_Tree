import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordPlacePage } from "../components/places/RecordPlacePage.tsx";
import { RidingSheet, ridingSheetMetadata } from "../components/places/RidingSheet.tsx";
import { isRidingGeography, PLACE_DATA_VERSION, placePageParams, placePageRecord, ridingSheetPath } from "../lib/place-pages/index.ts";
import { placeSummary } from "../lib/place-pages/summary.ts";
import { SITE_ORIGIN } from "../lib/site-metadata.ts";

/*
 * The riding print sheet (feature plan item 2): every riding has one, in both
 * languages, and it says what the page says, under the neutral-language rules.
 */

const ridings = placePageParams().filter(({ geography }) => isRidingGeography(geography));
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/[ \t\n\r]+/g, " ");

test("only federal and provincial ridings have a sheet, at the place page's address plus /print", () => {
  assert.equal(ridings.length, 280 + 431);
  assert.equal(ridingSheetPath("en", "federal-2023", "59001"), "/en/places/1984-2022-v1/federal-2023/59001/print");
  assert.equal(ridingSheetPath("fr", "qc-2026", "117"), "/fr/lieux/1984-2022-v1/qc-2026/117/print");
  assert.equal(isRidingGeography("csd-2021"), false);
  assert.equal(isRidingGeography("er-2021"), false);
});

test("every riding sheet prints its figure or its Unknown with the reason, its coverage, sources, citation and address", () => {
  for (const { geography, code } of ridings) {
    const record = placePageRecord(PLACE_DATA_VERSION, geography, code)!;
    for (const locale of ["en", "fr"] as const) {
      const summary = placeSummary(record, locale);
      const html = renderToStaticMarkup(<RidingSheet locale={locale} record={record} />);
      const words = text(html);
      const where = `${locale} ${geography}/${code}`;
      assert.match(html, /<main id="main" class="riding-sheet">/, where);
      assert.match(words, locale === "en" ? /Detected loss as a share of mapped forest/ : /Perte détectée en part de la forêt cartographiée/, where);
      if (summary.figures.share.kind === "figure") assert.ok(words.includes(summary.share), where);
      else assert.ok(words.includes(summary.figures.share.reason[locale]), `${where} share reason`);
      if (summary.figures.share.kind === "unknown") assert.ok(words.includes(`– ${locale === "en" ? "Unknown" : "Inconnu"} ${summary.figures.share.reason[locale]}`), `${where} share Unknown`);
      if (summary.figures.lost.kind === "unknown") {
        assert.ok(words.includes(summary.figures.lost.reason[locale]), `${where} loss reason`);
        // An Unknown prints as Unknown beside its label, never as a zero figure.
        const colon = locale === "fr" ? "\u202f:" : ":";
        assert.ok(words.includes(`${summary.lostLabel}${colon} – ${summary.lost}. ${summary.figures.lost.reason[locale]}`), `${where} loss Unknown`);
        assert.ok(!words.includes(`${summary.lostLabel}${colon} 0`), `${where} loss zero`);
      } else {
        assert.ok(words.includes(summary.lost), where);
      }
      assert.ok(words.includes(summary.coverage), `${where} coverage`);
      assert.ok(words.includes(summary.citation), `${where} citation`);
      assert.ok(words.includes(`${SITE_ORIGIN}${summary.path}`), `${where} address`);
      assert.ok(words.includes(record.boundary.edition), where);
      assert.match(words, /1984-2022-v1/);
      assert.match(words, /open\.canada\.ca\/data\/(en|fr)\/dataset\/2785c103-9c2d-429b-9f3d-89f5cd9ea94d/, where);
      assert.match(words, /CA_Forest_Harvest_1985-2022\.zip/, where);
      assert.match(words, /CA_Forest_Fire_1985-2022\.zip/, where);
      assert.match(html, /<svg class="hf-chart-svg" role="img" aria-label="[^"]+"/, where);
      // No ranking position, no colour scale, no representative.
      assert.doesNotMatch(words, /\b(rank|ranked|ranking|worst|best|top|highest|lowest|MP|MLA|MPP|MNA|member of parliament)\b|classement|rang |député|élu/i, where);
      assert.doesNotMatch(html, /class="[^"]*(scale|choropleth|ramp)/, where);
    }
  }
});

test("the sheet is not indexed and pairs with its other language", () => {
  const record = placePageRecord(PLACE_DATA_VERSION, "federal-2023", "24002")!;
  const metadata = ridingSheetMetadata("fr", record);
  assert.deepEqual(metadata.robots, { index: false, follow: true });
  assert.deepEqual(metadata.alternates?.languages, {
    en: "/en/places/1984-2022-v1/federal-2023/24002/print",
    fr: "/fr/lieux/1984-2022-v1/federal-2023/24002/print",
  });
});

test("a riding's page links to its sheet; a community's and a region's do not", () => {
  const riding = placePageRecord(PLACE_DATA_VERSION, "bc-2023", "258")!;
  const community = placePageRecord(PLACE_DATA_VERSION, "csd-2021", "5924034")!;
  assert.match(renderToStaticMarkup(<RecordPlacePage locale="en" record={riding} />), /<a href="\/en\/places\/1984-2022-v1\/bc-2023\/258\/print">Print a one-page sheet for this riding<\/a>/);
  assert.match(renderToStaticMarkup(<RecordPlacePage locale="fr" record={riding} />), /<a href="\/fr\/lieux\/1984-2022-v1\/bc-2023\/258\/print">/);
  assert.doesNotMatch(renderToStaticMarkup(<RecordPlacePage locale="en" record={community} />), /\/print"/);
  const region = placePageRecord(PLACE_DATA_VERSION, "er-2021", community.region!.code)!;
  assert.doesNotMatch(renderToStaticMarkup(<RecordPlacePage locale="en" record={region} />), /\/print"/);
});
