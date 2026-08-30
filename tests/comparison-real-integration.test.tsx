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

test("the checked-in real comparison has 343 extent-corrected districts", () => {
  assert.equal(federalRidingComparison.rows.length, 343);
  assert.equal(federalRidingComparison.rows.filter((row) => row.sufficientCoverage).length, 57);
  assert.equal(federalRidingComparison.rows.filter((row) => !row.sufficientCoverage).length, 286);
  assert.equal(federalRidingComparison.rows.filter((row) => row.measurementCoverage !== "complete" && (row.detectedChangeHectares !== null || row.detectedChangePercent !== null)).length, 0);
  assert.equal(federalRidingComparison.rows.filter((row) => !row.sufficientCoverage && row.measurementCoverage === "complete" && row.forestedHectares > 0 && row.forestedHectares < 500).length, 12);
  assert.deepEqual(new Set(federalRidingComparison.rows.map((row) => row.id)).size, 343);
  assert.equal(federalRidingComparison.rankingRows.length, 280);
  assert.equal(federalRidingComparison.rankingRows.filter((row) => row.sufficientCoverage).length, 36);
  assert.equal(federalRidingComparison.rankingRows.filter((row) => !row.sufficientCoverage).length, 244);
  assert.ok(federalRidingComparison.rankingRows.every((row) => /^federal-(24|35|48|59)/.test(row.id)));
  const ranked = rankRidings(federalRidingComparison.rankingRows).ranked;
  assert.equal(ranked[0]?.name.en, "Abbotsford—South Langley");
  assert.ok(ranked.every((row) => row.forestedHectares >= 500));
  assert.match(federalRidingComparison.context.method.en, /British Columbia, Alberta, Ontario and Quebec/);
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
