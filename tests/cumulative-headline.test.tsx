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

/**
 * The measurement is nullable twice over: the whole call returns null unless
 * all four provinces are present, and every figure in it is separately
 * nullable, because a province the sources never mapped has no number rather
 * than a zero. The component renders nothing unless all five are present, so a
 * test that carried the nulls through would be asserting about an empty page.
 * This resolves them once and says which one is missing if any is.
 */
const FIGURES = ["unionLossHectares", "knownForestedHectares", "unionLossPercent", "summedLossHectares", "unknownHectares"] as const;
type Measured = Record<(typeof FIGURES)[number], number>;

function measureWholeRecord(): Measured {
  const measurement = fourProvinceSpanMeasurement(WHOLE);
  assert.ok(measurement, "the whole-record span is measurable for all four provinces");
  const measured = {} as Measured;
  for (const figure of FIGURES) {
    const value = measurement[figure];
    assert.ok(typeof value === "number", `the whole-record span states no ${figure}, so the headline renders nothing`);
    measured[figure] = value;
  }
  return measured;
}

/*
 * The headline publishes the one figure the product exists to state, so the
 * thing worth pinning is not that it renders: it is that the figure cannot
 * appear without the three things that bound it. Each assertion below is a way
 * the number could be separated from its basis and read as a total.
 */
test("the figure, its denominator, its unmapped share and its span are one block", () => {
  const measured = measureWholeRecord();
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(<CumulativeHeadline locale={locale} />);

    // The union figure is exact to the hectare, matching the released artifact.
    const figure = /<p class="cumulative-figure">([^<]+)<\/p>/.exec(markup);
    assert.ok(figure, `no figure in ${locale}`);
    assert.equal(figure[1], formatHectares(measured.unionLossHectares, locale));

    // The heading names the years. A heading read on its own, in a list of
    // headings, still has to say which period the figure covers.
    assert.match(markup, /<h2 id="cumulative-headline-heading">[^<]*1984[^<]*2022[^<]*<\/h2>/);

    // Percentage and denominator share one description, in the same block as
    // the figure. A share printed away from its basis is the exact failure the
    // province series checker exists to refuse, and it would be a total in
    // everything but name.
    const share = formatPercent(measured.unionLossPercent, locale);
    const known = formatHectares(measured.knownForestedHectares, locale);
    const measures = [...markup.matchAll(/<div class="cumulative-measure">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
    const union = measures.find((block) => block.includes(formatHectares(measured.unionLossHectares, locale)));
    assert.ok(union, `the union block is missing in ${locale}`);
    assert.ok(union.includes(share), `the share is missing in ${locale}`);
    assert.ok(union.includes(known), `the share is printed without its denominator in ${locale}`);

    // The unknown area is stated in the same section, as a minimum, not as a
    // footnote under it.
    const minimum = /<p class="cumulative-minimum">([\s\S]*?)<\/p>/.exec(markup)?.[1];
    assert.ok(minimum, `no minimum statement in ${locale}`);
    assert.match(minimum, locale === "en" ? /This is a minimum\./ : /C’est un minimum\./);
    assert.ok(minimum.includes(formatHectares(measured.unknownHectares, locale)));
    assert.match(minimum, locale === "en" ? /unknown, not zero/ : /inconnues, pas comme nulles/);
  }
});

/*
 * Until 2026-11-10 the headline set the yearly losses added together beside
 * this figure as a second measure. The harvest and fire page says yearly
 * losses are never added up on this site, so the home headline contradicted
 * it (audit item A2). The sum is stated in Explore's figures panel, where it
 * is explained; here it must not appear at all, in any form.
 */
test("the headline states one figure and never the yearly sum", () => {
  const measured = measureWholeRecord();
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(<CumulativeHeadline locale={locale} />);
    const summed = formatHectares(measured.summedLossHectares, locale);

    // The sum is a different, larger number, so its absence is a real check.
    assert.ok(measured.summedLossHectares > measured.unionLossHectares);
    assert.ok(!markup.includes(summed), `the yearly sum is still printed in ${locale}`);
    assert.doesNotMatch(markup, locale === "en" ? /added together|counts twice/i : /additionn|compte deux fois/i);

    // Exactly one figure and one measure block, and the figure is the union.
    const figures = [...markup.matchAll(/<p class="cumulative-figure">([^<]+)<\/p>/g)].map((match) => match[1]);
    assert.deepEqual(figures, [formatHectares(measured.unionLossHectares, locale)]);
    assert.equal((markup.match(/<div class="cumulative-measure">/g) ?? []).length, 1);
    assert.doesNotMatch(markup, /cumulative-pair/);
  }
});
