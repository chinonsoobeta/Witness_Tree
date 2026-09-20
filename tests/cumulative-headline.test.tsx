import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Node test runner needs extensions.
import { CumulativeHeadline } from "../components/site/CumulativeHeadline.tsx";
// @ts-expect-error Node test runner needs extensions.
import { fourProvinceSpanMeasurement } from "../lib/explore/province-spans.ts";
// @ts-expect-error Node test runner needs extensions.
import { formatHectares, formatPercent } from "../lib/domain/number.ts";

const WHOLE = { fromYear: 1984, toYear: 2022 };
const measured = fourProvinceSpanMeasurement(WHOLE);

/*
 * The headline publishes the one figure the product exists to state, so the
 * thing worth pinning is not that it renders: it is that the figure cannot
 * appear without the three things that bound it. Each assertion below is a way
 * the number could be separated from its basis and read as a total.
 */
test("the figure, its denominator, its unmapped share and its span are one block", () => {
  assert.ok(measured, "the whole-record span is measurable for all four provinces");
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(<CumulativeHeadline locale={locale} />);

    // The union figure is exact to the hectare, matching the released artifact.
    const figure = /<p class="cumulative-figure">([^<]+)<\/p>/.exec(markup);
    assert.ok(figure, `no figure in ${locale}`);
    assert.equal(figure[1], formatHectares(measured.unionLossHectares, locale));

    // The heading names the years. A heading read on its own, in a list of
    // headings, still has to say which period the figure covers.
    assert.match(markup, /<h2 id="cumulative-headline-heading">[^<]*1984[^<]*2022[^<]*<\/h2>/);

    // Percentage and denominator share one description. A share printed away
    // from its basis is the exact failure the province series checker exists
    // to refuse, and it would be a total in everything but name.
    const share = formatPercent(measured.unionLossPercent, locale);
    const known = formatHectares(measured.knownForestedHectares, locale);
    const shareCell = [...markup.matchAll(/<dd[^>]*>([\s\S]*?)<\/dd>/g)].map((match) => match[1])
      .find((cell) => cell.includes(share));
    assert.ok(shareCell, `the share is missing in ${locale}`);
    assert.ok(shareCell.includes(known), `the share is printed without its denominator in ${locale}`);

    // The coverage grade is inside the block, not a footnote under it.
    const gradeCell = [...markup.matchAll(/<div class="cumulative-basis-grade">([\s\S]*?)<\/div>/g)][0]?.[1];
    assert.ok(gradeCell, `no grade cell in ${locale}`);
    assert.match(gradeCell, locale === "en" ? /Partial, with unknown/ : /Partielle, avec inconnu/);
    assert.ok(gradeCell.includes(formatHectares(measured.unknownHectares, locale)));
  }
});

test("the annual sum appears only as a different measure, never as the figure", () => {
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(<CumulativeHeadline locale={locale} />);
    const summed = formatHectares(measured.summedLossHectares, locale);

    // Summing the 38 intervals overstates the union by about 25 million
    // hectares, because a cell cleared more than once is counted once here and
    // once per interval there. The larger number is on the page on purpose,
    // and it is only defensible while it is named as a second measure.
    assert.ok(measured.summedLossHectares > measured.unionLossHectares);
    const cells = [...markup.matchAll(/<dd[^>]*>([\s\S]*?)<\/dd>/g)].map((match) => match[1]);
    const summedCells = cells.filter((cell) => cell.includes(summed));
    assert.equal(summedCells.length, 1, `the annual sum appears ${summedCells.length} times in ${locale}`);
    assert.match(
      summedCells[0],
      locale === "en" ? /different measure, not a correction/ : /une autre mesure, et non d’une correction/,
    );

    // And it is never the headline figure itself.
    const figure = /<p class="cumulative-figure">([^<]+)<\/p>/.exec(markup)?.[1];
    assert.notEqual(figure, summed);
  }
});
