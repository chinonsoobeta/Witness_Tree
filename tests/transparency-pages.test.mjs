import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatYearRangeKey } from "../lib/domain/year-range.ts";
import { PROVINCE_BULK_TIME_RANGE } from "../lib/downloads/releases.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("bilingual methodology and data routes select their locale", async () => {
  const routes = await Promise.all([
    read("../app/en/methods/page.tsx"), read("../app/fr/methodes/page.tsx"),
    read("../app/en/data/page.tsx"), read("../app/fr/donnees/page.tsx"),
  ]);
  assert.match(routes[0], /<MethodologyPage locale="en" \/>/);
  assert.match(routes[1], /<MethodologyPage locale="fr" \/>/);
  assert.match(routes[2], /<DataPage locale="en" \/>/);
  assert.match(routes[3], /<DataPage locale="fr" \/>/);
});

test("methodology states the required definitions, matching and neutral limits", async () => {
  const [page, exploreTypes] = await Promise.all([
    read("../components/transparency/MethodologyPage.tsx"),
    read("../lib/explore/types.ts"),
  ]);
  for (const requirement of ["1 hectare", "10% crown closure", "5 metres", "British Columbia", "north of 52", "50%", "±2 years", "±3 years before 1995"]) assert.ok(page.includes(requirement));
  assert.match(page, /EXPLORE_COVERAGE_PERIOD/);
  assert.match(exploreTypes, /EXPLORE_YEAR_MIN = 1985/);
  assert.match(exploreTypes, /EXPLORE_YEAR_MIN - 1/);
  assert.match(page, /EXPLORE_DEFAULT_YEAR/);
  assert.match(exploreTypes, /EXPLORE_DEFAULT_YEAR = EXPLORE_YEAR_MAX/);
  assert.match(exploreTypes, /EXPLORE_YEAR_MAX = 2022/);
  assert.match(page, /fire; recorded harvest; recorded insect or disease disturbance; other recorded intervention; then detected change with no matching record/);
  assert.match(page, /Match rate, non-match rate, and the non-match-reason distribution are not available/);
  assert.match(page, /No provincial enhancement dataset has been admitted for processing/);
  assert.match(page, /taux d’appariement, le taux de non-appariement et la répartition des motifs de non-appariement ne sont pas disponibles/i);
});

test("methodology publishes predecessor VLCE accuracy with its VLCE2 non-applicability boundary", async () => {
  const page = await read("../components/transparency/MethodologyPage.tsx");
  assert.match(page, /predecessor VLCE land-cover map for 2005: 70\.3% overall classification accuracy with a 95% confidence interval of ±2\.5 percentage points/);
  assert.match(page, /not a validation of this record’s derived forest-loss detections, a district-specific accuracy, or a validation of every VLCE2 year/);
  assert.match(page, /directly applicable detected-loss accuracy estimate is therefore Unknown/);
  assert.match(page, /carte de couverture terrestre VLCE antérieure pour 2005 : une exactitude globale de classification de 70,3 %, avec un intervalle de confiance à 95 % de ±2,5 points de pourcentage/);
  assert.match(page, /ne valide ni les détections dérivées de perte forestière de ce registre, ni une exactitude propre à une circonscription, ni chaque année de VLCE2/);
  assert.match(page, /directement applicable de l’exactitude de la perte détectée demeure donc inconnue/);
});

test("data page labels examples and links the ledger and documentation", async () => {
  const page = await read("../components/transparency/DataPage.tsx");
  assert.match(page, /examples remain illustrative/i);
  /*
   * The span is no longer typed into this sentence, so asserting the literal
   * would only prove someone typed it again. Assert the two halves that
   * together put the words in front of a reader: the copy interpolates the
   * release's own time range, and that time range still reads "2020 to 2022".
   * This now also fails if the release moves and the sentence does not.
   */
  assert.match(
    page,
    /bounded four-province technical preview for \$\{formatYearRangeKey\(PROVINCE_BULK_TIME_RANGE, "en", "span"\)\}/,
  );
  assert.equal(formatYearRangeKey(PROVINCE_BULK_TIME_RANGE, "en", "span"), "2020 to 2022");
  assert.match(page, /provinceBulkManifestUrl/);
  assert.match(page, /provinceBulkRelease\.artifacts/);
  assert.match(page, /href="https:\/\/github\.com\/chinonsoobeta\/Witness_Tree\/blob\/main\/data\/source-ledger\.json"/);
  assert.match(page, /href="https:\/\/github\.com\/chinonsoobeta\/Witness_Tree\/blob\/main\/docs\/SOURCE_LEDGER\.md"/);
  assert.match(page, /Two source archives have verified byte lengths/);
  assert.match(page, /lossless local copy/);
  assert.match(page, /608 self-intersections in Alberta/);
  assert.match(page, /href="https:\/\/github\.com\/chinonsoobeta\/Witness_Tree\/blob\/main\/data\/staged-acquisitions\.json"/);
  assert.match(page, /href="https:\/\/github\.com\/chinonsoobeta\/Witness_Tree\/blob\/main\/data\/staged-geospatial-profile\.json"/);
  assert.match(page, /href="https:\/\/github\.com\/chinonsoobeta\/Witness_Tree\/blob\/main\/data\/transformation-runs\/qc-historic-wildfire-v1-2026-08-12\.json"/);
});

test("data page puts reader downloads and limits before technical identifiers", async () => {
  const page = await read("../components/transparency/DataPage.tsx");
  const access = page.indexOf("<h2>{copy.accessTitle}</h2>");
  const limits = page.indexOf("<h2>{copy.limitsTitle}</h2>");
  const technical = page.indexOf("<h2>{copy.technicalTitle}</h2>");
  const staging = page.indexOf("<h2>{copy.stagingTitle}</h2>");
  assert.ok(access >= 0 && access < limits && limits < technical && technical < staging);
  assert.match(page, /Download province values \(CSV\)/);
  assert.match(page, /Télécharger les valeurs provinciales \(GeoPackage\)/);
  assert.match(page, /All four provinces include some area where a required mapped input is unknown/);
  assert.match(page, /does not complete the formal Phase 2 production gate/);
});

test("transparency pages do not make prohibited product claims or turn unknown into zero", async () => {
  const pages = await Promise.all([read("../components/transparency/MethodologyPage.tsx"), read("../components/transparency/DataPage.tsx")]);
  const claims = pages.join("\n").toLowerCase().replaceAll("does not complete", "");
  for (const term of ["real" + "-time", "com" + "plete", "tr" + "uth"]) assert.equal(claims.includes(term), false);
  assert.doesNotMatch(claims, /unknown[^\n]{0,120}\b0\b/);
});
