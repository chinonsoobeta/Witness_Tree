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

test("glossary separates event grades from measurement states and defines reader terms", async () => {
  const content = await read("../components/governance/GovernancePage.tsx");
  for (const phrase of [
    "Event coverage grades",
    "enhanced local records",
    "Province and riding measurement coverage states",
    "complete, partial with unknown area, or none mapped",
    "Les catégories de couverture des événements",
    "Les états de couverture des mesures provinciales et des circonscriptions",
  ]) assert.match(content, new RegExp(phrase));
  for (const heading of [
    "Per-cell",
    "Annual interval",
    "Province aggregate",
    "Provisional",
    "Mapped extent",
    "Unknown share",
    "Representation order",
    "Detected loss patch",
    "Par cellule",
    "Intervalle annuel",
    "Agrégat provincial",
    "Étendue cartographiée",
    "Part inconnue",
    "Décret de représentation",
    "Zone de perte détectée",
  ]) assert.match(content, new RegExp(`heading: "${heading}"`));
});

test("corrections provides interim actions without inventing an intake address", async () => {
  const content = await read("../components/governance/GovernancePage.tsx");
  assert.match(content, /use the publisher’s own correction route/);
  assert.match(content, /Preparing this record does not file a case or start a service-level clock/);
  assert.match(content, /utilisez la voie de correction de l’éditeur/);
  assert.match(content, /Aucune adresse de correction ni aucun formulaire de soumission n’est actuellement autorisé/);
  assert.doesNotMatch(content, /mailto:|corrections@|correction@/i);
});

test("method and decision copy use the current interval control", async () => {
  const [method, governance] = await Promise.all([
    read("../components/transparency/MethodologyPage.tsx"),
    read("../components/governance/GovernancePage.tsx"),
  ]);
  for (const content of [method, governance]) {
    assert.match(content, /EXPLORE_DEFAULT_YEAR/);
    assert.match(content, /EXPLORE_YEAR_MIN/);
    assert.doesNotMatch(content, /default view (?:starts|begins) in 2000|vue par défaut commence en 2000/);
  }
  assert.match(method, /each selected year names the interval ending in that year/);
  assert.match(method, /chaque année choisie désigne l’intervalle qui se termine cette année-là/);
});

test("Releases indexes the bounded release and Data and Explore point back to it", async () => {
  const [governance, data, englishExplore, frenchExplore] = await Promise.all([
    read("../components/governance/GovernancePage.tsx"),
    read("../components/transparency/DataPage.tsx"),
    read("../app/en/explore/page.tsx"),
    read("../app/fr/explorer/page.tsx"),
  ]);
  assert.match(governance, /provinceBulkRelease\.id/);
  assert.match(governance, /provinceCsv\.url/);
  assert.match(governance, /provinceGeoPackage\.url/);
  assert.match(governance, /No production data release satisfying the formal Phase 2 gate exists/);
  assert.doesNotMatch(governance, /No production data release exists\. The current repository/);
  assert.match(data, /\/en\/releases/);
  assert.match(data, /\/fr\/versions/);
  assert.match(englishExplore, /href="\/en\/releases"/);
  assert.match(frenchExplore, /href="\/fr\/versions"/);
});
