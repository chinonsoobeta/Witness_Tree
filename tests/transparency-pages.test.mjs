import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  const page = await read("../components/transparency/MethodologyPage.tsx");
  for (const requirement of ["1 hectare", "10% crown closure", "5 metres", "1984", "2000", "British Columbia", "north of 52", "50%", "±2 years", "±3 years before 1995"]) assert.ok(page.includes(requirement));
  assert.match(page, /fire; recorded harvest; recorded insect or disease disturbance; other recorded intervention; then detected change with no matching record/);
});

test("data page labels examples and links the ledger and documentation", async () => {
  const page = await read("../components/transparency/DataPage.tsx");
  assert.match(page, /illustrative examples/);
  assert.match(page, /href="https:\/\/github\.com\/chinonsoobeta\/Witness_Tree\/blob\/main\/data\/source-ledger\.json"/);
  assert.match(page, /href="https:\/\/github\.com\/chinonsoobeta\/Witness_Tree\/blob\/main\/docs\/SOURCE_LEDGER\.md"/);
  assert.match(page, /Two source archives have verified byte lengths/);
  assert.match(page, /lossless local copy/);
  assert.match(page, /608 self-intersections in Alberta/);
  assert.match(page, /href="https:\/\/github\.com\/chinonsoobeta\/Witness_Tree\/blob\/main\/data\/staged-acquisitions\.json"/);
  assert.match(page, /href="https:\/\/github\.com\/chinonsoobeta\/Witness_Tree\/blob\/main\/data\/staged-geospatial-profile\.json"/);
  assert.match(page, /href="https:\/\/github\.com\/chinonsoobeta\/Witness_Tree\/blob\/main\/data\/transformation-runs\/qc-historic-wildfire-v1-2026-08-12\.json"/);
});

test("transparency pages do not make prohibited product claims or turn unknown into zero", async () => {
  const pages = await Promise.all([read("../components/transparency/MethodologyPage.tsx"), read("../components/transparency/DataPage.tsx")]);
  const claims = pages.join("\n").toLowerCase();
  for (const term of ["real" + "-time", "com" + "plete", "tr" + "uth"]) assert.equal(claims.includes(term), false);
  assert.doesNotMatch(claims, /unknown[^\n]{0,120}\b0\b/);
});
