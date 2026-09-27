import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Node test runner needs extensions.
import { formatNumber } from "../lib/domain/number.ts";
// @ts-expect-error Node test runner needs extensions.
import { RidingsMostLost } from "../components/site/RidingsMostLost.tsx";
// @ts-expect-error Node test runner needs extensions.
import { ridingsByWholeRecordLoss, WHOLE_RECORD_RANK_FLOOR_HECTARES } from "../lib/search/site-search.ts";

test("ridings are ranked by share of mapped forest lost, fully mapped and above the forest floor only", () => {
  for (const level of ["federal", "provincial"] as const) {
    const rows = ridingsByWholeRecordLoss(level, 50);
    assert.ok(rows.length >= 5, level);
    for (let index = 1; index < rows.length; index += 1) {
      assert.ok(rows[index - 1].lossPercent >= rows[index].lossPercent, `${level} is ordered by share`);
    }
    for (const row of rows) {
      assert.ok(row.lossPercent > 0 && row.lossPercent <= 100);
      // The share's own denominator clears the floor.
      assert.ok(row.lossHectares / (row.lossPercent / 100) >= WHOLE_RECORD_RANK_FLOOR_HECTARES - 1, row.id);
      assert.match(row.province, /^(BC|AB|ON|QC)$/, `${row.id} is inside the four provinces`);
    }
  }
});

test("the home section lists five ridings of each kind in both languages, each opening its search result", () => {
  const english = renderToStaticMarkup(<RidingsMostLost locale="en" />);
  const french = renderToStaticMarkup(<RidingsMostLost locale="fr" />);
  for (const [markup, search] of [[english, "/en/search"], [french, "/fr/recherche"]] as const) {
    assert.match(markup, /id="ridings-most-lost"/);
    assert.equal((markup.match(/<li>/g) ?? []).length, 10);
    assert.equal((markup.match(new RegExp(`href="${search}\\?q=`, "g")) ?? []).length, 10);
    assert.doesNotMatch(markup, />0(?:[.,]0+)? ?%/);
  }
  assert.match(english, /Only ridings mapped in full, with at least 50,000 ha of forest, are ranked/);
  assert.match(english, /never counted as zero/);
  assert.match(english, /a satellite can’t tell why trees are gone/);
  assert.match(french, /jamais comptées comme zéro/);
  assert.ok(french.includes(`${formatNumber(WHOLE_RECORD_RANK_FLOOR_HECTARES, "fr", 0)} ha`), "the French floor uses French number formatting");
});
