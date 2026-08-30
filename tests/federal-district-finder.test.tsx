import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComparisonPlace } from "../lib/comparison/types.ts";
import {
  FederalDistrictFinder,
  federalDistrictCompareHref,
  findFederalDistricts,
  normalizeFederalDistrictSearch,
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../components/search/FederalDistrictFinder.tsx";

const district = (id: string, en: string, fr: string): ComparisonPlace => ({
  id,
  name: { en, fr },
  placeType: "federal-riding",
  detectedChangePercent: null,
  detectedChangeHectares: null,
  forestedHectares: 0,
  coverageGrade: "not-applicable",
  evidence: "satellite-observation",
});

const rows = [
  district("35001", "Québec", "Québec"),
  district("35002", "Saint-Laurent", "Saint-Laurent"),
  { ...district("ON", "Ontario", "Ontario"), placeType: "province" as const },
];

test("normalizes accents and punctuation while retaining federal districts only", () => {
  assert.equal(normalizeFederalDistrictSearch("Québec (Ville)!"), "quebec ville");
  assert.deepEqual(findFederalDistricts("Quebec", rows).map((row) => row.id), ["35001"]);
  assert.deepEqual(findFederalDistricts("saint laurent", rows).map((row) => row.id), ["35002"]);
  assert.deepEqual(findFederalDistricts("ontario", rows), []);
});

test("links exact district names to the locale comparison route with the left selection", () => {
  assert.equal(federalDistrictCompareHref("en", "35001"), "/en/compare?left=35001");
  assert.equal(federalDistrictCompareHref("fr", "a/b"), "/fr/comparer?left=a%2Fb");
  const english = renderToStaticMarkup(<FederalDistrictFinder locale="en" query="Quebec" rows={rows} />);
  const french = renderToStaticMarkup(<FederalDistrictFinder locale="fr" query="Quebec" rows={rows} />);
  assert.match(english, /Local nonproduction measurements\. Not a published release\./);
  assert.match(english, /<label[^>]*class="field-label sr-only"[^>]*id="federal-district-label"[^>]*>Find a federal electoral district<\/label>/);
  assert.match(english, /<input[^>]*aria-labelledby="federal-district-label"/);
  assert.doesNotMatch(english, /<input[^>]*aria-label=/);
  assert.match(english, /<button[^>]*>Find<\/button>/);
  assert.match(english, /href="\/en\/compare\?left=35001"/);
  assert.match(english, />Québec</);
  assert.doesNotMatch(english, /illustrative/i);
  assert.match(french, /Mesures locales non productives\. Il ne s’agit pas d’une publication\./);
  assert.match(french, /<button[^>]*>Trouver<\/button>/);
  assert.match(french, /href="\/fr\/comparer\?left=35001"/);
});
