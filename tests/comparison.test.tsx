import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { comparisonContext, rankedRidingFixtures }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/comparison/fixtures.ts";
import { RANKING_COPY, comparePlaces, rankRidings, rankingContextLines }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/comparison/ranking.ts";
import type { RankedRiding } from "../lib/comparison/types";
import { RankedRidingsTable }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../components/comparison/RankedRidingsTable.tsx";
import { SideBySideComparison }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../components/comparison/SideBySideComparison.tsx";

test("orders only sufficient riding rows and keeps insufficient coverage separate", () => { const result = rankRidings(rankedRidingFixtures); assert.deepEqual(result.ranked.map((row) => row.id), ["r1", "r2"]); assert.deepEqual(result.insufficientCoverage.map((row) => row.id), ["r3"]); assert.equal(result.ranked[0]?.detectedChangePercent, 4.2); assert.equal(result.ranked[0]?.detectedChangeHectares, 420); assert.equal(result.ranked[0]?.forestedHectares, 10000); assert.equal(result.insufficientCoverage[0]?.detectedChangeHectares, 80); });
test("context carries bilingual screenshot strings and neutral labels", () => { const copy = `${RANKING_COPY.en.metric} ${RANKING_COPY.en.insufficient} ${RANKING_COPY.fr.metric} ${RANKING_COPY.fr.insufficient}`; const strings = rankingContextLines(comparisonContext, "en").join(" "); assert.match(strings, /2000–2024/); assert.match(strings, /Representation Order/); assert.match(strings, /illustrative-1/); assert.equal(/worst|best|top|leader|destruction/i.test(copy), false); });
test("side-by-side accepts exactly two places of the same type", () => { assert.equal(comparePlaces(rankedRidingFixtures.slice(0, 2))[0].id, "r1"); assert.throws(() => comparePlaces([rankedRidingFixtures[0]!]), /exactly two/); assert.throws(() => comparePlaces([{ ...rankedRidingFixtures[0]!, placeType: "reserve" }, rankedRidingFixtures[1]!]), /same type/); });
test("ranked tables have captions and scoped headers, including insufficient coverage", () => { const html = renderToStaticMarkup(<RankedRidingsTable rows={rankedRidingFixtures} context={comparisonContext} locale="en" />); assert.match(html, /Satellite observation/); assert.match(html, /Unknown/); assert.equal((html.match(/<caption>/g) ?? []).length, 2); assert.equal((html.match(/scope="col"/g) ?? []).length, 12); assert.match(html, /scope="row"/); });
test("the English and French table-query views retain coverage, evidence, and same-route links", () => { const english = renderToStaticMarkup(<SideBySideComparison places={rankedRidingFixtures.slice(0, 2)} locale="en" view="table" />); const french = renderToStaticMarkup(<SideBySideComparison places={rankedRidingFixtures.slice(0, 2)} locale="fr" view="table" />); const englishCards = renderToStaticMarkup(<SideBySideComparison places={rankedRidingFixtures.slice(0, 2)} locale="en" />); const frenchCards = renderToStaticMarkup(<SideBySideComparison places={rankedRidingFixtures.slice(0, 2)} locale="fr" />); assert.match(english, /<table/); assert.match(english, /Coverage/); assert.match(english, /Satellite observation/); assert.match(english, /href="\?view=cards"/); assert.match(englishCards, /href="\?view=table"/); assert.match(french, /<table/); assert.match(french, /Couverture/); assert.match(french, /Observation satellitaire/); assert.match(french, /href="\?view=cards"/); assert.match(frenchCards, /href="\?view=table"/); });
// @ts-expect-error Ranking accepts ridings only, never reserves.
const reserveRanking: RankedRiding = { ...rankedRidingFixtures[0]!, placeType: "reserve" };
// @ts-expect-error Ranked rows require forestedHectares as the denominator.
const missingDenominator: RankedRiding = { ...rankedRidingFixtures[0]!, forestedHectares: undefined };
// @ts-expect-error Ranked rows require a coverage grade.
const missingCoverage: RankedRiding = { ...rankedRidingFixtures[0]!, coverageGrade: undefined };
void reserveRanking; void missingDenominator; void missingCoverage;
