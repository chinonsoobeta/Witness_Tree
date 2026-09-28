import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Node test runner needs extensions.
import { formatNumber } from "../lib/domain/number.ts";
// @ts-expect-error Node test runner needs extensions.
import { CitiesMostLost, RidingsMostLost } from "../components/site/RidingsMostLost.tsx";
// @ts-expect-error Node test runner needs extensions.
import { CITY_RANK_FLOOR_HECTARES, citiesByWholeRecordLoss, ridingsByWholeRecordLoss, WHOLE_RECORD_RANK_FLOOR_HECTARES } from "../lib/search/site-search.ts";
// @ts-expect-error Node test runner needs extensions.
import { PLACE_NAME_INDEX } from "../lib/search/place-names.ts";
// @ts-expect-error Node test runner needs extensions.
import { placeFigure } from "../lib/search/place-figures.ts";

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

test("the home section lists ten ridings of each kind in both languages, each opening its search result", () => {
  const english = renderToStaticMarkup(<RidingsMostLost locale="en" />);
  const french = renderToStaticMarkup(<RidingsMostLost locale="fr" />);
  for (const [markup, search] of [[english, "/en/search"], [french, "/fr/recherche"]] as const) {
    assert.match(markup, /id="ridings-most-lost"/);
    assert.equal((markup.match(/<li>/g) ?? []).length, 20);
    assert.equal((markup.match(new RegExp(`href="${search}\\?q=`, "g")) ?? []).length, 20);
    assert.doesNotMatch(markup, />0(?:[.,]0+)? ?%/);
  }
  assert.match(english, /Only ridings mapped in full, with at least 50,000 ha of forest, are ranked/);
  assert.match(english, /never counted as zero/);
  assert.match(english, /a satellite can’t tell why trees are gone/);
  assert.match(french, /jamais comptées comme zéro/);
  assert.ok(french.includes(`${formatNumber(WHOLE_RECORD_RANK_FLOOR_HECTARES, "fr", 0)} ha`), "the French floor uses French number formatting");
});

test("cities are ranked from their own figures, fully mapped, above the forest floor, and cities only", () => {
  const rows = citiesByWholeRecordLoss(500);
  const types = new Map(PLACE_NAME_INDEX.places.map((place: { id: string; type: string }) => [place.id, place.type]));
  assert.ok(rows.length >= 5);
  for (let index = 1; index < rows.length; index += 1) {
    assert.ok(rows[index - 1].lossPercent >= rows[index].lossPercent, "ordered by share");
  }
  for (const row of rows) {
    const figure = placeFigure(row.id);
    assert.equal(figure?.coverage, "complete", row.id);
    assert.ok(figure!.knownForestedHectares >= CITY_RANK_FLOOR_HECTARES, `${row.id} clears the floor`);
    assert.equal(row.lossPercent, figure!.observedLossPercent, `${row.id} carries search's own figure`);
    assert.match(types.get(row.id) ?? "", /^(CY|C|CV|V)$/, `${row.id} is a city`);
    assert.match(row.province, /^(BC|AB|ON|QC)$/);
  }
  // A partly mapped city is left out, never ranked as if its unmapped forest were intact.
  const partial = PLACE_NAME_INDEX.places.find((place: { id: string; type: string }) => /^(CY|V)$/.test(place.type) && placeFigure(place.id)?.coverage === "partial-with-unknown");
  assert.ok(partial && !rows.some((row) => row.id === partial.id));
});

test("the home section lists ten cities, each named with its province in full, in both languages", () => {
  const english = renderToStaticMarkup(<CitiesMostLost locale="en" />);
  const french = renderToStaticMarkup(<CitiesMostLost locale="fr" />);
  for (const [markup, search] of [[english, "/en/search"], [french, "/fr/recherche"]] as const) {
    assert.match(markup, /id="cities-most-lost"/);
    assert.equal((markup.match(/<li>/g) ?? []).length, 10);
    assert.equal((markup.match(new RegExp(`href="${search}\\?q=`, "g")) ?? []).length, 10);
    // The second column carries on from six, so the ranks read 1 to 10.
    assert.match(markup, /<ol class="ridings-most-lost-list" start="6">/);
    // The province is spelled out after the name, not abbreviated in the figure line.
    assert.doesNotMatch(markup, /(BC|AB|ON|QC) · /);
  }
  assert.match(english, />Campbell River, British Columbia</);
  assert.match(english, />Dolbeau-Mistassini, Québec</);
  assert.match(french, />Campbell River, Colombie-Britannique</);
  // The search link still looks the city up by its own name.
  assert.match(english, /href="\/en\/search\?q=Campbell%20River"/);
  assert.match(english, /Only cities mapped in full, with at least 5,000 ha of forest, are ranked/);
  assert.match(english, /never counted as zero/);
  assert.match(french, /jamais comptées comme zéro/);
  assert.ok(french.includes(`${formatNumber(CITY_RANK_FLOOR_HECTARES, "fr", 0)} ha`));
});
