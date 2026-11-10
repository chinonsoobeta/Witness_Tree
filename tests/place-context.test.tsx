import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { RecordPlacePage } from "../components/places/RecordPlacePage.tsx";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { formatHectares, formatPercent } from "../lib/domain/index.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { formatUnknownSharePercent } from "../lib/explore/map-style.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { provinceSpanDisplayRows } from "../lib/explore/province-spans.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { PLACE_DATA_VERSION, placePageParams, placePageRecord, placeReferenceFigures, wholeRecordFigures } from "../lib/place-pages/index.ts";

const PROVINCES = provinceSpanDisplayRows({ fromYear: 1984, toYear: 2022 });
const decode = (html: string) => html.replace(/&lt;/g, "<").replace(/&amp;/g, "&");
const spans = (html: string, className: string) =>
  [...html.matchAll(new RegExp(`class="${className}">([^<]*)<`, "g"))].map((match) => decode(match[1]!));

test("each page sets the place's share beside its province's, with the province's unmapped share", () => {
  for (const [geography, code, locale] of [["csd-2021", "5924034", "en"], ["federal-2023", "59001", "en"], ["er-2021", "4830", "fr"]] as const) {
    const record = placePageRecord(PLACE_DATA_VERSION, geography, code)!;
    const province = PROVINCES.find((row) => row.code === record.province)!;
    const [line] = spans(renderToStaticMarkup(<RecordPlacePage record={record} locale={locale} />), "place-stat-context");
    assert.ok(line, `${geography}/${code} has a province line`);
    assert.ok(line.includes(formatPercent(province.unionLossPercent!, locale)), line);
    assert.ok(line.includes(formatUnknownSharePercent(province.unknownSharePercent, locale)), "the province's unmapped share travels with its share");
    assert.match(line, locale === "en" ? /of the forest mapped there in 1984/ : /de la forêt cartographiée en 1984/);
    if (locale === "fr") assert.match(line, /\u202F: /);
  }
});

test("a linked riding or region shows its own figure by its own page's rule", () => {
  const record = placePageRecord(PLACE_DATA_VERSION, "csd-2021", "5924034")!;
  const html = renderToStaticMarkup(<RecordPlacePage record={record} locale="en" />);
  const lines = spans(html, "place-related-figure");
  const linked = [record.region!, ...record.federal, ...record.provincial];
  assert.equal(lines.length, linked.length, "one figure per area the community sits in");
  linked.forEach((reference, index) => {
    const own = placePageRecord(PLACE_DATA_VERSION, reference.geography, reference.code)!;
    const figures = wholeRecordFigures(own.cells, { locale: "en", unknownTolerancePercent: own.unknownTolerancePercent });
    assert.deepEqual(placeReferenceFigures(reference, "en"), figures);
    const line = lines[index]!;
    if (figures.share.kind === "figure") {
      assert.ok(line.startsWith(`${formatPercent(figures.share.value, "en")} of its forest`), line);
      if (figures.admittedUnknownPercent !== undefined) assert.match(line, /with no satellite data left out/);
    } else if (figures.lostIsMinimum) {
      assert.equal(line, `At least ${formatHectares((figures.lost as { value: number }).value, "en")} lost. The share is Unknown: ${formatUnknownSharePercent(figures.unknownSharePercent!, "en")} of its forest has no satellite data.`);
    } else {
      assert.match(line, /^Share lost: Unknown\. /);
    }
  });
});

test("across every community, a linked minimum or Unknown is never written as a plain share or as zero", () => {
  const seen = { figure: 0, minimum: 0, unknown: 0 };
  for (const { geography, code } of placePageParams()) {
    if (geography !== "csd-2021") continue;
    const record = placePageRecord(PLACE_DATA_VERSION, geography, code)!;
    for (const reference of [record.region!, ...record.federal, ...record.provincial]) {
      const figures = placeReferenceFigures(reference, "en")!;
      if (figures.share.kind === "figure") seen.figure += 1;
      else if (figures.lostIsMinimum) {
        seen.minimum += 1;
        assert.equal(figures.lost.kind, "figure");
      } else {
        seen.unknown += 1;
        assert.equal(figures.share.kind, "unknown");
      }
    }
  }
  assert.ok(seen.figure > 0 && seen.minimum > 0 && seen.unknown > 0, JSON.stringify(seen));
  const prairie = renderToStaticMarkup(<RecordPlacePage record={placePageRecord(PLACE_DATA_VERSION, "csd-2021", "4806016")!} locale="fr" />);
  for (const line of spans(prairie, "place-related-figure")) {
    assert.doesNotMatch(line, /^0 ?%|^0\s?ha/, "an Unknown is never 0");
    assert.match(line, /^(Au moins .* perdus\. La part est inconnue\u202F: |Part perdue\u202F: inconnue\. |[\d\u202F\u00A0 ,]+\s?% de sa forêt)/, line);
  }
});

test("riding and region pages link no containing area, so they carry the province line only", () => {
  const riding = placePageRecord(PLACE_DATA_VERSION, "federal-2023", "59001")!;
  const html = renderToStaticMarkup(<RecordPlacePage record={riding} locale="en" />);
  assert.equal(spans(html, "place-related-figure").length, 0);
  assert.equal(spans(html, "place-stat-context").length, 1);
});
