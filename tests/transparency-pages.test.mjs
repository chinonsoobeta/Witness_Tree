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
  for (const requirement of ["1 hectare", "tree crowns cover at least 10% of the ground", "5 metres", "British Columbia", "north of 52", "50%", "±2 years", "±3 years before 1995"]) assert.ok(page.includes(requirement));
  assert.match(page, /EXPLORE_COVERAGE_PERIOD/);
  assert.match(exploreTypes, /EXPLORE_YEAR_MIN = 1985/);
  assert.match(exploreTypes, /EXPLORE_YEAR_MIN - 1/);
  assert.match(page, /EXPLORE_DEFAULT_YEAR/);
  assert.match(exploreTypes, /EXPLORE_DEFAULT_YEAR = EXPLORE_YEAR_MAX/);
  assert.match(exploreTypes, /EXPLORE_YEAR_MAX = 2022/);
  assert.match(page, /fire; recorded harvest; recorded insect or disease disturbance; other recorded intervention; then detected loss with no matching record/);
  assert.match(page, /How often detected losses match provincial records is not available yet/);
  assert.match(page, /No provincial dataset has been approved for processing/);
  assert.match(page, /correspondent aux registres provinciaux n’est pas encore disponible/i);
});

test("methodology publishes predecessor VLCE accuracy with its VLCE2 non-applicability boundary", async () => {
  const page = await read("../components/transparency/MethodologyPage.tsx");
  assert.match(page, /earlier 2005 version of this land-cover map: it was 70\.3% accurate overall \(±2\.5 percentage points, 95% confidence\)/);
  assert.match(page, /does not measure how accurate our forest-loss detections are, for any district or year/);
  assert.match(page, /So the accuracy of detected loss is Unknown/);
  assert.match(page, /version antérieure de 2005 de cette carte de couverture terrestre : elle était exacte à 70,3 % dans l’ensemble \(±2,5 points de pourcentage, confiance de 95 %\)/);
  assert.match(page, /ne mesure pas l’exactitude de nos détections de perte forestière, pour aucune circonscription ni aucune année/);
  assert.match(page, /L’exactitude de la perte détectée est donc inconnue/);
});

test("data page labels examples and links the ledger and documentation", async () => {
  const page = await read("../components/transparency/DataPage.tsx");
  assert.match(page, /entries are still examples/i);
  /*
   * The span is no longer typed into this sentence, so asserting the literal
   * would only prove someone typed it again. Assert the two halves that
   * together put the words in front of a reader: the copy interpolates the
   * release's own time range, and that time range still reads "2020 to 2022".
   * This now also fails if the release moves and the sentence does not.
   */
  assert.match(
    page,
    /early preview of the province figures for \$\{formatYearRangeKey\(PROVINCE_BULK_TIME_RANGE, "en", "span"\)\}/,
  );
  assert.equal(formatYearRangeKey(PROVINCE_BULK_TIME_RANGE, "en", "span"), "2020 to 2022");
  assert.match(page, /provinceBulkManifestUrl/);
  assert.match(page, /provinceBulkRelease\.artifacts/);
  assert.match(page, /href="https:\/\/github\.com\/chinonsoobeta\/Witness_Tree\/blob\/main\/data\/source-ledger\.json"/);
  assert.match(page, /href="https:\/\/github\.com\/chinonsoobeta\/Witness_Tree\/blob\/main\/docs\/SOURCE_LEDGER\.md"/);
  assert.match(page, /Two source archives have been checked/);
  assert.match(page, /verified copy of two Quebec layers/);
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
  assert.match(page, /Every province has some land with no data/);
  assert.match(page, /not the formal Phase 2 release/);
});

test("transparency pages do not make prohibited product claims or turn unknown into zero", async () => {
  const pages = await Promise.all([read("../components/transparency/MethodologyPage.tsx"), read("../components/transparency/DataPage.tsx")]);
  const claims = pages.join("\n").toLowerCase().replaceAll("does not complete", "");
  for (const term of ["real" + "-time", "com" + "plete", "tr" + "uth"]) assert.equal(claims.includes(term), false);
  assert.doesNotMatch(claims, /unknown[^\n]{0,120}\b0\b/);
});

test("methods explain the unmapped extent and inconclusive sampling in both locales", async () => {
  const page = await read("../components/transparency/MethodologyPage.tsx");
  for (const phrase of [
    "Where the source has no data", "What we know about the unmapped area",
    "Là où la source n’a pas de données", "Ce que nous savons du territoire non cartographié",
    "Unmapped does not mean there is no forest", "n’est jamais traité comme dépourvu de forêt",
    "not yet cleared for public use", "pas encore autorisés pour un usage public",
    "images can’t show whether the land met the forest definition", "les images ne montrent pas si le territoire répondait à la définition de la forêt",
    "a later start year didn’t help", "une année de départ plus récente n’a pas aidé",
    "field plots, air photos or lidar", "placettes de terrain, des photos aériennes ou des données lidar",
    "Quebec’s far north beyond where dense forest ends",
    "le Grand Nord québécois au-delà de la forêt dense",
    "unknown means no official record answers the question, which is different from land the source never mapped", "ce qui diffère d’un territoire que la source n’a jamais cartographié",
  ]) assert.ok(page.includes(phrase), phrase);
  assert.match(page, /\[copy\.coverage, copy\.coverageText\],\s*\[copy\.unmapped, copy\.unmappedText\],\s*\[copy\.unmappedKnowledge, copy\.unmappedKnowledgeText\],\s*\[copy\.evidence, copy\.evidenceText\]/);
});
