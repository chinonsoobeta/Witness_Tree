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
  assert.doesNotMatch(english, /Nominal relative difference|no additional source flag/);
  assert.doesNotMatch(french, /Écart relatif nominal|aucun indicateur supplémentaire/);
  assert.match(english, /<small>–<\/small>/);
  assert.match(french, /<small>–<\/small>/);
  assert.equal((english.match(/scope="col"/g) ?? []).length, 8);
  assert.equal((french.match(/scope="col"/g) ?? []).length, 8);
  assert.match(english, /neither series may be summed across intervals/i);
  assert.match(french, /aucune série ne peut être additionnée entre les intervalles/i);
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
  assert.match(en, /localizedAlternates\("en"/);
  assert.match(fr, /localizedAlternates\("fr"/);
  assert.match(dataPage, /official-harvest-comparison/);
  assert.match(dataPage, /comparaison-recolte-officielle/);
});

test("NFD rows display source decimals, coverage and caveats in both languages without filling unknown cells", () => {
  const row = {
    ...comparison.rows[0], fromYear: 2021, toYear: 2022,
    referenceSourceId: "nfd-5.2-undeclared",
    referenceSourceUrl: "http://nfdp.ccfm.org/en/data/harvest.php",
    referenceHectaresNominal: 112901.942, referenceHectaresExact: "112901.942",
    referenceRoundingHalfWidthHectares: null, comparisonStatus: "pending-incomplete-input",
    witnessTreeCoverageGrade: "unavailable", witnessTreeObservedForestLossHectares: null,
    witnessTreeUnknownRequiredInputHectares: null, nominalSignedDifferenceHectares: null,
  };
  const en = renderToStaticMarkup(<OfficialPublishedHarvestComparison rows={[row]} locale="en" />);
  const fr = renderToStaticMarkup(<OfficialPublishedHarvestComparison rows={[row]} locale="fr" />);
  assert.match(en, /2021–2022/);
  assert.match(en, /112,901\.942/);
  assert.match(fr, /112[\s\u00a0\u202f]901,942/);
  assert.match(en, /NFD, Table 5.2; edition undeclared/);
  assert.match(fr, /BDNF, tableau 5.2; édition non déclarée/);
  assert.match(en, /Required-input area unknown \(ha\): Unknown/);
  assert.match(fr, /Superficie inconnue des données requises \(ha\): Inconnu/);
  assert.match(en, /Incomplete input; difference unknown/);
  assert.match(fr, /Données incomplètes; écart inconnu/);
  assert.match(en, /year-label join does not establish that reporting periods are identical/);
  assert.match(fr, /jointure par année ne prouve pas que les périodes de déclaration sont identiques/);
  assert.doesNotMatch(en, /<td>0<\/td>/);
  assert.doesNotMatch(fr, /<td>0<\/td>/);
});
