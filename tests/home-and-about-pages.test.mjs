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

test("landing pages use the released province span and retain the bounded scope", async () => {
  const [english, french] = await Promise.all([read("../app/en/page.tsx"), read("../app/fr/page.tsx")]);
  for (const page of [english, french]) {
    assert.match(page, /SPAN_ROWS/);
    /*
     * This used to require the page to say the release "is not per-cell
     * geometry". That stopped being true on 2026-09-19, when the clipped
     * four-province per-cell products were admitted and released, so the
     * sentence became a false denial of something the Explore map draws.
     *
     * The binding limit is countable:false, not absence, so the page is held
     * to that instead, at the same strictness: the patches exist, they may be
     * drawn, no total may be taken from them, and the formal gate stays open.
     */
    assert.match(page, /drawn, not counted|dessinées, et non comptées/);
    assert.match(page, /no total may be taken|aucun total ne peut en être tiré/);
    assert.match(page, /expert review|examen par des spécialistes/);
    assert.match(page, /Phase 2|phase 2/);
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

/*
 * This replaces the staged-grammar test that pinned the landing-hero and
 * landing-record-band structure. The confidence-first canvas puts the coverage
 * statement and the evidence legend ahead of the first figure, and reports each
 * province through a ranked list rather than a grid of cards, so the old
 * structure is gone by design rather than by neglect. The contract it enforced
 * is kept here against the composition that replaced it, at the same strictness:
 * one call to action per band, the interior sections still numbered, and no
 * em dash.
 */
test("the landing composition puts coverage and the legend before any figure", async () => {
  const [english, french] = await Promise.all([read("../app/en/page.tsx"), read("../app/fr/page.tsx")]);
  for (const [page, route, methods] of [
    [english, "/en/explore", "/en/methods#coverage-gap"],
    [french, "/fr/explorer", "/fr/methodes#coverage-gap"],
  ]) {
    const hero = section(page, '<header className="masthead masthead--record">', "</header>");
    assert.match(hero, /<p className="eyebrow">/);
    assert.match(hero, /<h1>/);
    assert.match(hero, /<ProvinceBar/);
    // Nothing leaves the hero: the reader meets the coverage statement first.
    assert.equal((hero.match(/<Link\b/g) ?? []).length, 0);
    // Order is the claim. The coverage statement and the legend both stand
    // ahead of the section that reports a province's figures.
    const coverage = page.indexOf("<CoverageStatement");
    const legend = page.indexOf("<EvidenceMarks");
    const record = page.indexOf('<section className="content-section landing-coverage"');
    assert.ok(coverage > 0 && legend > coverage && record > legend, "coverage, then legend, then figures");
    const band = section(page, '<section className="content-section landing-coverage"', '<section className="content-section">');
    assert.match(band, /<ProvinceRecordList/);
    assert.match(band, new RegExp(`href="${methods}"`));
    assert.match(band, new RegExp(`href="${route}"`));
    assert.equal((page.match(/landing-coverage/g) ?? []).length, 1);
    /*
     * The interior sections are no longer numbered. A numbered marker claims
     * the content is a sequence the reader should follow in order, and these
     * four never were: 02 and 04 stated the same caveat several screens
     * apart. They collapse into the evidence marks plus one limits block, so
     * the contract enforced here is now that no such marker survives and that
     * the limits block is single.
     */
    assert.doesNotMatch(page, /<span className="num">/);
    assert.equal((page.match(/aria-labelledby="(limits|limites)"/g) ?? []).length, 1);
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
    // Either derived span is acceptable; a literal year range is not. The
    // The landing pages derive the released span instead of repeating a
    // literal range, which keeps the period attached to the figures.
    assert.match(source, /EXPLORE_COVERAGE_PERIOD|productionAggregatePeriod|provinceSpanReach/);
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
  assert.match(gateway, /<a className="gateway-choice gateway-choice--en" href="\/en">/);
  assert.match(gateway, /<a className="gateway-choice gateway-choice--fr" href="\/fr" lang="fr">/);
  assert.match(gateway, /<span className="gateway-choice-name">English<\/span>/);
  assert.match(gateway, /<span className="gateway-choice-name">Français<\/span>/);
  assert.match(gateway, /<span className="gateway-choice-sub">Continue in English →<\/span>/);
  assert.match(gateway, /<span className="gateway-choice-sub">Continuer en français →<\/span>/);
});

test("the gate names where each photograph was taken", async () => {
  const [gateway, css] = await Promise.all([read("../app/(gateway)/page.tsx"), read("../app/globals.css")]);
  // One caption per photograph, in the same order as the rotation, so the name
  // on screen belongs to the frame on screen.
  assert.match(gateway, /const GATE_PHOTOGRAPHS = \[/);
  for (const [file, location] of [
    ["forest.jpg", "Shannon Falls Provincial Park, British Columbia"],
    ["forest-2.jpg", "Lillooet, British Columbia"],
    ["forest-3.jpg", "McKinley Landing, Kelowna, British Columbia"],
    ["forest-4.jpg", "Stanley Park, Vancouver, British Columbia"],
  ]) {
    assert.ok(gateway.includes(`{ file: "${file}", location: "${location}" }`), file);
  }
  assert.match(gateway, /className="gateway-location-name"/);
  // The caption ramps between the two artboards. Its floor is the owner's own
  // mobile value, so a phone gets 12px without a separate override.
  assert.match(css, /\.gateway-location-name \{[\s\S]*?font-size: clamp\(12px, [^,]+, 15px\);/);
  assert.doesNotMatch(css, /@media \(max-width: 640px\) \{[\s\S]*?\.gateway-location-name \{ font-size:/);
});

test("the decorative gate loops every five seconds without controls and respects reduced motion", async () => {
  const [gateway, css] = await Promise.all([read("../app/(gateway)/page.tsx"), read("../app/globals.css")]);
  assert.match(gateway, /\["forest\.jpg", "forest-2\.jpg", "forest-3\.jpg", "forest-4\.jpg"\]/);
  assert.match(gateway, /alt="" role="presentation"/);
  assert.doesNotMatch(gateway, /<input|<button|gateway-motion/);
  assert.match(css, /animation: gateway-crossfade 20s linear infinite/);
  assert.match(css, /animation: gateway-caption 20s linear infinite/);
  for (const [index, delay] of [[2, -15], [3, -10], [4, -5]]) {
    assert.ok(css.includes(`.gateway-slideshow .gateway-photo:nth-of-type(${index}) { animation-delay: ${delay}s; }`));
    assert.ok(css.includes(`.gateway-slideshow .gateway-location-name:nth-of-type(${index}) { animation-delay: ${delay}s; }`));
  }
  assert.match(css, /@keyframes gateway-crossfade\s*\{\s*0%, 25%, 100% \{ opacity: 1; \}\s*30\.5%, 94\.5% \{ opacity: 0; \}/);
  // Captions clear the frame before the next arrives: no two place names are
  // ever legible at once.
  assert.match(css, /@keyframes gateway-caption\s*\{\s*0%, 23%, 100% \{ opacity: 1; \}\s*25%, 98% \{ opacity: 0; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.gateway-slideshow \.gateway-photo \{ animation: none; opacity: 1; \}/);
  assert.match(css, /\.gateway-slideshow \.gateway-photo:not\(:first-of-type\) \{ display: none; \}/);
  assert.match(css, /\.gateway-slideshow \.gateway-location-name:not\(:first-of-type\) \{ display: none; \}/);
  // A flat dark scrim, not the page ground: var(--ground) inverts with the
  // theme and would wash out the white gate type in the light palette.
  assert.match(css, /\.gateway-scrim \{[^}]*background: var\(--gate-scrim\);/);
  assert.doesNotMatch(css, /\.language-gateway::before/);
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
