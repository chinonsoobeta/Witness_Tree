import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("governance content is bilingual and truthful about unfinished external gates", async () => {
  const content = await read("../components/governance/GovernancePage.tsx");
  for (const phrase of ["No production correction", "Aucune correction de production"]) assert.match(content, new RegExp(phrase));
  assert.doesNotMatch(content, /permission (?:was|has been) granted|contacted on \d|legally approved/i);
  // The owner removed the Decisions, Engagement, Privacy and Releases pages and
  // every reference to reserves; nothing here may stand in for them.
  assert.doesNotMatch(content, /reserve|réserve|Indigenous engagement|Dialogue avec les peuples autochtones/i);
});

test("the three remaining governance surfaces have independently citable locale routes", async () => {
  const pairs = [
    ["../app/en/glossary/page.tsx", "../app/fr/glossaire/page.tsx"],
    ["../app/en/corrections/page.tsx", "../app/fr/corrections/page.tsx"],
    ["../app/en/terms/page.tsx", "../app/fr/conditions/page.tsx"],
  ];
  for (const [en, fr] of pairs) {
    assert.match(await read(en), /locale="en"/);
    assert.match(await read(fr), /locale="fr"/);
  }
  for (const removed of ["decisions", "engagement", "privacy", "releases"])
    assert.equal(existsSync(new URL(`../app/en/${removed}/page.tsx`, import.meta.url)), false, `${removed} was removed by the owner`);
  for (const removed of ["decisions", "dialogue", "confidentialite", "versions"])
    assert.equal(existsSync(new URL(`../app/fr/${removed}/page.tsx`, import.meta.url)), false, `${removed} was removed by the owner`);
});

test("required correction service levels are present", async () => {
  const content = await read("../components/governance/GovernancePage.tsx");
  assert.match(content, /Response times, in business days to acknowledge and then to resolve: critical, 1 and 5; material, 3 and 15; minor, 5 and 30/);
});

test("glossary separates event grades from measurement states and defines reader terms", async () => {
  const content = await read("../components/governance/GovernancePage.tsx");
  for (const phrase of [
    "Event coverage grades",
    "enhanced local records",
    "Coverage for a province or riding says how much of it was mapped",
    "all of it, part of it with the rest unknown, or none of it",
    "Les catégories de couverture des événements",
    "La couverture d’une province ou d’une circonscription indique quelle part a été cartographiée",
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
  assert.match(content, /use that publisher’s correction process/);
  assert.match(content, /Your notes don’t open a case or start the response clock/);
  assert.match(content, /utilisez le processus de correction de cet éditeur/);
  assert.doesNotMatch(content, /mailto:|corrections@|correction@/i);
});

test("method copy uses the current interval control", async () => {
  const method = await read("../components/transparency/MethodologyPage.tsx");
  assert.match(method, /EXPLORE_DEFAULT_YEAR/);
  assert.match(method, /EXPLORE_YEAR_MIN/);
  assert.doesNotMatch(method, /default view (?:starts|begins) in 2000|vue par défaut commence en 2000/);
  // The control is a first and a last year, so the copy describes a span.
  assert.match(method, /On Explore you choose a first and a last year/);
  assert.match(method, /vous choisissez une première et une dernière année/);
});

test("nothing links to the removed Releases page", async () => {
  const [data, englishExplore, frenchExplore] = await Promise.all([
    read("../components/transparency/DataPage.tsx"),
    read("../app/en/explore/page.tsx"),
    read("../app/fr/explorer/page.tsx"),
  ]);
  for (const content of [data, englishExplore, frenchExplore]) assert.doesNotMatch(content, /\/en\/releases|\/fr\/versions/);
});


test("governance states its status under the title and links to the correction instructions", async () => {
  const source = await read("../components/governance/GovernancePage.tsx");
  // No figures on these pages, so no figures caveat and no evidence key: the
  // status and the way to report an error sit under the title as plain text.
  assert.doesNotMatch(source, /CoverageStatement|EvidenceKey/);
  assert.ok(source.indexOf('<p className="dek">{page.status}</p>') < source.indexOf("page.sections.map"));
  assert.match(source, /href=\{kind === "corrections" \? "#correction-instructions" : `\/\$\{locale\}\/corrections`\}/);
  assert.match(source, /id=\{kind === "corrections" && index === 2 \? "correction-instructions" : undefined\}/);
  for (const label of ["Read the correction instructions", "Consulter les instructions de correction"]) assert.ok(source.includes(label));
});
