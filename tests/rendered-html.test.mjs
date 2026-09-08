import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// The map fetches its tiles and boundary overlays from a remote origin named in these
// modules. The policy has to name the same origin, so it is derived from them rather
// than restated: moving the CDN without widening connect-src fails here instead of
// silently blocking every tile in a browser.
const BROWSER_FETCHED_SOURCES = ["../lib/explore/map-style.ts", "../lib/explore/boundaries.ts"];

function browserFetchedOrigins() {
  const origins = new Set();
  for (const source of BROWSER_FETCHED_SOURCES) {
    const text = readFileSync(new URL(source, import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      // An attribution link is followed, not fetched, so it needs no connect-src entry.
      if (/\bhref\b/.test(line)) continue;
      for (const [, url] of line.matchAll(/"(https:\/\/[^"]+)"/g)) origins.add(new URL(url).origin);
    }
  }
  return [...origins].sort();
}

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the bilingual language gateway", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<html lang="en">/);
  assert.match(html, /Witness Tree/);
  assert.match(html, /Continue in English/);
  assert.match(html, /Continuer en français/);
  assert.match(html, /href="\/en"[^>]*>[\s\S]*?Continue in English/);
  assert.match(html, /href="\/fr"[^>]*>[\s\S]*?Continuer en français/);
  assert.doesNotMatch(html, /loading skeleton|taking shape/i);
});

test("the entry gate has no figures or product navigation and tolerates the absent owner photograph", async () => {
  const html = await (await render("/")).text();
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(html)?.[1];
  assert.ok(main);
  // No measured quantity reaches the gate. The coverage period is the one
  // number on it, and it states the record's scope rather than a finding.
  const words = main.replace(/<[^>]*>/g, "").replaceAll("1984 to 2022", "").replaceAll("1984 à 2022", "");
  assert.doesNotMatch(words, /\d/);
  assert.doesNotMatch(html, /class="site-header|<figcaption/);
  assert.equal([...main.matchAll(/<a\b/g)].length, 2);
  if (existsSync(new URL("../public/gate/forest.jpg", import.meta.url))) {
    assert.match(main, /<img[^>]*src="\/gate\/forest\.jpg"[^>]*alt=""[^>]*role="presentation"/);
  } else {
    assert.doesNotMatch(main, /<img\b/);
  }
});

test("landing figures pair loss with unmapped area on one hectare scale in both languages", async () => {
  const hectares = [680273.64, 22204952.19, 714701.7, 8843646.69, 748863.72, 15372023.76, 800473.32, 4095.27];
  for (const locale of ["en", "fr"]) {
    const html = await (await render(`/${locale}`)).text();
    const cards = [...html.matchAll(/<article class="province-coverage-card"[^>]*>([\s\S]*?)<\/article>/g)].map((match) => match[1]);
    assert.equal(cards.length, 4);
    assert.ok(html.indexOf('class="coverage-statement"') < html.indexOf('class="province-coverage-card"'));
    assert.ok(html.indexOf('class="evidence-legend"') < html.indexOf('class="province-coverage-card"'));
    const values = cards.flatMap((card) => [...card.matchAll(/<strong class="province-coverage-value">([^<]+)<\/strong>/g)].map((match) => match[1]));
    const format = new Intl.NumberFormat(`${locale}-CA`, { maximumFractionDigits: 2 });
    assert.deepEqual(values, hectares.map((value) => `${format.format(value)} ha`));
    const widths = cards.flatMap((card) => [...card.matchAll(/class="province-coverage-fill" style="width:([\d.]+)%"/g)].map((match) => Number(match[1])));
    assert.equal(widths.length, 8);
    widths.forEach((width, index) => assert.ok(Math.abs(width / hectares[index] - 100 / 22204952.19) < 1e-12));
    for (const card of cards) {
      assert.match(card, /province-coverage-unknown/);
      assert.match(card, /of known mapped forest|de la forêt connue cartographiée/);
      assert.match(card, /of the province|de la superficie provinciale/);
      assert.match(card, /href="\/en\/data"|href="\/fr\/donnees"/);
    }
    assert.match(cards[3], /&lt;0[.,]01/);
    assert.match(cards[3], /GeoBC/);
  }
});

test("emits application security headers with the map delivery allowances", async () => {
  const response = await render("/en");
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("x-frame-options"), "DENY");

  const policy = response.headers.get("content-security-policy");
  assert.ok(policy);
  assert.match(policy, /(?:^|; )frame-ancestors 'none'(?:;|$)/);
  assert.match(policy, /(?:^|; )worker-src 'self'(?:;|$)/);
  assert.match(policy, /(?:^|; )img-src 'self' data: blob:(?:;|$)/);
  assert.match(policy, /(?:^|; )connect-src 'self' https:\/\/d3g1406o0uekin\.cloudfront\.net(?:;|$)/);

  const connect = /(?:^|; )connect-src ([^;]+)/.exec(policy)?.[1].split(" ") ?? [];
  const origins = browserFetchedOrigins();
  assert.ok(origins.length > 0);
  for (const origin of origins) {
    assert.ok(connect.includes(origin), `connect-src omits ${origin}, which the map fetches from the browser`);
  }
});

test("renders both localized public records with neutral non-claims", async () => {
  const [english, french] = await Promise.all([
    render("/en").then((response) => response.text()),
    render("/fr").then((response) => response.text()),
  ]);
  // The document language, not a wrapper inside <body>. Assistive technology picks the
  // page voice from <html lang>, so a French route under lang="en" is announced in English.
  assert.match(english, /<html lang="en">/);
  assert.match(french, /<html lang="fr">/);
  assert.doesNotMatch(french, /<html lang="en">/);
  assert.match(english, /What happened to the forest here\?/);
  assert.match(english, /does not estimate merchantable timber/);
  assert.match(french, /Qu’est-il arrivé à la forêt ici\?/);
  assert.match(french, /n’estime pas le bois marchand/);
  assert.doesNotMatch(`${english}\n${french}`, /the truth|real-time|complete record/i);
});

test("renders localized place and location records with semantic content and provenance", async () => {
  const [englishPlace, frenchPlace, englishLocation, frenchLocation] = await Promise.all([
    render("/en/places/bc-province?view=table").then((response) => response.text()),
    render("/fr/lieux/bc-province?view=table").then((response) => response.text()),
    render("/en/location/location-bc-province").then((response) => response.text()),
    render("/fr/emplacement/location-bc-province").then((response) => response.text()),
  ]);

  for (const html of [englishPlace, frenchPlace, englishLocation, frenchLocation]) {
    assert.match(html, /<main\b[^>]*id="main"/);
    assert.match(html, /<dl\b|<table/);
  }

  assert.match(englishPlace, /<html lang="en">/);
  assert.match(englishPlace, /<meta name="content-language" content="en"/);
  assert.match(englishPlace, /Illustrative British Columbia/);
  assert.match(englishPlace, /<table/);
  assert.match(englishPlace, /Illustrative source-ledger entries/);
  assert.match(frenchPlace, /<html lang="fr">/);
  assert.match(frenchPlace, /<meta name="content-language" content="fr"/);
  assert.match(frenchPlace, /Colombie-Britannique illustrative/);
  assert.match(frenchPlace, /<table/);
  assert.match(frenchPlace, /Entrées illustratives du registre des sources/);
  assert.match(englishLocation, /Coordinates and accuracy/);
  assert.match(englishLocation, /Provenance/);
  assert.match(frenchLocation, /Coordonnées et précision/);
  assert.match(frenchLocation, /Provenance/);
});

test("renders localized search results and Explore list/table alternatives without browser JavaScript", async () => {
  const [englishSearch, frenchSearch, englishExplore, frenchExplore] = await Promise.all([
    render("/en/search?q=British%20Columbia").then((response) => response.text()),
    render("/fr/recherche?q=Colombie-Britannique").then((response) => response.text()),
    render("/en/explore?mode=wildfire&presentation=list&data=table&year=2020").then((response) => response.text()),
    render("/fr/explorer?mode=wildfire&presentation=list&data=table&year=2020").then((response) => response.text()),
  ]);

  assert.match(englishSearch, /<main\b[^>]*id="main"/);
  assert.match(englishSearch, /Search places/);
  assert.match(englishSearch, /Place results are illustrative fixtures/);
  assert.match(englishSearch, /District results are measured from the source grid/);
  assert.match(englishSearch, /Illustrative British Columbia/);
  assert.match(frenchSearch, /<main\b[^>]*id="main"/);
  assert.match(frenchSearch, /Rechercher des lieux/);
  assert.match(frenchSearch, /Les résultats de lieux sont des exemples illustratifs/);
  assert.match(frenchSearch, /circonscriptions sont mesurés à partir de la grille source/);
  assert.match(frenchSearch, /Colombie-Britannique illustrative/);

  assert.match(englishExplore, /<main\b[^>]*id="main"/);
  assert.match(englishExplore, /Explore forest loss/);
  assert.match(englishExplore, /The list, chart, and table use illustrative fixtures/);
  assert.match(englishExplore, /This view does not imply a production geographic layer/);
  assert.match(englishExplore, /Reported fire perimeter/);
  assert.match(englishExplore, /<table/);
  assert.match(englishExplore, /Source attribution/);
  assert.match(frenchExplore, /<main\b[^>]*id="main"/);
  assert.match(frenchExplore, /Explorer les pertes forestières/);
  assert.match(frenchExplore, /La liste, le graphique et le tableau utilisent des exemples illustratifs/);
  assert.match(frenchExplore, /Cette vue n’implique aucune couche géographique de production/);
  assert.match(frenchExplore, /Périmètre d’incendie déclaré/);
  assert.match(frenchExplore, /<table/);
  assert.match(frenchExplore, /Attribution de la source/);
});
