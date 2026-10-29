import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { comparisonContext, rankedRidingFixtures }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/comparison/fixtures.ts";
import { RANKING_COPY, comparePlaces, parseRankingSort, rankRidings, rankingContextLines }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/comparison/ranking.ts";
import type { RankedRiding } from "../lib/comparison/types";
import { RankedRidingsTable }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../components/comparison/RankedRidingsTable.tsx";
import { ridingLevelLabel, SideBySideComparison }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../components/comparison/SideBySideComparison.tsx";
import { forestedArea, MeasurementCoverage }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../components/comparison/MeasurementCoverage.tsx";

test("orders only rankable riding rows and keeps the others separate", () => { const result = rankRidings(rankedRidingFixtures); assert.deepEqual(result.ranked.map((row) => row.id), ["r1", "r2"]); assert.deepEqual(result.unranked.map((row) => row.id), ["r3"]); assert.equal(result.ranked[0]?.detectedChangePercent, 4.2); assert.equal(result.ranked[0]?.detectedChangeHectares, 420); assert.equal(result.ranked[0]?.forestedHectares, 10000); assert.equal(result.ranked[0]?.unmatchedSharePercent, 35); assert.equal(result.unranked[0]?.detectedChangeHectares, 80); });
test("ranking sort is share-only and defaults defensively", () => { assert.equal(parseRankingSort("share-asc"), "share-asc"); assert.equal(parseRankingSort("hectares-desc"), "share-desc"); assert.deepEqual(rankRidings(rankedRidingFixtures, "share-asc").ranked.map((row) => row.id), ["r2", "r1"]); });
test("admitted unmatched shares stay within 0–100 percent", () => { for (const row of rankedRidingFixtures) { if (row.unmatchedSharePercent != null) { assert.ok(row.unmatchedSharePercent >= 0 && row.unmatchedSharePercent <= 100); } } });
test("the constant official-matching state is stated once above each table, never in every row", () => { const english = renderToStaticMarkup(<RankedRidingsTable rows={rankedRidingFixtures} context={comparisonContext} locale="en" />); const french = renderToStaticMarkup(<RankedRidingsTable rows={rankedRidingFixtures} context={comparisonContext} locale="fr" />); assert.equal((english.match(/Matching to official records/g) ?? []).length, 1); assert.equal((french.match(/L’appariement aux registres officiels/g) ?? []).length, 1); assert.doesNotMatch(english, /No matching official record|rank-unmatched-share/); assert.doesNotMatch(french, /Sans registre officiel correspondant|rank-unmatched-share/); });
test("ranking context stays intact inside a collapsed native disclosure", () => { const english = renderToStaticMarkup(<RankedRidingsTable rows={rankedRidingFixtures} context={comparisonContext} locale="en" />); const french = renderToStaticMarkup(<RankedRidingsTable rows={rankedRidingFixtures} context={comparisonContext} locale="fr" />); assert.match(english, /<details class="card card--sand comparison-context"><summary>How this ranking works<\/summary>/); assert.match(french, /<details class="card card--sand comparison-context"><summary>Comment fonctionne ce classement<\/summary>/); assert.doesNotMatch(`${english}${french}`, /<details[^>]*\sopen(?:=|>)/); for (const value of [comparisonContext.timeRange, comparisonContext.boundaryEdition, comparisonContext.dataVersion, comparisonContext.denominatorDefinition.en, comparisonContext.method.en, RANKING_COPY.en.officialMatching]) assert.ok(english.includes(value)); for (const value of [comparisonContext.timeRange, comparisonContext.boundaryEdition, comparisonContext.dataVersion, comparisonContext.denominatorDefinition.fr, comparisonContext.method.fr, RANKING_COPY.fr.officialMatching]) assert.ok(french.includes(value)); });
test("incomplete measurements render a dash and coverage reason in tables and cards", () => { const incomplete = { ...rankedRidingFixtures[0]!, detectedChangePercent: null, detectedChangeHectares: null, measurementCoverage: "partial-with-unknown" as const, sufficientCoverage: false }; const pair = [incomplete, rankedRidingFixtures[1]!] as const; const ranked = renderToStaticMarkup(<RankedRidingsTable rows={pair} context={comparisonContext} locale="en" />); const table = renderToStaticMarkup(<SideBySideComparison places={pair} locale="en" view="table" />); const cards = renderToStaticMarkup(<SideBySideComparison places={pair} locale="fr" />); assert.equal((ranked.match(/<td>– Partial mapped coverage; the measurement is unavailable\.<\/td>/g) ?? []).length, 2); assert.equal((table.match(/<td>– Partial mapped coverage; the measurement is unavailable\.<\/td>/g) ?? []).length, 2); assert.equal((cards.match(/<dd>– Couverture cartographiée partielle\u202F; la mesure est indisponible\.<\/dd>/g) ?? []).length, 2); assert.doesNotMatch(`${ranked}${table}${cards}`, />null%|>0%/); });
test("an unranked complete row is never mislabeled as below the forest-area floor", () => { const inconsistent = { ...rankedRidingFixtures[0]!, detectedChangePercent: null, detectedChangeHectares: null, sufficientCoverage: false }; assert.throws(() => renderToStaticMarkup(<RankedRidingsTable rows={[inconsistent]} context={comparisonContext} locale="en" />), /explicit, truthful reason/); });
test("comparison measurements use locale separators and at most two decimals", () => { const precise = { ...rankedRidingFixtures[0]!, detectedChangePercent: 4.234567, detectedChangeHectares: 12345.678, forestedHectares: 10000.5 }; const english = renderToStaticMarkup(<RankedRidingsTable rows={[precise]} context={comparisonContext} locale="en" />); const french = renderToStaticMarkup(<SideBySideComparison places={[precise, rankedRidingFixtures[1]!]} locale="fr" view="table" />); assert.match(english, /<td>4\.23%<\/td><td>12,345\.68 ha<\/td><td>10,000\.5 ha<\/td>/); assert.match(french, /4,23\u00a0%/); assert.match(french, /12\u00a0345,68 ha/); assert.doesNotMatch(`${english}${french}`, /4\.234567|12345\.678/); });
test("context carries bilingual screenshot strings and neutral labels", () => { const copy = `${RANKING_COPY.en.metric} ${RANKING_COPY.fr.metric}`; const strings = rankingContextLines(comparisonContext, "en").join(" "); assert.match(strings, /2000–2024/); assert.match(strings, /Representation Order/); assert.match(strings, /illustrative-1/); assert.equal(/worst|best|top|leader|destruction/i.test(copy), false); });
test("side-by-side accepts exactly two places of the same type", () => { assert.equal(comparePlaces(rankedRidingFixtures.slice(0, 2))[0].id, "r1"); assert.throws(() => comparePlaces([rankedRidingFixtures[0]!]), /exactly two/); assert.throws(() => comparePlaces([{ ...rankedRidingFixtures[0]!, placeType: "reserve" }, rankedRidingFixtures[1]!]), /same type/); });
test("ranked tables have captions and scoped headers for each rendered reason group", () => { const html = renderToStaticMarkup(<RankedRidingsTable rows={rankedRidingFixtures} context={comparisonContext} locale="en" />); assert.match(html, /Satellite observation/); assert.match(html, /Unknown/); assert.equal((html.match(/<caption[ >]/g) ?? []).length, 2); assert.equal((html.match(/class="table-scroll" tabindex="0" role="region" aria-label="[^"]+"/g) ?? []).length, 2); assert.equal((html.match(/scope="col"/g) ?? []).length, 12); assert.match(html, /scope="row"/); assert.match(html, /Complete mapped coverage below 500 forested hectares, not ranked \(1\)/); });
test("the English and French table-query views retain coverage, evidence, and same-route links without duplicating method context", () => { const english = renderToStaticMarkup(<SideBySideComparison places={rankedRidingFixtures.slice(0, 2)} locale="en" view="table" />); const french = renderToStaticMarkup(<SideBySideComparison places={rankedRidingFixtures.slice(0, 2)} locale="fr" view="table" />); const englishCards = renderToStaticMarkup(<SideBySideComparison places={rankedRidingFixtures.slice(0, 2)} locale="en" />); const frenchCards = renderToStaticMarkup(<SideBySideComparison places={rankedRidingFixtures.slice(0, 2)} locale="fr" />); assert.match(english, /<table/); assert.match(english, /Coverage/); assert.match(english, /Satellite observation/); assert.match(english, /href="\?view=cards"/); assert.match(englishCards, /href="\?view=table"/); assert.match(french, /<table/); assert.match(french, /Couverture/); assert.match(french, /Observation satellitaire/); assert.match(french, /href="\?view=cards"/); assert.match(frenchCards, /href="\?view=table"/); for (const markup of [english, englishCards, french, frenchCards]) assert.doesNotMatch(markup, /Rows are ordered by|Les lignes sont ordonnées selon|class="comparison-method"/); });
test("ranking and view links preserve the selected riding pair", () => { const ranking = renderToStaticMarkup(<RankedRidingsTable rows={rankedRidingFixtures} context={comparisonContext} locale="en" sort="share-asc" leftId="r1" rightId="r2" view="table" />); const comparison = renderToStaticMarkup(<SideBySideComparison places={rankedRidingFixtures.slice(0, 2)} locale="en" leftId="r1" rightId="r2" sort="share-asc" />); assert.match(ranking, /href="\?sort=share-desc&amp;left=r1&amp;right=r2&amp;view=table"/); assert.match(comparison, /href="\?view=table&amp;left=r1&amp;right=r2&amp;sort=share-asc"/); });
// @ts-expect-error Ranking accepts ridings only, never reserves.
const reserveRanking: RankedRiding = { ...rankedRidingFixtures[0]!, placeType: "reserve" };
// @ts-expect-error Ranked rows require forestedHectares as the denominator.
const missingDenominator: RankedRiding = { ...rankedRidingFixtures[0]!, forestedHectares: undefined };
// @ts-expect-error Ranked rows require a coverage grade.
const missingCoverage: RankedRiding = { ...rankedRidingFixtures[0]!, coverageGrade: undefined };
void reserveRanking; void missingDenominator; void missingCoverage;

test("each selected riding carries coverage in its heading before any figures", () => {
  const partial = { ...rankedRidingFixtures[0]!, measurementCoverage: "partial-with-unknown" as const };
  for (const locale of ["en", "fr"] as const) {
    for (const view of ["cards", "table"] as const) {
      const markup = renderToStaticMarkup(<SideBySideComparison places={[partial, rankedRidingFixtures[1]!]} locale={locale} view={view} />);
      assert.equal((markup.match(/class="comparison-heading-coverage"/g) ?? []).length, 2);
      if (view === "cards") {
        const firstCard = markup.slice(markup.indexOf('<article'));
        assert.ok(firstCard.indexOf('comparison-heading-coverage') < firstCard.indexOf('comparison-figures'));
      } else {
        assert.match(markup.slice(markup.indexOf('<thead'), markup.indexOf('</thead>')), /Partly mapped|Partiellement cartographiée/);
      }
      assert.match(markup, new RegExp(`href="${locale === "en" ? "/en/data" : "/fr/donnees"}"`));
      assert.match(markup, new RegExp(`href="${locale === "en" ? "/en/methods" : "/fr/methodes"}"`));
    }
  }
});

test("any two ridings sit side by side, federal beside provincial, each labelled with its level", () => {
  const federal = { ...rankedRidingFixtures[0]!, id: "federal-59001" };
  const provincial = { ...rankedRidingFixtures[1]!, id: "provincial-BC-258", placeType: "provincial-riding" as const };
  assert.deepEqual(comparePlaces([federal, provincial]).map((place) => place.id), ["federal-59001", "provincial-BC-258"]);
  assert.throws(() => comparePlaces([{ ...rankedRidingFixtures[0]!, placeType: "reserve" }, provincial]), /same type/);
  assert.equal(ridingLevelLabel(federal, "en"), "Federal riding · British Columbia");
  assert.equal(ridingLevelLabel(provincial, "fr"), "Circonscription provinciale · Colombie-Britannique");
  assert.equal(ridingLevelLabel({ id: "r1", placeType: "reserve" }, "en"), null);
  for (const view of ["cards", "table"] as const) {
    const english = renderToStaticMarkup(<SideBySideComparison places={[federal, provincial]} locale="en" view={view} />);
    assert.match(english, /class="comparison-level">Federal riding · British Columbia</);
    assert.match(english, /class="comparison-level">Provincial riding · British Columbia</);
  }
});

test("a side with no riding says so instead of showing another riding", () => {
  const english = renderToStaticMarkup(<SideBySideComparison places={[null, rankedRidingFixtures[1]!]} locale="en" />);
  const french = renderToStaticMarkup(<SideBySideComparison places={[rankedRidingFixtures[0]!, null]} locale="fr" />);
  const table = renderToStaticMarkup(<SideBySideComparison places={[null, rankedRidingFixtures[1]!]} locale="en" view="table" />);
  assert.match(english, /<article class="card comparison-card comparison-card--empty"><h2>No riding chosen<\/h2><p>Choose a riding in the fields above to compare it\.<\/p><\/article>/);
  assert.match(french, /<h2>Aucune circonscription choisie<\/h2><p>Choisissez une circonscription dans les champs ci-dessus pour la comparer\.<\/p>/);
  assert.ok(english.indexOf("comparison-card--empty") < english.indexOf(rankedRidingFixtures[1]!.name.en), "the empty side keeps its place");
  assert.equal((table.match(/<th scope="col"/g) ?? []).length, 2, "the measure column and the one chosen riding");
  assert.match(table, /<p class="comparison-empty">Choose a riding in the fields above to compare it\.<\/p>/);
  assert.doesNotMatch(renderToStaticMarkup(<SideBySideComparison places={[null, null]} locale="en" view="table" />), /<table/);
});

test("a riding mapped all but a sliver says how much is unmapped, and an unmapped forest is never 0 ha", () => {
  const admitted = { ...rankedRidingFixtures[0]!, measurementCoverage: "complete" as const, admittedUnknownPercent: 0.0545 };
  assert.equal(renderToStaticMarkup(<MeasurementCoverage place={admitted} locale="en" />), '<span class="coverage-band">0.05% unmapped; the share is of the mapped forest</span>');
  assert.equal(renderToStaticMarkup(<MeasurementCoverage place={admitted} locale="fr" />), '<span class="coverage-band">0,05\u00a0% non cartographié\u202F; la part porte sur la forêt cartographiée</span>');
  assert.equal(renderToStaticMarkup(<MeasurementCoverage place={{ ...admitted, admittedUnknownPercent: undefined }} locale="en" />), '<span class="coverage-band">Fully mapped</span>');
  const unmapped = { ...rankedRidingFixtures[0]!, measurementCoverage: "none-mapped" as const, forestedHectares: 0 };
  assert.equal(forestedArea(unmapped, "en"), "– No mapped coverage.");
  assert.equal(forestedArea(unmapped, "fr"), "– Aucune couverture cartographiée.");
  assert.equal(forestedArea({ ...unmapped, measurementCoverage: "complete" }, "en"), "0 ha", "a fully mapped riding with no forest has 0 ha");
});

test("a scoped ranking is headed by its level, shows a preview, and links to the whole ranking", () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({
    ...rankedRidingFixtures[0]!, id: `provincial-ON-${index}`, placeType: "provincial-riding" as const,
    name: { en: `Riding ${index}`, fr: `Circonscription ${index}` }, detectedChangePercent: index / 10,
  }));
  const all = [...rows, rankedRidingFixtures[2]!];
  const scope = { level: "provincial" as const, province: "ON" as const };
  const english = renderToStaticMarkup(<RankedRidingsTable rows={all} context={comparisonContext} scope={scope} locale="en" limit={20} leftId="provincial-ON-1" />);
  const french = renderToStaticMarkup(<RankedRidingsTable rows={all} context={comparisonContext} scope={scope} locale="fr" limit={20} leftId="provincial-ON-1" />);
  assert.match(english, /<section class="comparison-table" id="rankings-ON" aria-labelledby="rankings-ON-heading"><h2 id="rankings-ON-heading">Provincial ridings in Ontario<\/h2>/);
  assert.match(french, /<h2 id="rankings-ON-heading">Circonscriptions provinciales de l’Ontario<\/h2>/);
  assert.match(english, /25 of Ontario’s 26 provincial ridings are ranked\./);
  assert.match(french, /25 des 26 circonscriptions provinciales de l’Ontario sont classées\./);
  for (const html of [english, french]) {
    assert.equal((html.match(/<th scope="row">/g) ?? []).length, 20);
    assert.doesNotMatch(html, /comparison-unranked/);
    assert.match(html, /href="\?sort=share-desc&amp;left=provincial-ON-1&amp;rankings=all#rankings-ON"/);
  }
  assert.match(english, /Showing the first 20 of 25 ranked ridings\. The 1 not ranked is listed with the whole ranking\. <a [^>]+>Show all 26 provincial ridings in Ontario<\/a>/);
  assert.match(french, /Les 20 premières des 25 circonscriptions classées sont affichées\./);
  assert.match(french, />Afficher les 26 circonscriptions provinciales de l’Ontario<\/a>/);
  assert.match(english, /aria-label="Provincial ridings in Ontario: Ranking order"/);
  const whole = renderToStaticMarkup(<RankedRidingsTable rows={all} context={comparisonContext} scope={scope} locale="en" allRankings />);
  assert.equal((whole.match(/<th scope="row">/g) ?? []).length, 26);
  assert.doesNotMatch(whole, /comparison-ranking-more/);
  const short = renderToStaticMarkup(<RankedRidingsTable rows={rows.slice(0, 3)} context={comparisonContext} scope={scope} locale="en" limit={20} />);
  assert.doesNotMatch(short, /comparison-ranking-more/, "nothing held back, so no link");
});
