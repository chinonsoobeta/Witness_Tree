import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// data/phase2-per-cell-geometry-method.json records an obligation that no
// engineering gate was enforcing: "Any surface that draws this geometry must
// state that blank is not a claim of no loss." The Explore map is the only
// surface that draws it, and the sentence lived there as a bare string
// literal, one refactor away from disappearing with nothing to notice. These
// tests tie the rendered copy to the record that demands it.

const CARRIES_INTO = "Any surface that draws this geometry must state that blank is not a claim of no loss.";

test("the method record still places the carry-through on whatever draws the geometry", async () => {
  const method = JSON.parse(await read("../data/phase2-per-cell-geometry-method.json"));
  assert.equal(method.unknownRule.carriesInto, CARRIES_INTO);
  // The reason the obligation exists. If this weakens, the sentence below is
  // no longer the right sentence.
  assert.match(
    method.unknownRule.consequence,
    /does not mean the cell was observed as non-loss/u,
    "absence of a polygon must keep meaning unobserved, not observed-zero",
  );
});

test("both locales say that a blank area is not a claim of no loss", async () => {
  const client = await read("../components/explore/ExploreMapClient.tsx");

  // Reworded copy should fail here rather than pass quietly: the claim these
  // sentences carry is the whole reason the geometry may be published.
  assert.match(
    client,
    /An area with no patch is not a claim that no loss happened there\./u,
    "the English per-cell limits must carry the blank-is-not-zero sentence",
  );
  assert.match(
    client,
    /Une zone sans parcelle n’affirme pas qu’aucune perte n’y est survenue\./u,
    "the French per-cell limits must carry the blank-is-not-zero sentence",
  );

  // The filtered modes draw a subset, so they carry their own version of the
  // same warning about the disturbance record's own blanks.
  assert.match(client, /an empty area is not a claim that nothing happened there\./u);
  assert.match(client, /une zone vide n’affirme donc pas que rien ne s’y est produit\./u);
});

test("the sentence is rendered under the same condition that draws the patches", async () => {
  const client = await read("../components/explore/ExploreMapClient.tsx");

  // perCellYears is what both the layer and the legend hang off. If the copy
  // were moved outside that conditional, the patches could be drawn with no
  // warning attached, which is the failure the record is guarding against.
  const gate = client.indexOf("{perCellYears ? (");
  assert.notEqual(gate, -1, "the per-cell block must still be gated on perCellYears");

  const rendered = client.indexOf("{text[locale].perCellLimits}", gate);
  assert.notEqual(rendered, -1, "perCellLimits must be rendered after that gate");

  // The gate opens the per-cell panel; the next panel after it is the
  // province one. The sentence has to fall inside the first, so it cannot
  // drift into a panel that shows whether or not patches are drawn.
  const panel = "<div className=\"explore-map-data\">";
  const perCellPanel = client.indexOf(panel, gate);
  const nextPanel = client.indexOf(panel, perCellPanel + panel.length);
  assert.notEqual(perCellPanel, -1, "the per-cell panel must open inside the gate");
  assert.ok(
    rendered > perCellPanel && (nextPanel === -1 || rendered < nextPanel),
    "perCellLimits must sit inside the per-cell panel, not a later one",
  );

  assert.equal(
    (client.match(/\{text\[locale\]\.perCellLimits\}/gu) ?? []).length,
    1,
    "one render site, so there is one place for this to go wrong",
  );
});

test("the layer and the warning cannot be separated", async () => {
  const client = await read("../components/explore/ExploreMapClient.tsx");
  // The same perCellYears value decides whether the tiles are added at all.
  assert.match(
    client,
    /const perCellYears = cause \? perCellSpanYears\(fromYear, year\) : null;/u,
    "perCellYears must stay the single switch for the per-cell layer",
  );
});
