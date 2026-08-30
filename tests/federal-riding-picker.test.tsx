import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { comparisonFixtures, rankedRidingFixtures }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/comparison/fixtures.ts";
import { FederalRidingPicker, selectFederalRidings }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../components/comparison/FederalRidingPicker.tsx";

test("selectFederalRidings uses an exact distinct pair and ignores non-federal rows", () => {
  const rows = [{ ...rankedRidingFixtures[0]!, placeType: "provincial-riding" as const }, ...rankedRidingFixtures];
  const pair = selectFederalRidings(rows, "r2", "r3");
  assert.equal(pair.left.id, "r2");
  assert.equal(pair.right.id, "r3");
});

test("selectFederalRidings fills a missing or duplicate side without discarding a valid selection", () => {
  assert.deepEqual(Object.values(selectFederalRidings(rankedRidingFixtures)).map((row) => row.id), ["r1", "r2"]);
  assert.deepEqual(Object.values(selectFederalRidings(rankedRidingFixtures, "missing", "r2")).map((row) => row.id), ["r1", "r2"]);
  assert.deepEqual(Object.values(selectFederalRidings(rankedRidingFixtures, "r2", undefined)).map((row) => row.id), ["r2", "r1"]);
  assert.deepEqual(Object.values(selectFederalRidings(rankedRidingFixtures, "r2", "r2")).map((row) => row.id), ["r2", "r1"]);
  assert.throws(() => selectFederalRidings(comparisonFixtures.slice(0, 1)), /at least two rows/);
});

test("the bilingual GET picker uses exact ids and preserves view and sort", () => {
  const english = renderToStaticMarkup(<FederalRidingPicker rows={rankedRidingFixtures} locale="en" leftId="r2" rightId="r3" view="table" sort="share-asc" />);
  const french = renderToStaticMarkup(<FederalRidingPicker rows={rankedRidingFixtures} locale="fr" leftId="r2" rightId="r3" view="cards" sort="share-desc" />);
  assert.match(english, /<form[^>]*method="get"/);
  assert.match(english, /name="view" value="table"/);
  assert.match(english, /name="sort" value="share-asc"/);
  assert.match(english, /<select name="left"[^>]*><option value="r1">Example North<\/option><option value="r2" selected="">Example South/);
  assert.match(english, /<select name="right"[^>]*>[\s\S]*<option value="r3" selected="">Example Sparse/);
  assert.match(english, /Left riding/);
  assert.match(french, /Circonscription de gauche/);
  assert.match(french, /Circonscription de droite/);
  assert.match(french, /<button[^>]*>Comparer<\/button>/);
});
