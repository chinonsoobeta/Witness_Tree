import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { RecordPlacePage } from "../components/places/RecordPlacePage.tsx";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { PLACE_DATA_VERSION, placePageParams, placePageRecord, wholeRecordFigures } from "../lib/place-pages/index.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { fractionWords, placeLeadSentence } from "../lib/place-pages/sentence.ts";

test("a fully mapped place opens with its share, its hectares and the mapped forest", () => {
  // 2,500 of 10,000 cells: 225 ha of 900 ha, 25%.
  const figures = wholeRecordFigures({ union: 2500, known: 10000, unknown: 0 }, { locale: "en" });
  assert.equal(
    placeLeadSentence(figures, "Prince George", "en"),
    "About a quarter (25%) of the forest mapped in Prince George in 1984 was detected as lost at least once by 2022: 225 ha of 900 ha.",
  );
  const french = placeLeadSentence(wholeRecordFigures({ union: 2500, known: 10000, unknown: 0 }, { locale: "fr" }), "Prince George", "fr");
  assert.match(french, /^Environ un quart \(25\s%\) de la forêt cartographiée en 1984/);
  assert.match(french, /\u202F: 225 ha sur 900 ha\.$/);
});

test("a share far from an everyday fraction is given as a number only", () => {
  assert.equal(fractionWords(14, "en"), null);
  assert.equal(fractionWords(26.3, "en"), "About a quarter");
  assert.equal(fractionWords(51, "fr"), "Environ la moitié");
  assert.equal(fractionWords(46.4, "en"), null, "46% is not called half");
  assert.equal(fractionWords(11.5, "en"), null, "a tenth allows one point either side");
  const figures = wholeRecordFigures({ union: 1400, known: 10000, unknown: 0 }, { locale: "en" });
  assert.match(placeLeadSentence(figures, "X", "en"), /^14% of the forest mapped in X/);
});

test("a minimum says so and never states a share", () => {
  for (const locale of ["en", "fr"] as const) {
    const figures = wholeRecordFigures({ union: 10, known: 80, unknown: 20 }, { locale });
    const sentence = placeLeadSentence(figures, "X", locale);
    assert.match(sentence, locale === "en" ? /at least 0\.9 ha/ : /au moins 0,9 ha/);
    assert.match(sentence, locale === "en" ? /That is a minimum: 20% of its forest has no satellite data, so the share lost is Unknown\./ : /C’est un minimum\u202F: 20\s% de sa forêt/);
    // The only percentage is the unmapped share; no share of loss is printed.
    assert.equal(sentence.match(/%/g)?.length, 1);
  }
});

test("an Unknown gives its reason and no number, and an admitted gap is named", () => {
  for (const cells of [{ union: 0, known: 80, unknown: 20 }, { union: 0, known: 0, unknown: 20 }, { union: 0, known: 0, unknown: 0 }]) {
    const sentence = placeLeadSentence(wholeRecordFigures(cells, { locale: "en" }), "X", "en");
    assert.match(sentence, /^Forest loss in X from 1984 to 2022 is Unknown\. /);
    assert.doesNotMatch(sentence, /\b0 ha\b/);
  }
  const admitted = wholeRecordFigures({ union: 100, known: 1000, unknown: 5 }, { locale: "en", unknownTolerancePercent: 1 });
  assert.match(placeLeadSentence(admitted, "X", "en"), / The share leaves out 0\.5% of its forest, which has no satellite data\.$/);
  const none = wholeRecordFigures({ union: 0, known: 1000, unknown: 0 }, { locale: "en" });
  assert.match(placeLeadSentence(none, "X", "en"), /^Satellites detected no forest loss in X from 1984 to 2022, across 90 ha/);
});

test("every page opens with its sentence directly under the name, in both languages", () => {
  for (const { dataVersion, geography, code } of placePageParams()) {
    const record = placePageRecord(dataVersion, geography, code)!;
    for (const locale of ["en", "fr"] as const) {
      const figures = wholeRecordFigures(record.cells, { locale, unknownTolerancePercent: record.unknownTolerancePercent });
      const sentence = placeLeadSentence(figures, record.name[locale], locale);
      if (figures.share.kind !== "figure") assert.doesNotMatch(sentence, locale === "en" ? /of the forest mapped in/ : /de la forêt cartographiée en 1984 à/);
      if (figures.lostIsMinimum) assert.match(sentence, locale === "en" ? /minimum/ : /minimum/);
    }
  }
  const record = placePageRecord(PLACE_DATA_VERSION, "qc-2026", "117")!;
  const html = renderToStaticMarkup(<RecordPlacePage locale="en" record={record} />);
  assert.match(html, /<\/h1><p class="place-hero-sentence">Satellites detected loss on at least/);
});
