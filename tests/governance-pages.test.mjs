import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("governance content is bilingual and truthful about unfinished external gates", async () => {
  const content = await read("../components/governance/GovernancePage.tsx");
  for (const phrase of ["No production correction", "Aucune correction de production", "No engagement contact route", "Aucune voie de dialogue", "stores no account", "ne conserve actuellement aucune donnée", "not to pursue Mistik", "ne pas poursuivre Mistik"]) assert.match(content, new RegExp(phrase));
  for (const phrase of ["Mistik request: not opened", "Terms: none", "Honorarium: none", "Final outcome: not pursued", "Demande concernant Mistik : non ouverte", "Conditions : aucune", "Honoraire : aucun", "Résultat final : non poursuivie"]) assert.match(content, new RegExp(phrase));
  assert.doesNotMatch(content, /permission (?:was|has been) granted|contacted on \d|legally approved/i);
});

test("all seven governance surfaces have independently citable locale routes", async () => {
  const pairs = [
    ["../app/en/glossary/page.tsx", "../app/fr/glossaire/page.tsx"],
    ["../app/en/corrections/page.tsx", "../app/fr/corrections/page.tsx"],
    ["../app/en/decisions/page.tsx", "../app/fr/decisions/page.tsx"],
    ["../app/en/engagement/page.tsx", "../app/fr/dialogue/page.tsx"],
    ["../app/en/privacy/page.tsx", "../app/fr/confidentialite/page.tsx"],
    ["../app/en/terms/page.tsx", "../app/fr/conditions/page.tsx"],
    ["../app/en/releases/page.tsx", "../app/fr/versions/page.tsx"],
  ];
  for (const [en, fr] of pairs) {
    assert.match(await read(en), /locale="en"/);
    assert.match(await read(fr), /locale="fr"/);
  }
});

test("required correction service levels and Indigenous safeguards are present", async () => {
  const content = await read("../components/governance/GovernancePage.tsx");
  assert.match(content, /Critical: acknowledge within 1 business day and resolve within 5/);
  assert.match(content, /Indigenous geography content: 1 and 10/);
  assert.match(content, /do not describe the full extent of Indigenous lands, rights, title or relationships/);
  assert.match(content, /No ranking, rights finding, consent finding or compliance claim/);
});
