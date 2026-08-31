import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  federalRidingComparison,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/comparison/real.ts";
import { rankRidings
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/comparison/ranking.ts";
import EnglishComparePage
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../app/en/compare/page.tsx";
import FrenchComparePage
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../app/fr/comparer/page.tsx";
import { FederalDistrictFinder
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../components/search/FederalDistrictFinder.tsx";
import { RankedRidingsTable
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../components/comparison/RankedRidingsTable.tsx";

test("the checked-in real comparison has 343 extent-corrected districts", () => {
  assert.equal(federalRidingComparison.rows.length, 343);
  assert.equal(federalRidingComparison.rows.filter((row) => row.sufficientCoverage).length, 57);
  assert.equal(federalRidingComparison.rows.filter((row) => !row.sufficientCoverage).length, 286);
  assert.equal(federalRidingComparison.rows.filter((row) => row.measurementCoverage !== "complete" && (row.detectedChangeHectares !== null || row.detectedChangePercent !== null)).length, 0);
  assert.equal(federalRidingComparison.rows.filter((row) => !row.sufficientCoverage && row.measurementCoverage === "complete" && row.forestedHectares > 0 && row.forestedHectares < 500).length, 12);
  assert.deepEqual(new Set(federalRidingComparison.rows.map((row) => row.id)).size, 343);
  const ranked = rankRidings(federalRidingComparison.rows).ranked;
  assert.equal(ranked[0]?.name.en, "Charlottetown");
  assert.ok(ranked.every((row) => row.forestedHectares >= 500));
  assert.doesNotMatch(federalRidingComparison.context.method.en, /British Columbia, Alberta, Ontario and Quebec/);
});

test("every federal district is listed under a reason consistent with its own coverage", () => {
  const english = renderToStaticMarkup(
    <RankedRidingsTable rows={federalRidingComparison.rows} context={federalRidingComparison.context} locale="en" />,
  );
  const french = renderToStaticMarkup(
    <RankedRidingsTable rows={federalRidingComparison.rows} context={federalRidingComparison.context} locale="fr" />,
  );
  for (const html of [english, french]) assert.equal((html.match(/<th scope="row">/g) ?? []).length, 343);
  assert.match(english, /57 of 343 federal districts are ranked\./);
  assert.match(english, /183 have no mapped coverage; 91 have partial mapped coverage; 12 have complete mapped coverage but less than 500 forested hectares\./);
  assert.match(french, /57 des 343 circonscriptions fédérales sont classées\./);
  assert.match(french, /183 n’ont aucune couverture cartographiée; 91 ont une couverture cartographiée partielle; 12 ont une couverture cartographiée complète, mais moins de 500 hectares forestiers\./);
  assert.doesNotMatch(`${english}${french}`, /Insufficient coverage, not ranked|Couverture insuffisante, non classée/);

  const none = english.indexOf("No mapped coverage, not ranked");
  const partial = english.indexOf("Partial mapped coverage, not ranked");
  const belowFloor = english.indexOf("Complete mapped coverage below 500 forested hectares, not ranked");
  const centralNova = english.indexOf("Central Nova");
  const cloverdale = english.indexOf("Cloverdale\u2014Langley City");
  assert.ok(centralNova > 0 && centralNova < none, "a sound measurement outside the old four-province filter belongs in the ranked table");
  assert.ok(none > 0 && partial > none && belowFloor > partial);
  assert.ok(cloverdale > belowFloor, "a completely mapped small-forest district belongs only under the ranking-floor heading");
  assert.equal((english.slice(none, partial).match(/<span class="coverage-band">No mapped coverage<\/span>/g) ?? []).length, 183);
  assert.equal((english.slice(partial, belowFloor).match(/<span class="coverage-band">Partial mapped coverage; unknown area remains<\/span>/g) ?? []).length, 91);
  assert.equal((english.slice(belowFloor).match(/<span class="coverage-band">Complete mapped coverage<\/span>/g) ?? []).length, 12);
  assert.match(french, /aria-label="Aucune couverture cartographiée, non classée \(183\)"/);
  assert.match(french, /aria-label="Couverture cartographiée partielle, non classée \(91\)"/);
  assert.match(french, /aria-label="Couverture cartographiée complète sous le seuil de 500 hectares forestiers, non classée \(12\)"/);
});

test("the real federal district finder links source names into Compare", () => {
  const html = renderToStaticMarkup(<FederalDistrictFinder locale="en" query="Abbotsford" rows={federalRidingComparison.places} />);
  assert.match(html, /href="\/en\/compare\?left=federal-59001"/);
  assert.match(html, /Abbotsford/);
  assert.match(html, /Local nonproduction measurements/);
});

test("both comparison routes use real data and preserve exact selected ids", async () => {
  const parameters = Promise.resolve({ left: "federal-59001", right: "federal-59006", view: "table", sort: "share-asc" });
  const english = renderToStaticMarkup(await EnglishComparePage({ searchParams: parameters }));
  const french = renderToStaticMarkup(await FrenchComparePage({ searchParams: parameters }));
  assert.match(english, /Local 2021–2022 extent-corrected measurements/);
  assert.match(french, /Mesures locales corrigées selon l’étendue pour 2021–2022/);
  for (const html of [english, french]) {
    assert.match(html, /option value="federal-59001" selected/);
    assert.match(html, /option value="federal-59006" selected/);
    assert.match(html, /name="sort" value="share-asc"/);
    assert.match(html, /Unknown|Inconnu/);
  }
  assert.ok(english.indexOf("Side-by-side comparison") < english.indexOf("Detected change as a share of forested area"));
  assert.ok(french.indexOf("Comparaison côte à côte") < french.indexOf("Changement détecté en part de la superficie forestière"));
  const englishSource = readFileSync(new URL("../app/en/compare/page.tsx", import.meta.url), "utf8");
  const frenchSource = readFileSync(new URL("../app/fr/comparer/page.tsx", import.meta.url), "utf8");
  for (const source of [englishSource, frenchSource]) {
    assert.doesNotMatch(source, /comparisonFixtures|rankedRidingFixtures|comparisonContext/);
    assert.match(source, /federalRidingComparison/);
  }
});

test("comparison routes disclose an unrecognized requested riding before the fallback result", async () => {
  const english = renderToStaticMarkup(await EnglishComparePage({ searchParams: Promise.resolve({ left: "federal-missing" }) }));
  const french = renderToStaticMarkup(await FrenchComparePage({ searchParams: Promise.resolve({ right: "federal-absente" }) }));
  assert.match(english, /Requested left riding “federal-missing” was not found\. Showing [^<]+ instead\./);
  assert.match(french, /La circonscription de droite demandée « federal-absente » est introuvable\. [^<]+ est affichée à la place\./);
  assert.ok(english.indexOf("Requested left riding") < english.indexOf("Side-by-side comparison"));
  assert.ok(french.indexOf("demandée « federal-absente »") < french.indexOf("Comparaison côte à côte"));
});
