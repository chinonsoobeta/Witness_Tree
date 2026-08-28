import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

import comparison from "../data/phase2-official-published-harvest-comparison.json";
import { OfficialPublishedHarvestComparison } from "../components/transparency/OfficialPublishedHarvestComparison";

test("the bilingual public table discloses rounding, withholding, and non-comparability", () => {
  const english = renderToStaticMarkup(<OfficialPublishedHarvestComparison rows={comparison.rows} locale="en" province="BC" />);
  const french = renderToStaticMarkup(<OfficialPublishedHarvestComparison rows={comparison.rows} locale="fr" province="QC" />);
  assert.match(english, /Official-source harvest comparison/);
  assert.match(english, /not like-for-like/i);
  assert.match(english, /±50 ha/);
  assert.match(english, /Not published/);
  assert.match(english, /never zero/i);
  assert.match(french, /Comparaison avec une source officielle sur la récolte/);
  assert.match(french, /ne sont pas directement comparables/i);
  assert.match(french, /Non publiée/);
  assert.match(french, /jamais zéro/i);
});

test("the checked-in public artifact contains 104 rounded rows, 14 withheld rows, and no restricted values", () => {
  assert.deepEqual(comparison.summary, { rows: 118, computedRoundedRows: 104, restrictedPendingRows: 14, strictNfdExactTotalsRemainingNull: 118, safeExactNfdReplacementRows: 0 });
  const pending = comparison.rows.filter((row) => row.comparisonStatus === "pending-restricted-source");
  assert.equal(pending.length, 14);
  assert.equal(pending.every((row) => row.referenceHectaresNominal === null && row.referenceSourceValueSquareKilometres === null), true);
  assert.equal(comparison.rows.every((row) => row.strictNfdExactTotalHectares === null), true);
});

test("both routes are independently citable and link from the data page", () => {
  const en = readFileSync(new URL("../app/en/data/official-harvest-comparison/page.tsx", import.meta.url), "utf8");
  const fr = readFileSync(new URL("../app/fr/donnees/comparaison-recolte-officielle/page.tsx", import.meta.url), "utf8");
  const dataPage = readFileSync(new URL("../components/transparency/DataPage.tsx", import.meta.url), "utf8");
  assert.match(en, /locale="en"/);
  assert.match(fr, /locale="fr"/);
  assert.match(en, /alternates: \{ languages:/);
  assert.match(fr, /alternates: \{ languages:/);
  assert.match(dataPage, /official-harvest-comparison/);
  assert.match(dataPage, /comparaison-recolte-officielle/);
});
