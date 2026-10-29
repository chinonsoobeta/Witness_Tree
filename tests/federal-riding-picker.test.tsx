import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { rankedRidingFixtures }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/comparison/fixtures.ts";
import { FederalRidingPicker, selectComparedRidings }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../components/comparison/FederalRidingPicker.tsx";

const pairIds = (pair: { left: { id: string } | null; right: { id: string } | null }) => [pair.left?.id ?? null, pair.right?.id ?? null];

test("selectComparedRidings uses an exact pair, across levels", () => {
  const rows = [{ ...rankedRidingFixtures[0]!, id: "p1", placeType: "provincial-riding" as const }, ...rankedRidingFixtures];
  const pair = selectComparedRidings(rows, "p1", "r3");
  assert.deepEqual(pairIds(pair), ["p1", "r3"]);
  assert.deepEqual(pair.notices, []);
});

test("an unknown id leaves its side empty with a notice, and nothing is put in its place", () => {
  const pair = selectComparedRidings(rankedRidingFixtures, "missing", "r2", { fallback: [rankedRidingFixtures[2]!] });
  assert.deepEqual(pairIds(pair), [null, "r2"]);
  assert.deepEqual(pair.notices, [{ side: "left", kind: "unknown", id: "missing" }]);
  const both = selectComparedRidings(rankedRidingFixtures, "x", "y");
  assert.deepEqual(pairIds(both), [null, null]);
  assert.deepEqual(both.notices.map((notice: { side: string }) => notice.side), ["left", "right"]);
  assert.equal(selectComparedRidings(rankedRidingFixtures, "z".repeat(500), "r1").notices[0]?.id.length, 80);
});

test("the same riding on both sides is shown once, with a notice", () => {
  const pair = selectComparedRidings(rankedRidingFixtures, "r2", "r2");
  assert.deepEqual(pairIds(pair), ["r2", null]);
  assert.deepEqual(pair.notices.map((notice: { kind: string }) => notice.kind), ["same"]);
});

test("a known riding the page does not compare is named, not called unknown", () => {
  const away = { ...rankedRidingFixtures[0]!, id: "far", name: { en: "Far Away", fr: "Très loin" } };
  const pair = selectComparedRidings(rankedRidingFixtures, "far", "r1", { outside: [away] });
  assert.deepEqual(pairIds(pair), [null, "r1"]);
  assert.equal(pair.notices[0]?.kind, "outside");
});

test("only a side the address leaves out takes a default, distinct from the other side", () => {
  const fallback = [rankedRidingFixtures[2]!];
  assert.deepEqual(pairIds(selectComparedRidings(rankedRidingFixtures, undefined, undefined, { fallback })), ["r3", "r1"]);
  assert.deepEqual(pairIds(selectComparedRidings(rankedRidingFixtures, "r3", undefined, { fallback })), ["r3", "r1"]);
  assert.deepEqual(pairIds(selectComparedRidings(rankedRidingFixtures, "", "r2", { fallback })), [null, "r2"], "an emptied field stays empty");
  assert.deepEqual(selectComparedRidings(rankedRidingFixtures, "r1", undefined, { fallback }).notices, []);
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

test("the picker states each notice in both languages and opens an empty side on a placeholder", () => {
  const unknown = { side: "left" as const, kind: "unknown" as const, id: "missing-left" };
  const same = { side: "right" as const, kind: "same" as const, id: "r2", name: { en: "Example South", fr: "Exemple Sud" } };
  const outside = { side: "right" as const, kind: "outside" as const, id: "far", name: { en: "Far Away", fr: "Très loin" } };
  const english = renderToStaticMarkup(<FederalRidingPicker rows={rankedRidingFixtures} locale="en" leftId={null} rightId="r2" notices={[unknown, outside]} />);
  const french = renderToStaticMarkup(<FederalRidingPicker rows={rankedRidingFixtures} locale="fr" leftId={null} rightId="r2" notices={[unknown, same, outside]} />);
  assert.match(english, /role="status"/);
  assert.match(english, /Left side: no riding has the id “missing-left”\. Choose a riding below\./);
  assert.match(english, /Right side: Far Away is a federal riding outside the four provinces the record covers, so it can’t be compared here\./);
  assert.match(french, /Côté gauche\u202F: aucune circonscription ne porte l’identifiant «\u00A0missing-left\u00A0»\./);
  assert.match(french, /Les deux côtés demandaient Exemple Sud\u202F; elle n’est donc affichée qu’une fois\./);
  assert.match(french, /Côté droit\u202F: Très loin est une circonscription fédérale située hors des quatre provinces/);
  assert.match(english, /<select name="left"><option value="" selected="">Choose a riding<\/option>/);
  assert.match(french, /<select name="left"><option value="" selected="">Choisissez une circonscription<\/option>/);
  assert.doesNotMatch(english.slice(english.indexOf('<select name="right"')), /value=""/);
  assert.doesNotMatch(renderToStaticMarkup(<FederalRidingPicker rows={rankedRidingFixtures} locale="en" leftId="r1" rightId="r2" />), /role="status"/);
});

test("real ridings are grouped by level, then province west to east, and alphabetical within each", () => {
  const riding = (id: string, en: string, fr = en) => ({ ...rankedRidingFixtures[0]!, id: `federal-${id}`, name: { en, fr } });
  const provincial = (id: string, en: string) => ({ ...rankedRidingFixtures[0]!, id: `provincial-${id}`, placeType: "provincial-riding" as const, name: { en, fr: en } });
  const rows = [riding("24001", "Abitibi"), provincial("QC-1", "Abitibi-Est"), riding("59002", "Surrey"), riding("35001", "Ajax"), provincial("BC-1", "Burnaby North"), riding("59001", "Burnaby"), riding("48001", "Banff")];
  const english = renderToStaticMarkup(<FederalRidingPicker rows={rows} locale="en" leftId="federal-59001" rightId="provincial-BC-1" />);
  const french = renderToStaticMarkup(<FederalRidingPicker rows={rows} locale="fr" leftId="federal-59001" rightId="provincial-BC-1" />);
  const left = english.slice(english.indexOf('<select name="left"'), english.indexOf("</select>"));
  assert.deepEqual([...left.matchAll(/<optgroup label="([^"]+)"/g)].map((match) => match[1]), [
    "Federal ridings · British Columbia", "Federal ridings · Alberta", "Federal ridings · Ontario", "Federal ridings · Québec",
    "Provincial ridings · British Columbia", "Provincial ridings · Québec",
  ]);
  assert.ok(left.indexOf(">Burnaby<") < left.indexOf(">Surrey<"));
  assert.match(french, /<optgroup label="Circonscriptions fédérales · Colombie-Britannique">/);
  assert.match(french, /<optgroup label="Circonscriptions provinciales · Québec"><option value="provincial-QC-1">Abitibi-Est/);
});
