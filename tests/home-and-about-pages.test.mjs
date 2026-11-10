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
     * The preview sentence ("for looking at, not adding up", "no expert has
     * reviewed", "not the final release") was replaced on 2026-10-03 at the
     * owner's request by a plain statement of the years. What stays binding is
     * the span, the methods and data links, and the source attribution.
     */
    assert.match(page, /provinceSpanReach\("(?:en|fr)", "(?:span|from)"\)/);
    assert.match(page, /attribution\.href/);
  }
  assert.match(english, /These are figures for \{provinceSpanReach\("en", "span"\)\}/);
  assert.match(english, /What this site doesn’t claim/);
  // The owner asked on 2026-09-27 for the "provisional" sentence to go; the
  // preview status above still says the figures are not final.
  assert.doesNotMatch(english, /These figures are provisional/);
  assert.doesNotMatch(french, /Ces chiffres sont provisoires/);
  assert.doesNotMatch(english, /The verified .* province aggregate/);
  assert.doesNotMatch(french, /agrégat provincial vérifié/);
  assert.match(english, /The record covers these four provinces only/);
  assert.match(french, /Le registre ne couvre que ces quatre provinces/);
  assert.doesNotMatch(english, /Every result shows what the evidence says/);
  assert.doesNotMatch(french, /Chaque résultat indique ce que montrent les preuves/);
});

/*
 * The home page was cut to about two desktop screens on 2026-11-10 (audit
 * items A1 and A3 to A9). The evidence legend, the province cards, the
 * recovery breakdown, the four data cards, the top-five rankings, the "Read
 * the record" cards and the list of limits each have a home elsewhere, and
 * the page links there. What this pins is the order the brief set (question
 * and search, province bar, one figure with its minimum, the four provinces,
 * three doors, one line of limits), that each removed section stays removed,
 * and the contracts the old test held: one way out of the hero, a single
 * limits block, no numbered markers and no em dash.
 */
test("the landing page is the question, one figure, four provinces, three doors and one line of limits", async () => {
  const [english, french] = await Promise.all([read("../app/en/page.tsx"), read("../app/fr/page.tsx")]);
  for (const [page, locale, route, compare, harvest, methods, unknown] of [
    [english, "en", "/en/explore", "/en/compare?rank=cities#rankings", "HARVEST_FIRE_ROUTES.en", "/en/methods#limits", "/en/unknown"],
    [french, "fr", "/fr/explorer", "/fr/comparer?rank=cities#rankings", "HARVEST_FIRE_ROUTES.fr", "/fr/methodes#limits", "/fr/inconnu"],
  ]) {
    const hero = section(page, '<header className="masthead masthead--record">', "</header>");
    // The owner removed the hero eyebrow on 2026-09-27; the question is the title.
    assert.doesNotMatch(hero, /<p className="eyebrow">/);
    assert.match(hero, /<h1>/);
    assert.ok(hero.indexOf("<HomeSearch") < hero.indexOf("<ProvinceBar"), "search, then the province bar");
    // The owner asked on 2026-10-03 for one way out of the hero: the map.
    assert.equal((hero.match(/<Link\b/g) ?? []).length, 1);
    assert.match(hero, new RegExp(`<Link href="${route}">`));

    // The order the brief set. The headline carries its own minimum, so there
    // is no separate coverage banner.
    assert.equal(page.indexOf("<CoverageStatement"), -1, "the headline panel says the minimum itself");
    const order = ["</header>", "<CumulativeHeadline", "<ProvinceRecordList", 'className="content-section home-doors"', "<RecoveryAnswer", 'className="content-section home-caveat"'].map((marker) => page.indexOf(marker));
    order.forEach((at, index) => assert.ok(at > (order[index - 1] ?? 0), `${locale}: section ${index} is out of order`));

    // The four provinces carry the span in their heading and one way to the
    // map for the same years, and the gap notes are one link away.
    const provinces = section(page, 'className="content-section home-provinces"', "</section>");
    assert.match(provinces, /provinceSpanReach\("(?:en|fr)"\)/);
    assert.ok(provinces.includes(`${route}?from=1984&year=2022`));
    assert.ok(provinces.includes(`<Link href="${unknown}">`));

    // Three doors: the map, Compare (on its rankings, a contract with the
    // Compare page), and harvest and fire.
    const doors = section(page, 'className="content-section home-doors"', "</nav>");
    assert.equal((doors.match(/<article className="record-card"/g) ?? []).length, 3);
    assert.ok(doors.includes(`<Link href="${route}">`));
    assert.ok(doors.includes(`<Link href="${compare}">`));
    assert.ok(doors.includes(`<Link href={${harvest}}>`));
    // Older links to "/<locale>#ridings-most-lost" still land on the Compare door.
    assert.match(doors, /id="ridings-most-lost"/);

    // Removed from home; each has a page of its own.
    for (const gone of ["<EvidenceMarks", "<HarvestSources", "<CitiesMostLost", "<RidingsMostLost", "limits-list", "landing-coverage", "evidence-band"]) {
      assert.ok(!page.includes(gone), `${locale}: ${gone} is back on the home page`);
    }
    assert.ok(page.includes(`href="${locale === "en" ? "/en/data" : "/fr/donnees"}"`), "one link to the Data page");

    // One limits block, one line, linking to the list at the end of Methods.
    assert.equal((page.match(/aria-labelledby="(limits|limites)"/g) ?? []).length, 1);
    const caveat = section(page, 'className="content-section home-caveat"', "</section>");
    assert.ok(caveat.includes(`<Link href="${methods}">`));
    assert.match(caveat, locale === "en" ? /detected loss is a minimum/ : /la perte détectée est un minimum/);
    assert.doesNotMatch(page, /<span className="num">/);
    assert.doesNotMatch(page, /\u2014/);
  }
});

test("the limits the home page used to list are at the end of Methods, in both languages", async () => {
  const methods = await read("../components/transparency/MethodologyPage.tsx");
  for (const item of [
    "That a loss was caused by logging or deforestation.",
    "Any legal or compliance finding.",
    "How much sellable timber there is.",
    "Who is responsible, based on who is nearby.",
    "How a wildfire will spread.",
    "A total of all the loss. Detected loss is a minimum.",
    "Qu’une perte soit due à l’exploitation forestière ou à la déforestation.",
    "Toute conclusion juridique ou de conformité.",
    "La quantité de bois vendable.",
    "Qui est responsable, selon qui se trouve à proximité.",
    "Comment un incendie se propagera.",
    "Un total de toutes les pertes. La perte détectée est un minimum.",
  ]) assert.ok(methods.includes(`"${item}"`), item);
  assert.match(methods, /heading === copy\.limits \? "limits"/);
  // Still the last section, so "Methods ends with this section" stays true.
  assert.match(methods, /\[copy\.limits, copy\.limitsText\],\n {2}\];/);
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
  // The unknown share is formatted where the provinces are now listed, for both locales.
  const provinces = await read("../components/site/ProvinceRecordList.tsx");
  assert.match(provinces, /formatUnknownSharePercent\(row\.unknownSharePercent, locale\)/);
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
  // The gateway is bilingual, so each place is named in English and in French.
  for (const [file, en, fr] of [
    ["forest.jpg", "Shannon Falls Provincial Park, British Columbia", "Parc provincial Shannon Falls, Colombie-Britannique"],
    ["forest-2.jpg", "Lillooet, British Columbia", "Lillooet, Colombie-Britannique"],
    ["forest-3.jpg", "McKinley Landing, Kelowna, British Columbia", "McKinley Landing, Kelowna, Colombie-Britannique"],
    ["forest-4.jpg", "Stanley Park, Vancouver, British Columbia", "Parc Stanley, Vancouver, Colombie-Britannique"],
  ]) {
    assert.ok(gateway.includes(`{ file: "${file}", location: { en: "${en}", fr: "${fr}" } }`), file);
  }
  assert.match(gateway, /className="gateway-location-name"/);
  assert.match(gateway, /<span lang="fr">\{location\.fr\}<\/span>/);
  // The caption ramps between the two artboards. Its floor is the owner's own
  // mobile value, so a phone gets 12px without a separate override.
  assert.match(css, /\.gateway-location-name \{[\s\S]*?font-size: clamp\(12px, [^,]+, 15px\);/);
  assert.doesNotMatch(css, /@media \(max-width: 640px\) \{[\s\S]*?\.gateway-location-name \{ font-size:/);
});

test("the decorative gate loops every five seconds without controls and respects reduced motion", async () => {
  const [gateway, css] = await Promise.all([read("../app/(gateway)/page.tsx"), read("../app/globals.css")]);
  assert.deepEqual([...gateway.matchAll(/file: "([^"]+)"/g)].map((match) => match[1]),
    ["forest.jpg", "forest-2.jpg", "forest-3.jpg", "forest-4.jpg"]);
  assert.match(gateway, /const slideshow = photographs.length === 4/);
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

test("about routes are bilingual and carry the owner's own text", async () => {
  const [english, french, header, footer] = await Promise.all([read("../app/en/about/page.tsx"), read("../app/fr/a-propos/page.tsx"), read("../components/site/SiteHeader.tsx"), read("../components/site/SiteFooter.tsx")]);
  // The owner wrote this page on 2026-10-03; it is set as written.
  assert.match(english, /My name is Chinonso Obeta/);
  assert.match(english, /not endorsed by the Government of British Columbia/);
  assert.match(english, /fr: "\/fr\/a-propos"/);
  assert.match(french, /en: "\/en\/about"/);
  for (const page of [english, french]) {
    assert.match(page, /https:\/\/www\.linkedin\.com\/in\/chinonso-obeta/);
    assert.match(page, /https:\/\/www\.chinonsoobeta\.dev/);
    assert.doesNotMatch(page, /Coming soon|À venir/);
  }
  // On 2026-10-28 the page stopped promising a count of trees left, which the
  // record cannot give (plan section 1.3), and lists what it does answer.
  assert.doesNotMatch(english, /How many trees are left, and where are they\?/);
  assert.doesNotMatch(french, /combien d’arbres reste-t-il/);
  for (const [page, routes] of [
    [english, ["/en/explore", "/en/search", "/en/explore?mode=condition-recovery", "/en/data/harvest-and-fire", "/en/data/bc-harvest-volume", "/en/data/provincial-harvest-volume", "/en/methods"]],
    [french, ["/fr/explorer", "/fr/recherche", "/fr/explorer?mode=condition-recovery", "/fr/donnees/recolte-et-incendies", "/fr/donnees/volume-recolte-bc", "/fr/donnees/volume-recolte-provinces", "/fr/methodes"]],
  ]) {
    for (const route of routes) assert.ok(page.includes(`<Link href="${route}">`), route);
  }
  assert.match(english, /does not estimate how many trees are left/);
  assert.match(french, /n’estime pas combien d’arbres il reste/);
  // About moved from the footer to the main menu, right after Data.
  assert.match(header, /\["Data", "\/en\/data"\],\s*\["About", "\/en\/about"\]/);
  assert.match(header, /\["Données", "\/fr\/donnees"\],\s*\["À propos", "\/fr\/a-propos"\]/);
  assert.doesNotMatch(footer, /\["About", "\/en\/about"\]|\["À propos", "\/fr\/a-propos"\]/);
  assert.doesNotMatch(header, /\["Account", "\/en\/account"\]|\["Wildfire", "\/en\/wildfire"\]/);
  assert.doesNotMatch(header, /\["Compte", "\/fr\/compte"\]|\["Incendies", "\/fr\/incendies"\]/);
  // Accounts are not active, so since 2026-11-10 (K1) no menu links to the
  // Account page; it stays reachable by its address and in the sitemap.
  assert.doesNotMatch(footer, /\/en\/account|\/fr\/compte/);
  assert.doesNotMatch(header, /\/en\/account|\/fr\/compte/);
});
