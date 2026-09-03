import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Expected ${start} before ${end}`);
  return source.slice(from, to);
}

test("landing pages use the production aggregate and retain the bounded scope", async () => {
  const [english, french] = await Promise.all([read("../app/en/page.tsx"), read("../app/fr/page.tsx")]);
  for (const page of [english, french]) {
    assert.match(page, /EXPLORE_PRODUCTION_LAYER\.rows/);
    assert.match(page, /not per-cell geometry|ne fournit pas une géométrie par cellule/);
    assert.match(page, /attribution\.href/);
  }
  assert.match(english, /technical preview/);
  assert.match(french, /aperçu technique/);
  assert.match(english, /bounded, provisional/);
  assert.match(french, /provisoire et limité/);
  assert.doesNotMatch(english, /The verified .* province aggregate/);
  assert.doesNotMatch(french, /agrégat provincial vérifié/);
  assert.match(english, /Other provinces are coming soon/);
  assert.match(french, /D’autres provinces s’ajouteront bientôt/);
  assert.doesNotMatch(english, /Every result shows what the evidence says/);
  assert.doesNotMatch(french, /Chaque résultat indique ce que montrent les preuves/);
});

test("the staged landing grammar stops after the hero and first interior section", async () => {
  const [english, french] = await Promise.all([read("../app/en/page.tsx"), read("../app/fr/page.tsx")]);
  for (const [page, route] of [[english, "/en/explore"], [french, "/fr/explorer"]]) {
    const hero = section(page, '<header className="masthead landing-hero">', "</header>");
    const record = section(page, '<section className="content-section landing-record-band"', '<section className="content-section prose-measure">');
    assert.match(hero, /<p className="eyebrow">/);
    assert.match(hero, /<h1>/);
    assert.match(hero, /<ProvinceBar/);
    assert.equal((hero.match(/<Link\b/g) ?? []).length, 1);
    assert.match(hero, new RegExp(`href="${route}"`));
    assert.match(record, /<p className="eyebrow">/);
    assert.match(record, /<h2 id=/);
    assert.match(record, /landing-record-evidence/);
    assert.equal((record.match(/<Link\b/g) ?? []).length, 1);
    assert.match(record, new RegExp(`href="${route}"`));
    assert.equal((page.match(/landing-record-band/g) ?? []).length, 1);
    assert.match(page, /<span className="num">02<\/span>/);
    assert.match(page, /<span className="num">03<\/span>/);
    assert.match(page, /<span className="num">04<\/span>/);
    assert.doesNotMatch(page, /\u2014/);
  }
});

test("public coverage copy derives from the bounded Explore period", async () => {
  const [gateway, english, french, footer, brand, fixtures, period] = await Promise.all([
    read("../app/(gateway)/page.tsx"),
    read("../app/en/page.tsx"),
    read("../app/fr/page.tsx"),
    read("../components/site/SiteFooter.tsx"),
    read("../lib/domain/brand.ts"),
    read("../lib/places/fixtures.ts"),
    read("../lib/explore/types.ts"),
  ]);
  for (const source of [gateway, english, french, footer, brand, fixtures]) {
    assert.match(source, /EXPLORE_COVERAGE_PERIOD/);
    assert.doesNotMatch(source, /1984(?:–| to )present|1984–2025|depuis 1984/i);
  }
  assert.match(period, /EXPLORE_YEAR_MAX = 2022/);
  assert.match(period, /EXPLORE_COVERAGE_PERIOD/);
  assert.match(english, /formatUnknownSharePercent\(row\.unknownSharePercent, "en"\)/);
  assert.match(french, /formatUnknownSharePercent\(row\.unknownSharePercent, "fr"\)/);
});

test("language choices use native document navigation", async () => {
  const gateway = await read("../app/(gateway)/page.tsx");
  assert.doesNotMatch(gateway, /next\/link|<Link\b/);
  assert.match(gateway, /<a className="btn btn--primary" href="\/en">Continue in English<\/a>/);
  assert.match(gateway, /<a className="btn btn--outline" href="\/fr" lang="fr">Continuer en français<\/a>/);
});

test("localized not-found pages use the site shell and offer three exits", async () => {
  const [english, french, englishCatchAll, frenchCatchAll] = await Promise.all([
    read("../app/en/not-found.tsx"),
    read("../app/fr/not-found.tsx"),
    read("../app/en/[...not-found]/page.tsx"),
    read("../app/fr/[...not-found]/page.tsx"),
  ]);
  assert.match(english, /<SiteShell locale="en">/);
  assert.match(french, /<SiteShell locale="fr">/);
  for (const route of ["/en/explore", "/en/search", "/en"]) assert.match(english, new RegExp(route));
  for (const route of ["/fr/explorer", "/fr/recherche", "/fr"]) assert.match(french, new RegExp(route));
  assert.match(english, /Page not found/);
  assert.match(french, /Page introuvable/);
  assert.match(englishCatchAll, /notFound\(\)/);
  assert.match(frenchCatchAll, /notFound\(\)/);
});

test("about routes are bilingual and reserve owner statements for owner copy", async () => {
  const [english, french, header, footer] = await Promise.all([read("../app/en/about/page.tsx"), read("../app/fr/a-propos/page.tsx"), read("../components/site/SiteHeader.tsx"), read("../components/site/SiteFooter.tsx")]);
  assert.match(english, /Owner copy pending/);
  assert.match(english, /No owner statement has been supplied/);
  assert.match(english, /fr: "\/fr\/a-propos"/);
  assert.match(french, /Texte du propriétaire à venir/);
  assert.match(french, /Aucune déclaration du propriétaire n’a été fournie/);
  assert.match(french, /en: "\/en\/about"/);
  assert.doesNotMatch(header, /\["About", "\/en\/about"\]/);
  assert.doesNotMatch(header, /\["À propos", "\/fr\/a-propos"\]/);
  assert.match(footer, /\["About", "\/en\/about"\]/);
  assert.match(footer, /\["À propos", "\/fr\/a-propos"\]/);
  assert.doesNotMatch(header, /\["Account", "\/en\/account"\]|\["Wildfire", "\/en\/wildfire"\]/);
  assert.doesNotMatch(header, /\["Compte", "\/fr\/compte"\]|\["Incendies", "\/fr\/incendies"\]/);
  assert.match(footer, /\["Account", "\/en\/account"\]/);
  assert.match(footer, /\["Compte", "\/fr\/compte"\]/);
});
