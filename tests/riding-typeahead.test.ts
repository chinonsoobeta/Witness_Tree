import assert from "node:assert/strict";
import test from "node:test";

import { matchRidingChoices, normalizeRidingQuery, ridingLevel, ridingProvinceCode, ridingProvincePrefix } from "../lib/comparison/riding-typeahead";
import { comparableRidings, federalRidingComparison } from "../lib/comparison/real";
import { ridingChoices } from "../components/comparison/FederalRidingPicker";

// The federal list alone keeps these expectations about names and provinces exact.
const english = ridingChoices(federalRidingComparison.comparisonRows, "en");
const french = ridingChoices(federalRidingComparison.comparisonRows, "fr");
const everyEnglish = ridingChoices(comparableRidings, "en");
const everyFrench = ridingChoices(comparableRidings, "fr");
const ids = (query: string, choices = english, options = {}) => matchRidingChoices(query, choices, options).matches.map((choice) => choice.id);
const inProvince = (prefix: string) => english.filter((choice) => ridingProvincePrefix(choice.id) === prefix).length;

test("the field lists every four-province riding once, with its province in the page's language", () => {
  assert.equal(english.length, 280);
  assert.equal(new Set(english.map((choice) => choice.id)).size, 280);
  assert.ok(english.every((choice) => choice.province !== null));
  assert.equal(english.find((choice) => choice.id === "federal-59021")?.province, "British Columbia");
  assert.equal(french.find((choice) => choice.id === "federal-59021")?.province, "Colombie-Britannique");
  assert.equal(french.find((choice) => choice.id === "federal-24048")?.name, "Mont-Royal");
});

test("normalization drops accents, case and punctuation, and closes up dotted abbreviations", () => {
  assert.equal(normalizeRidingQuery("  Côte-du-Sud—Rivière-du-Loup "), "cote du sud riviere du loup");
  assert.equal(normalizeRidingQuery("ÎLES"), "iles");
  assert.equal(normalizeRidingQuery("C.-B."), "cb");
  assert.equal(normalizeRidingQuery("Richmond, B.C."), "richmond bc");
  assert.equal(normalizeRidingQuery("Sault Ste. Marie"), "sault ste marie");
  assert.equal(normalizeRidingQuery("—.-"), "");
});

test("matching ignores accents in either direction", () => {
  assert.deepEqual(ids("levis"), ["federal-24040", "federal-24010"], "a name beginning with the query comes first");
  assert.deepEqual(ids("LÉVIS"), ids("levis"));
  assert.deepEqual(ids("trois rivieres"), ["federal-24075"]);
  assert.deepEqual(ids("Témiscamingue"), ids("temiscamingue"));
  assert.ok(ids("iles").includes("federal-24063"));
});

test("matching takes partial words, in any order, from any word of the name", () => {
  assert.deepEqual(ids("nanai"), ["federal-59019"]);
  assert.deepEqual(ids("ladys"), ["federal-59019"]);
  assert.deepEqual(ids("steveston rich"), ["federal-59028"]);
  assert.deepEqual(ids("rich hill").sort(), ["federal-35003", "federal-35089"]);
  assert.deepEqual(ids("xyzzy"), []);
  assert.deepEqual(ids(""), []);
  assert.deepEqual(ids(" — "), []);
});

test("names match in the page's language only", () => {
  assert.deepEqual(ids("richmond est"), []);
  assert.deepEqual(ids("richmond est", french), ["federal-59028"]);
  assert.deepEqual(ids("mount royal"), ["federal-24048"]);
  assert.deepEqual(ids("mont-royal", french), ["federal-24048"]);
});

test("province names, codes and French abbreviations narrow a match in both languages", () => {
  const bcRichmonds = ["federal-59027", "federal-59028"];
  assert.deepEqual(ids("richmond bc").sort(), bcRichmonds);
  assert.deepEqual(ids("richmond B.C.").sort(), bcRichmonds);
  assert.deepEqual(ids("richmond c.-b.", french).sort(), bcRichmonds);
  assert.deepEqual(ids("Richmond Colombie-Britannique").sort(), bcRichmonds);
  assert.deepEqual(ids("richmond british columbia", french).sort(), bcRichmonds);
  assert.deepEqual(ids("richmond qc"), ["federal-24061"]);
  assert.deepEqual(ids("richmond Qc", french), ["federal-24061"]);
  assert.deepEqual(ids("richmond québec"), ["federal-24061"]);
  assert.deepEqual(ids("richmond ont").sort(), ["federal-35003", "federal-35089"]);
  assert.deepEqual(ids("richmond on").sort(), ["federal-35003", "federal-35089"]);

  const cases = [["AB", "48", english], ["Alb.", "48", french], ["qc", "24", english], ["c.-b.", "59", french], ["ON", "35", english], ["Ont.", "35", french]] as const;
  for (const [query, prefix, choices] of cases) {
    const { matches } = matchRidingChoices(query, choices, { limit: 1000 });
    const inside = matches.filter((choice) => ridingProvincePrefix(choice.id) === prefix);
    assert.equal(inside.length, inProvince(prefix), `${query} matches every riding in its province`);
    // A short code can also begin a word of a name elsewhere (AB, Abbotsford), and those rank first.
    const word = normalizeRidingQuery(query);
    const outside = matches.filter((choice) => ridingProvincePrefix(choice.id) !== prefix);
    assert.ok(outside.every((choice) => normalizeRidingQuery(choice.name).split(" ").some((part) => part.startsWith(word))), `${query} reaches another province only through a name`);
    const byName = matches.map((choice) => normalizeRidingQuery(choice.name).split(" ").some((part) => part.startsWith(word)));
    assert.equal(byName.indexOf(false), byName.filter(Boolean).length, `${query}: name matches come before province-only matches`);
  }
});

test("a name match outranks a province match, and the list is capped with its full count", () => {
  const { matches, total } = matchRidingChoices("quebec", english);
  assert.equal(matches[0]?.id, "federal-24059", "Québec Centre names the query; the rest only lie in Québec");
  assert.equal(matches.length, 10);
  assert.equal(total, inProvince("24"));
  assert.equal(matchRidingChoices("quebec", english, { limit: 3 }).matches.length, 3);
});

test("the riding chosen on the other side is not offered again", () => {
  assert.deepEqual(ids("richmond bc", english, { exclude: "federal-59027" }), ["federal-59028"]);
});

test("the field also offers every provincial riding, labelled by level and province", () => {
  assert.equal(everyEnglish.length, 711);
  assert.equal(new Set(everyEnglish.map((choice) => choice.id)).size, 711);
  assert.equal(everyEnglish.filter((choice) => choice.level === "provincial").length, 431);
  assert.ok(everyEnglish.every((choice) => choice.province !== null));
  assert.deepEqual(everyEnglish.find((choice) => choice.id === "provincial-BC-258"),
    { id: "provincial-BC-258", name: "Abbotsford-Mission", province: "British Columbia", level: "provincial" });
  assert.equal(everyFrench.find((choice) => choice.id === "provincial-BC-258")?.province, "Colombie-Britannique");
  assert.equal(everyEnglish.findIndex((choice) => choice.level === "provincial"), 280, "federal ridings come first");
  assert.equal(ridingProvincePrefix("provincial-QC-137"), "24");
  assert.equal(ridingProvinceCode("federal-59021"), "BC");
  assert.equal(ridingProvinceCode("provincial-ON-89"), "ON");
  assert.equal(ridingProvinceCode("provincial-NS-1"), null);
  assert.equal(ridingLevel("provincial-BC-258"), "provincial");
  assert.equal(ridingLevel("federal-59021"), "federal");
});

test("a query finds both levels, and a level word narrows it in either language", () => {
  const all = (query: string, choices = everyEnglish) => matchRidingChoices(query, choices, { limit: 50 }).matches;
  const richmonds = all("richmond bc");
  assert.deepEqual(new Set(richmonds.map((choice) => choice.level)), new Set(["federal", "provincial"]));
  assert.deepEqual(all("richmond bc provincial").map((choice) => choice.id).sort(),
    ["provincial-BC-315", "provincial-BC-316", "provincial-BC-317", "provincial-BC-318"]);
  assert.deepEqual(all("richmond bc federal").map((choice) => choice.id).sort(), ["federal-59027", "federal-59028"]);
  assert.deepEqual(all("richmond c.-b. fédérale", everyFrench).map((choice) => choice.id).sort(), ["federal-59027", "federal-59028"]);
  assert.ok(all("levis").some((choice) => choice.id === "provincial-QC-791"));
});
