import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Node test runner needs extensions.
import { ProvinceRecordList } from "../components/site/ProvinceRecordList.tsx";
// @ts-expect-error Node test runner needs extensions.
import { RecoveryAnswer } from "../components/site/RecoveryAnswer.tsx";
// @ts-expect-error Node test runner needs extensions.
import { provinceSpanDisplayRows } from "../lib/explore/province-spans.ts";
// @ts-expect-error Node test runner needs extensions.
import { formatHectares, formatPercent } from "../lib/domain/number.ts";
// @ts-expect-error Node test runner needs extensions.
import { formatUnknownSharePercent } from "../lib/explore/map-style.ts";
// @ts-expect-error Node test runner needs extensions.
import { conditionRecoveryView } from "../lib/explore/condition-recovery.ts";

const ROWS = provinceSpanDisplayRows({ fromYear: 1984, toYear: 2022 });

/*
 * The home page lists the four provinces one short entry each (audit
 * 2026-11-10, A4). Shortening the page must not turn a minimum into a plain
 * number, so each entry is held to the figure exactly as the record states it,
 * its share and denominator, the minimum, and the unmapped share with its
 * reason.
 */
test("each province entry keeps its figure, share, minimum and unmapped reason", () => {
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(<ProvinceRecordList rows={ROWS} locale={locale} labelledBy="by-province" />);
    assert.match(markup, /<ul class="home-provinces-list" aria-labelledby="by-province">/);
    const entries = [...markup.matchAll(/<li class="home-province">([\s\S]*?)<\/li>/g)].map((match) => match[1]);
    assert.equal(entries.length, 4);

    // Ranked by the figure printed, largest first.
    const ranked = [...ROWS].sort((a, b) => (b.unionLossHectares ?? 0) - (a.unionLossHectares ?? 0));
    ranked.forEach((row, index) => {
      const entry = entries[index];
      assert.ok(entry.includes(row.name[locale]), `${locale}: entry ${index} is not ${row.name.en}`);
      // Exact to the hundredth, so "at least once" and "a minimum" are never rounded up.
      assert.ok(entry.includes(formatHectares(row.unionLossHectares as number, locale)), `${locale} ${row.code}: figure`);
      assert.match(entry, locale === "en" ? /lost at least once/ : /perdus au moins une fois/);
      assert.ok(entry.includes(formatPercent(row.unionLossPercent as number, locale)), `${locale} ${row.code}: share`);
      assert.match(entry, locale === "en" ? /of its forest mapped in 1984/ : /de sa forêt cartographiée en 1984/);
      assert.match(entry, locale === "en" ? /A minimum\./ : /Un minimum\./);
      const unknownShare = formatUnknownSharePercent(row.unknownSharePercent, locale).replace("<", "&lt;");
      assert.ok(entry.includes(unknownShare), `${locale} ${row.code}: unmapped share`);
      assert.match(entry, locale === "en" ? /unknown, not zero/ : /inconnues, pas nulles/);
      const methods = locale === "en" ? "/en/methods#coverage-gap" : "/fr/methodes#coverage-gap";
      assert.ok(entry.includes(`<a href="${methods}">${row.unmappedCharacter[locale]}</a>`), `${locale} ${row.code}: reason`);
    });

    // British Columbia's gap is under a hundredth of a percent, and says so rather than 0%.
    const bc = entries.find((entry) => /British Columbia|Colombie-Britannique/.test(entry));
    assert.ok(bc);
    assert.match(bc, /&lt;0[.,]01/);
    assert.match(bc, /shoreline|littoral/);
  }
});

test("a province with no figure reads Unknown, never zero", () => {
  const blank = ROWS.map((row, index) => index === 0
    ? { ...row, unionLossHectares: null, unionLossPercent: null, unknownHectares: null }
    : row);
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(<ProvinceRecordList rows={blank} locale={locale} labelledBy="x" />);
    const entry = [...markup.matchAll(/<li class="home-province">([\s\S]*?)<\/li>/g)].map((match) => match[1])
      .find((item) => item.includes(blank[0].name[locale]));
    assert.ok(entry);
    const word = locale === "en" ? "Unknown" : "Inconnu";
    assert.match(entry, new RegExp(`<span>${word}</span>`));
    assert.match(entry, new RegExp(`${locale === "en" ? "no data for" : "pas de données pour"} ${word}`));
    assert.doesNotMatch(entry, /\b0 ha\b|\b0(?:[.,]0+)?\s?%/);
  }
});

/*
 * Recovery on the home page is one line (A5). It keeps the area it is a share
 * of, what "treed" measures, the Unknown area, and the way to the full view.
 */
test("the recovery line keeps its share, its base, its Unknown area and its link", () => {
  const four = conditionRecoveryView()?.rows.find((row: { kind: string }) => row.kind === "four-provinces");
  assert.ok(four && four.latestRecoveredPercent !== null);
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(<RecoveryAnswer locale={locale} />);
    assert.match(markup, /^<p class="home-recovery">/);
    assert.equal((markup.match(/<p\b/g) ?? []).length, 1, "one line");
    assert.ok(markup.includes(formatPercent(Math.round(four.latestRecoveredPercent * 10) / 10, locale)));
    assert.match(markup, locale === "en" ? /million ha that lost tree cover/ : /millions d’hectares qui ont perdu leur couvert arboré/);
    assert.match(markup, locale === "en" ? /counts trees, not the forest that was there/ : /On compte les arbres, et non la forêt/);
    assert.ok(markup.includes(formatHectares(Math.round(four.unknownHectares), locale, 0)));
    assert.match(markup, locale === "en" ? /is Unknown and left out/ : /sont inconnus et exclus/);
    assert.match(markup, new RegExp(`href="/${locale === "en" ? "en/explore" : "fr/explorer"}\\?mode=condition-recovery"`));
  }
});
