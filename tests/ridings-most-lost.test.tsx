import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Node test runner needs extensions.
import { formatNumber } from "../lib/domain/number.ts";
// @ts-expect-error Node test runner needs extensions.
import { CitiesMostLost, RidingsMostLost } from "../components/site/RidingsMostLost.tsx";
// @ts-expect-error Node test runner needs extensions.
import { CITY_RANK_FLOOR_HECTARES, citiesByWholeRecordLoss, RIDING_RANK_UNKNOWN_TOLERANCE_PERCENT, ridingsByWholeRecordLoss, WHOLE_RECORD_RANK_FLOOR_HECTARES } from "../lib/search/site-search.ts";
// @ts-expect-error Node test runner needs extensions.
import { PLACE_NAME_INDEX } from "../lib/search/place-names.ts";
// @ts-expect-error Node test runner needs extensions.
import { placeFigure } from "../lib/search/place-figures.ts";

test("ridings are ranked by share of mapped forest lost, above the forest floor, and mapped in full or all but under 1%", () => {
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
      // The owner's 2026-10-03 tolerance: under 1% unmapped, and it travels with the share.
      if (row.unmappedPercent !== undefined) assert.ok(row.unmappedPercent > 0 && row.unmappedPercent < RIDING_RANK_UNKNOWN_TOLERANCE_PERCENT, row.id);
    }
  }
});

// The owner asked on 2026-10-03 for the top five per province, in four
// columns (BC, AB, ON, QC), federal ridings before provincial ones.
const PROVINCE_ORDER = ["BC", "AB", "ON", "QC"] as const;

function expectedColumns(rank: (province: string) => readonly { name: { en: string } }[]) {
  return PROVINCE_ORDER.map((province) => rank(province));
}

test("the home section lists the top five ridings of each kind per province, each opening its search result", () => {
  const english = renderToStaticMarkup(<RidingsMostLost locale="en" />);
  const french = renderToStaticMarkup(<RidingsMostLost locale="fr" />);
  const columns = [
    ...expectedColumns((province) => ridingsByWholeRecordLoss("federal", 5, province)),
    ...expectedColumns((province) => ridingsByWholeRecordLoss("provincial", 5, province)),
  ];
  const total = columns.reduce((n, rows) => n + rows.length, 0);
  assert.ok(columns.every((rows) => rows.length <= 5));
  assert.ok(total > 8, "most columns have entries");
  for (const [markup, search] of [[english, "/en/search"], [french, "/fr/recherche"]] as const) {
    assert.match(markup, /id="ridings-most-lost"/);
    assert.equal((markup.match(/<li>/g) ?? []).length, total);
    assert.equal((markup.match(new RegExp(`href="${search}\\?q=`, "g")) ?? []).length, total);
    assert.equal((markup.match(/<h4>/g) ?? []).length, 8, "four province columns per row");
    assert.doesNotMatch(markup, />0(?:[.,]0+)? ?%/);
  }
  assert.ok(english.indexOf("Federal") < english.indexOf("Provincial"), "federal row first");
  assert.ok(english.indexOf(">British Columbia<") < english.indexOf(">Alberta<"));
  assert.ok(english.indexOf(">Ontario<") < english.indexOf(">Québec<"));
  assert.equal(RIDING_RANK_UNKNOWN_TOLERANCE_PERCENT, 1);
  assert.match(english, /Only ridings with at least 50,000 ha of forest, mapped in full or with less than 1% unmapped, are ranked/);
  // An admitted riding names its unmapped share beside its figure.
  assert.match(english, />Thunder Bay—Superior North<\/a><span class="ridings-most-lost-figure">.*?· 0\.72% unmapped</);
  // A column cut short says where the province's unmapped land lies.
  assert.match(english, /Only 3 ridings are mapped well enough, with enough forest, to rank\. Unmapped land here lies mostly in the prairies/);
  assert.match(french, /Les terres non cartographiées se trouvent ici surtout dans les Prairies/);
  assert.match(english, /never counted as zero/);
  assert.match(english, /satellite imagery can’t tell why trees are gone/);
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

test("the home section lists the top five cities per province, in both languages", () => {
  const english = renderToStaticMarkup(<CitiesMostLost locale="en" />);
  const french = renderToStaticMarkup(<CitiesMostLost locale="fr" />);
  const columns = expectedColumns((province) => citiesByWholeRecordLoss(5, province));
  const total = columns.reduce((n, rows) => n + rows.length, 0);
  assert.ok(columns.every((rows) => rows.length <= 5));
  for (const [markup, search] of [[english, "/en/search"], [french, "/fr/recherche"]] as const) {
    assert.match(markup, /id="cities-most-lost"/);
    assert.equal((markup.match(/<li>/g) ?? []).length, total);
    assert.equal((markup.match(new RegExp(`href="${search}\\?q=`, "g")) ?? []).length, total);
    assert.equal((markup.match(/<h4>/g) ?? []).length, 4);
    assert.doesNotMatch(markup, /(BC|AB|ON|QC) · /);
  }
  assert.match(english, /<h4>British Columbia<\/h4>/);
  assert.match(french, /<h4>Colombie-Britannique<\/h4>/);
  // The search link still looks the city up by its own name.
  assert.match(english, /href="\/en\/search\?q=Campbell%20River"/);
  // The owner's shorter wording of 2026-10-03.
  assert.match(english, /Only cities with at least 5,000 ha of forest are ranked\./);
  assert.match(english, /No city here had enough forest to rank\./);
  // Each province column numbers its own entries from 1.
  assert.doesNotMatch(english, /<ol[^>]*start=/);
  assert.ok(french.includes(`${formatNumber(CITY_RANK_FLOOR_HECTARES, "fr", 0)} ha`));
});

