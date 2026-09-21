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
  // Stripping tags in one pass leaves any construct the first pass reassembles,
  // so this repeats until the string stops changing before reading the text.
  let words = main;
  for (let previous = ""; previous !== words; ) {
    previous = words;
    words = words.replace(/<[^<>]*>/g, "");
  }
  words = words.replaceAll("1984 to 2022", "").replaceAll("1984 à 2022", "");
  assert.doesNotMatch(words, /\d/);
  assert.doesNotMatch(html, /class="site-header|<figcaption/);
  assert.equal([...main.matchAll(/<a\b/g)].length, 2);
  if (existsSync(new URL("../public/gate/forest.jpg", import.meta.url))) {
    assert.match(main, /<img[^>]*src="\/gate\/forest\.jpg"[^>]*alt=""[^>]*role="presentation"/);
  } else {
    assert.doesNotMatch(main, /<img\b/);
  }
});

test("landing figures show detected loss alone, on a scale of detected loss", async () => {
  /*
   * The card used to carry two measures side by side on one shared hectare
   * scale, detected loss and unmapped area, which is what forced the page to
   * print that the unmapped bar was not a measurement of forest loss. A
   * disclaimer that exists to undo a drawing means the drawing is wrong, so the
   * second bar is gone and the disclaimer with it.
   *
   * The cards are a ranked list now, and the unmapped share is a measure of
   * its own behind a toggle rather than a clause inside the loss caveat. The
   * assertions move with it at the same strictness: the server renders the
   * loss measure, one value and one bar per row, scaled against the largest
   * detected loss of the four, ranked by that same figure, with the unmapped
   * share still in the sentence that says why the figure is a floor.
   *
   * The scale sentence stays gone. Each bar draws what the figure beside it
   * says, so there is nothing for a sentence to undo.
   */
  const hectares = [800473.32, 748863.72, 714701.7, 680273.64];
  const scale = Math.max(...hectares);
  for (const locale of ["en", "fr"]) {
    const html = await (await render(`/${locale}`)).text();
    const rows = [...html.matchAll(/<li class="province-list-row"[^>]*>([\s\S]*?)<\/li>/g)].map((match) => match[1]);
    assert.equal(rows.length, 4);
    assert.ok(html.indexOf('class="coverage-statement"') < html.indexOf('class="province-list-row"'));
    assert.ok(html.indexOf('class="evidence-marks"') < html.indexOf('class="province-list-row"'));

    // Whole hectares on the headline. Two decimal places on a satellite-derived
    // floor claim centimetres no source can back.
    const whole = new Intl.NumberFormat(`${locale}-CA`, { maximumFractionDigits: 0 });
    // The unit is its own span now, so the figure and the word can share a
    // baseline at different sizes. What the element renders is unchanged and is
    // what this still asserts: the markup between the words is removed, and no
    // whitespace is collapsed, because the French group separator is itself a
    // space character and collapsing it would compare a different string.
    const values = rows.flatMap((row) =>
      [...row.matchAll(/<p class="province-list-figure">([\s\S]*?)<\/p>/g)].map((match) =>
        match[1].replace(/<[^>]+>/g, "").trim(),
      ),
    );
    assert.deepEqual(values, hectares.map((value) => `${whole.format(value)} ha`));

    // One bar per row, and the scale is detected loss. The unmapped hectares
    // are deliberately not in this maximum: they never share the scale again.
    const widths = rows.flatMap((row) => [...row.matchAll(/class="province-list-fill" style="width:([\d.]+)%"/g)].map((match) => Number(match[1])));
    assert.equal(widths.length, 4);
    widths.forEach((width, index) => assert.ok(Math.abs(width - (hectares[index] / scale) * 100) < 1e-9));
    assert.equal(Math.max(...widths), 100);

    // The unmapped measure is a measure, not a second bar on this one. Its
    // own bar reaches the page only once the reader asks for it.
    assert.doesNotMatch(html, /province-list-gap/);
    assert.doesNotMatch(html, /hectare scale|échelle en hectares/);

    // The exact value stays at the foot of the row, which is what makes the
    // rounded headline cost nothing.
    const exact = new Intl.NumberFormat(`${locale}-CA`, { maximumFractionDigits: 2 });
    const unit = locale === "en" ? "ha recorded" : "ha consignés";
    const recorded = rows.flatMap((row) => [...row.matchAll(/class="province-list-foot"><span>([^<]+)</g)].map((match) => match[1]));
    assert.deepEqual(recorded, hectares.map((value) => `${exact.format(value)} ${unit}`));

    for (const row of rows) {
      // The span rides on the figure now, not on a masthead badge that claimed
      // 1984 to 2022 over figures covering three years.
      assert.match(row, /class="province-list-span">\d{4}\u2013\d{4}</u);
      assert.match(row, /of the forest the source mapped|de la forêt cartographiée par la source/);
      assert.match(row, /<strong>[^<]*%<\/strong>/);
      assert.match(row, /never counted as zero|jamais comptée comme zéro/);
      assert.match(row, /href="\/en\/data"|href="\/fr\/donnees"/);
    }
    // British Columbia leads the loss ranking and carries the qualifier that
    // stops its gap reading as unmeasured forest. It rides on this measure
    // too, because a claim behind a control is a claim most readers never see.
    assert.match(rows[0], /&lt;0[.,]01/);
    assert.match(rows[0], /GeoBC/);
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
  assert.match(english, /An estimate of merchantable timber/);
  assert.match(french, /Qu’est-il arrivé à la forêt ici\?/);
  assert.match(french, /Une estimation du bois marchand/);
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

// The synthetic uptime probe decides a route is healthy when the response body contains a
// marker string recorded in data/observability-deployment.json. Nothing tied that string to
// the page it quotes, so a copy edit turned the probe red six hours later against a site that
// was serving exactly what this repository asked it to serve. Rendering the same routes here
// moves that failure to the commit that changes the copy.
test("every synthetic uptime route still renders the marker the probe looks for", async () => {
  const record = JSON.parse(
    readFileSync(new URL("../data/observability-deployment.json", import.meta.url), "utf8"),
  );
  const routes = record.syntheticUptime.routes;
  assert.ok(Array.isArray(routes) && routes.length > 0, "the record must name at least one route");

  for (const route of routes) {
    const response = await render(route.path);
    assert.equal(
      response.status,
      route.expectedStatus,
      `${route.path} rendered ${response.status}, but the probe expects ${route.expectedStatus}`,
    );
    const html = await response.text();
    // The probe uses a plain substring test, so this one has to as well: a regex here would
    // accept markers the probe rejects.
    assert.ok(
      html.includes(route.contentMarker),
      `${route.path} no longer contains the recorded marker ${JSON.stringify(route.contentMarker)}. ` +
        "Update data/observability-deployment.json in the same commit as the copy change.",
    );
  }
});
