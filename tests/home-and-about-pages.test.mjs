import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

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
