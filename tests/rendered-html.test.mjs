import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test, { before, after } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

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

let origin;
let server;
before(async () => {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, COARSE_GRID_BASE: "", DISTRICT_INDEX_BASE: "" } });
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(output);
    try { if ((await fetch(origin)).ok) return; } catch { /* The server may still be starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Next.js did not start: ${output}`);
});
after(async () => {
  if (server && server.exitCode === null) {
    server.kill();
    await once(server, "exit");
  }
});

async function render(pathname) {
  return fetch(`${origin}${pathname}`, { headers: { accept: "text/html" } });
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
  const hectares = [18028529.19, 10823352.93, 9280647.27, 6842768.76];
  const scale = Math.max(...hectares);
  for (const locale of ["en", "fr"]) {
    const html = await (await render(`/${locale}`)).text();
    const rows = [...html.matchAll(/<li class="province-list-row"[^>]*>([\s\S]*?)<\/li>/g)].map((match) => match[1]);
    assert.equal(rows.length, 4);
    // The headline states its own minimum, so the home page carries no separate caveat note.
    assert.doesNotMatch(html, /class="coverage-(note|statement)"/);
    assert.ok(html.indexOf('class="evidence-marks"') < html.indexOf('class="province-list-row"'));

    // Whole hectares on the headline. Two decimal places on a satellite-derived
    // floor claim centimetres no source can back.
    const whole = new Intl.NumberFormat(`${locale}-CA`, { maximumFractionDigits: 0 });
    // The unit is its own span now, so the figure and the word can share a
    // baseline at different sizes. What the element renders is unchanged, and
    // that is what this still asserts.
    //
    // The two spans are named rather than stripped with a tag regex. Naming
    // them pins the structure as well as the text, and the separator is a
    // literal space in the pattern rather than a whitespace class, because the
    // French group separator is itself a space character: a pattern loose
    // enough to skip over it would be comparing a different string.
    const figure = /<p class="province-list-figure"><span class="province-list-value">([^<]*)<\/span> <span class="province-list-unit">([^<]*)<\/span><\/p>/g;
    const values = rows.flatMap((row) =>
      [...row.matchAll(figure)].map(([, value, unit]) => `${value} ${unit}`),
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
    const unit = locale === "en" ? "ha detected" : "ha détectés";
    const recorded = rows.flatMap((row) => [...row.matchAll(/class="province-list-foot"><span>([^<]+)</g)].map((match) => match[1]));
    assert.deepEqual(recorded, hectares.map((value) => `${exact.format(value)} ${unit}`));

    for (const row of rows) {
      // The span rides on the figure now, not on a masthead badge that claimed
      // 1984 to 2022 over figures covering three years.
      assert.match(row, /class="province-list-span">\d{4}\u2013\d{4}</u);
      assert.match(row, /of the forest mapped in 1984|de la forêt cartographiée en 1984/);
      assert.match(row, /<strong>[^<]*%<\/strong>/);
      assert.match(row, /counts as unknown, not zero|compte comme inconnue, pas comme nulle/);
      // The unknown-area reason links to the Methods section that explains it.
      assert.match(row, /href="\/en\/methods#coverage-gap"|href="\/fr\/methodes#coverage-gap"/);
      assert.match(row, /href="\/en\/data"|href="\/fr\/donnees"/);
    }
    // British Columbia leads the loss ranking and carries the qualifier that
    // stops its gap reading as unmeasured forest. It rides on this measure
    // too, because a claim behind a control is a claim most readers never see.
    const bcRow = rows.find((row) => /British Columbia|Colombie-Britannique/.test(row));
    assert.ok(bcRow);
    assert.match(bcRow, /&lt;0[.,]01/);
    assert.match(bcRow, /shoreline|littoral/);
  }
});

test("emits application security headers with the map delivery allowances", async () => {
  const response = await render("/en");
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)");

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

test("Explore sends its map legend and the tile connection in the first HTML", async () => {
  for (const [pathname, heading] of [["/en/explore", "Detected forest loss, 2021–2022"], ["/fr/explorer", "Perte forestière détectée, 2021–2022"]]) {
    const html = await (await render(pathname)).text();
    const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? "";
    // Opened while the page loads, so the first archive range does not wait for a handshake.
    for (const origin of browserFetchedOrigins()) assert.match(head, new RegExp(`<link rel="preconnect" href="${origin.replaceAll(".", "\\.")}" crossorigin="anonymous"/>`));
    // The key is server-rendered beside the loading map, not added when the tiles arrive.
    assert.match(html, /<div class="explore-map"[^>]*data-state="loading"/);
    assert.match(html, /class="explore-map-layer-panel"/);
    assert.ok(html.includes(heading), `${pathname} omits its legend heading`);
  }
});

/*
 * The 2026-10-28 adversarial audit's Explore items, as the server sends them:
 * the rankings link names the span it ranks (B3), Play names where it starts
 * and carries no pressed state beside a changing name (B4, B6), the map's
 * status sits in the notice box that turns into the still-map notice (UX 3),
 * and the one-line readout precedes the map while the controls still precede
 * the map in the document (UX 1).
 */
test("Explore serves its span-honest rankings link, Play name, map notice and phone readout", async () => {
  const cases = [
    ["/en/explore", "Ridings with the largest share of forest lost over the whole record, 1984–2022, not the years you chose (2021–2022)", 'aria-label="Play year by year from 1984">Play<', "2021–2022 · 1,352,468.43 ha detected as lost, a minimum"],
    ["/fr/explorer", "Circonscriptions ayant perdu la plus grande part de leur forêt sur l’ensemble du registre, 1984–2022, et non pendant les années choisies (2021–2022)", 'aria-label="Lecture année par année depuis 1984">Lecture<', "2021–2022 · "],
    ["/en/explore?from=1990&year=2000", "not the years you chose (1990–2000)", 'aria-label="Play year by year from 1990">Play<', "1990–2000 · "],
    ["/en/explore?from=1984&year=2022", "Ridings with the largest share of forest lost, 1984–2022<", 'aria-label="Play year by year from 1984">Play<', "1984–2022 · "],
  ];
  for (const [pathname, ranking, play, readout] of cases) {
    const html = (await (await render(pathname)).text()).replaceAll("&#x27;", "'");
    assert.ok(html.includes(ranking), `${pathname}: rankings link`);
    assert.ok(html.includes(play), `${pathname}: play name`);
    assert.doesNotMatch(html, /class="year-play"[^>]*aria-pressed/);
    assert.match(html, /<div class="explore-map-notice"><p id="explore-map-status"/);
    const line = /<p class="explore-map-readout">([^<]*)<\/p>/.exec(html)?.[1] ?? "";
    assert.ok(line.startsWith(readout), `${pathname}: readout ${line}`);
    const toolbar = html.indexOf('class="explore-toolbar"');
    const readoutAt = html.indexOf('class="explore-map-readout"');
    const map = html.indexOf('<div class="explore-map"');
    const reading = html.indexOf('class="explore-annual explore-reading"');
    assert.ok(toolbar > 0 && toolbar < readoutAt && readoutAt < map && map < reading, `${pathname}: document order`);
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
  assert.match(english, /How much sellable timber there is/);
  assert.match(french, /Qu’est-il arrivé à la forêt ici\u202F\?/);
  assert.match(french, /La quantité de bois vendable/);
  assert.doesNotMatch(`${english}\n${french}`, /the truth|real-time|complete record/i);
});

test("renders the Unknown Atlas in both languages with its four sections", async () => {
  const [englishResponse, frenchResponse] = await Promise.all([render("/en/unknown"), render("/fr/inconnu")]);
  assert.equal(englishResponse.status, 200);
  assert.equal(frenchResponse.status, 200);
  const [english, french] = await Promise.all([englishResponse.text(), frenchResponse.text()]);
  assert.match(english, /<html lang="en">/);
  assert.match(french, /<html lang="fr">/);
  assert.match(english, /<h1>What the record cannot see<\/h1>/);
  assert.match(french, /<h1>Ce que le registre ne peut pas voir<\/h1>/);
  assert.match(english, /<link rel="alternate" hrefLang="fr" href="[^"]*\/fr\/inconnu"/i);
  for (const html of [english, french]) {
    assert.match(html, /<main id="main"/);
    for (const id of ["no-data", "withheld", "blocked-sources", "settle"]) assert.match(html, new RegExp(`<section[^>]*id="${id}"`));
    assert.equal((html.match(/<table>/g) ?? []).length, (html.match(/<caption/g) ?? []).length);
    assert.doesNotMatch(html, /@[a-z0-9-]+\.[a-z]{2,}/i);
    assert.doesNotMatch(html, /\bFOI\b|freedom of information|accès à l’information/i);
  }
  assert.match(english, /Missing data never means no loss\./);
  assert.match(french, /Des données manquantes ne signifient jamais une absence de perte\./);
});

test("renders localized place and location records with semantic content and provenance", async () => {
  const [englishPlace, frenchPlace, englishLocation, frenchLocation] = await Promise.all([
    render("/en/components/example-places/bc-province?view=table").then((response) => response.text()),
    render("/fr/composants/exemples-lieux/bc-province?view=table").then((response) => response.text()),
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
  assert.match(frenchPlace, /illustrative en Colombie-Britannique/);
  assert.match(frenchPlace, /<table/);
  assert.match(frenchPlace, /Entrées illustratives du registre des sources/);
  assert.match(englishLocation, /Coordinates and accuracy/);
  assert.match(englishLocation, /Provenance/);
  assert.match(frenchLocation, /Coordonnées et précision/);
  assert.match(frenchLocation, /Provenance/);
});

test("renders a real community page in each language from its checked-in record", async () => {
  const [englishResponse, frenchResponse, missing] = await Promise.all([
    render("/en/places/1984-2022-v1/csd-2021/5924034"),
    render("/fr/lieux/1984-2022-v1/csd-2021/5924034"),
    render("/en/places/1984-2022-v1/csd-2021/0000000"),
  ]);
  assert.equal(englishResponse.status, 200);
  assert.equal(frenchResponse.status, 200);
  assert.equal(missing.status, 404);
  const [english, french] = await Promise.all([englishResponse.text(), frenchResponse.text()]);
  for (const html of [english, french]) {
    assert.match(html, /<main\b[^>]*id="main"/);
    assert.match(html, /<h1[^>]*>Campbell River<\/h1>/);
    assert.match(html, /4,518\.63 ha|4[\u00a0\u202f]518,63 ha/);
    assert.match(html, /1984-2022-v1/);
    assert.match(html, /dataset\/2785c103-9c2d-429b-9f3d-89f5cd9ea94d/);
    assert.doesNotMatch(html, /noindex/);
    assert.match(html, /hrefLang="en" href="https:\/\/www\.witnesstree\.ca\/en\/places\/1984-2022-v1\/csd-2021\/5924034"|hreflang="en" href="https:\/\/www\.witnesstree\.ca\/en\/places\/1984-2022-v1\/csd-2021\/5924034"/);
  }
  assert.match(english, /<html lang="en">/);
  assert.match(english, /Satellite observation/);
  assert.match(english, /Annual High-resolution forest land cover/);
  assert.match(french, /Couverture forestière annuelle à haute résolution/);
  assert.match(english, /Vancouver Island and Coast/);
  assert.match(english, /href="\/en\/places\/1984-2022-v1\/er-2021\/\d{4}"/);
  assert.match(english, /href="\/en\/places\/1984-2022-v1\/federal-2023\/\d{5}"/);
  assert.match(french, /<html lang="fr">/);
  assert.match(french, /Observation satellitaire/);
  assert.match(french, /href="\/fr\/lieux\/1984-2022-v1\/er-2021\/\d{4}"/);
});

test("a federal and a provincial riding each serve a one-page print sheet in both languages, and a community does not", async () => {
  const sheets = [
    { pathname: "/en/places/1984-2022-v1/federal-2023/24002/print", lang: "en", button: "Print or save as PDF", measure: "Detected loss as a share of mapped forest" },
    { pathname: "/fr/lieux/1984-2022-v1/federal-2023/24002/print", lang: "fr", button: "Imprimer ou enregistrer en PDF", measure: "Perte détectée en part de la forêt cartographiée" },
    { pathname: "/en/places/1984-2022-v1/bc-2023/258/print", lang: "en", button: "Print or save as PDF", measure: "Detected loss as a share of mapped forest" },
    { pathname: "/fr/lieux/1984-2022-v1/bc-2023/258/print", lang: "fr", button: "Imprimer ou enregistrer en PDF", measure: "Perte détectée en part de la forêt cartographiée" },
  ];
  for (const { pathname, lang, button, measure } of sheets) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    const html = await response.text();
    const page = pathname.slice(0, -"/print".length);
    assert.match(html, new RegExp(`<html lang="${lang}">`), pathname);
    assert.match(html, /<main\b[^>]*id="main"/, pathname);
    assert.match(html, /<h1>[^<]+<\/h1>/, pathname);
    assert.match(html, new RegExp(`<button type="button" class="btn btn--primary">${button}</button>`), pathname);
    assert.match(html, /<meta name="robots" content="noindex, follow"/, pathname);
    assert.match(html, new RegExp(measure), pathname);
    assert.match(html, /<svg[^>]*class="hf-chart-svg"[^>]*role="img"/, pathname);
    assert.match(html, /dataset\/2785c103-9c2d-429b-9f3d-89f5cd9ea94d/, pathname);
    // The page address prints in plain text, and the back link goes to the riding's page.
    assert.match(html, new RegExp(`https://www\\.witnesstree\\.ca${pathname.replace(/[/.-]/g, "\\$&")}`), pathname);
    assert.match(html, new RegExp(`<a href="${page.replace(/[/.-]/g, "\\$&")}">`), pathname);
    // No navigation shell, ranking position or colour scale on the sheet.
    assert.doesNotMatch(html, /class="site-shell"/, pathname);
    assert.doesNotMatch(html, /\b(rank|ranked|classement|rang)\b/i, pathname);
  }
  assert.match(await (await render("/en/places/1984-2022-v1/federal-2023/24002/print")).text(), /<h1>Abitibi—Témiscamingue<\/h1>/);
  assert.equal((await render("/en/places/1984-2022-v1/csd-2021/5924034/print")).status, 404);
  assert.equal((await render("/fr/lieux/1984-2022-v1/er-2021/5910/print")).status, 404);
  assert.equal((await render("/en/places/1984-2022-v1/federal-2023/00000/print")).status, 404);
});

test("a place page's social image and download are its own share card, a 1200 by 630 PNG", async () => {
  const pages = [
    { pathname: "/en/places/1984-2022-v1/csd-2021/5924034", alt: /Share card for this place/ },
    { pathname: "/fr/lieux/1984-2022-v1/csd-2021/5924034", alt: /Carte de partage de ce lieu/ },
  ];
  for (const { pathname, alt } of pages) {
    const html = await (await render(pathname)).text();
    const card = `${pathname}/opengraph-image`;
    // Every regular-expression metacharacter, so the path reads literally.
    const escaped = card.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
    // Next appends a content hash to the generated image's address.
    assert.match(html, new RegExp(`<meta property="og:image" content="https://www\\.witnesstree\\.ca${escaped}(\\?[0-9a-z]+)?"`), `${pathname} og:image`);
    assert.match(html, /<meta property="og:image:width" content="1200"/);
    assert.match(html, /<meta property="og:image:height" content="630"/);
    assert.match(html.match(/<meta property="og:image:alt" content="([^"]*)"/)?.[1] ?? "", alt);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
    assert.match(html, new RegExp(`<meta name="twitter:image" content="https://www\\.witnesstree\\.ca${escaped}"`), `${pathname} twitter:image`);
    assert.match(html, new RegExp(`<a href="${escaped}" download="1984-2022-v1-csd-2021-5924034-(en|fr)\\.png"`), `${pathname} download link`);
    assert.match(html, /<span role="status" class="place-share-status"><\/span>/);

    const response = await fetch(`${origin}${card}`);
    assert.equal(response.status, 200, card);
    assert.equal(response.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(1, 4).toString("latin1"), "PNG");
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [1200, 630]);
  }
  assert.equal((await fetch(`${origin}/en/places/1984-2022-v1/csd-2021/0000000/opengraph-image`)).status, 404);
});

test("renders localized search results and the Explore table without browser JavaScript, including from an old List address", async () => {
  const [englishSearch, frenchSearch, englishExplore, frenchExplore, englishFixtures, frenchFixtures] = await Promise.all([
    render("/en/search?q=British%20Columbia").then((response) => response.text()),
    render("/fr/recherche?q=Colombie-Britannique").then((response) => response.text()),
    render("/en/explore?mode=wildfire&presentation=list&data=table&year=2020").then((response) => response.text()),
    render("/fr/explorer?mode=wildfire&presentation=list&data=table&year=2020").then((response) => response.text()),
    render("/en/explore?mode=condition-recovery&presentation=list&data=table&year=1988").then((response) => response.text()),
    render("/fr/explorer?mode=condition-recovery&presentation=list&data=table&year=1988").then((response) => response.text()),
  ]);

  assert.match(englishSearch, /<main\b[^>]*id="main"/);
  assert.match(englishSearch, /<h2>Places<\/h2>/);
  assert.match(englishSearch, /Search provinces, ridings and communities\. Figures cover 1984 to 2022\./);
  assert.match(englishSearch, /British Columbia/);
  assert.match(frenchSearch, /<main\b[^>]*id="main"/);
  assert.match(frenchSearch, /<h2>Lieux<\/h2>/);
  assert.match(frenchSearch, /Recherchez une province, une circonscription ou une collectivité\. Les chiffres couvrent la période de 1984 à 2022\./);
  assert.match(frenchSearch, /Colombie-Britannique/);

  // Wildfire reads the national harvest and fire series, so its table shows
  // real province figures served without browser JavaScript.
  assert.match(englishExplore, /<main\b[^>]*id="main"/);
  assert.match(englishExplore, /Explore forest loss/);
  assert.match(englishExplore, /add up harvest, and separately fire/);
  assert.match(englishExplore, /<th scope="col">Harvest \(ha\)<\/th><th scope="col">Fire \(ha\)<\/th>/);
  assert.match(englishExplore, /href="\/en\/data\/harvest-and-fire\?from=2020&amp;to=2020"/);
  assert.match(englishExplore, /Source attribution/);
  assert.doesNotMatch(englishExplore, /made-up example data/);
  assert.match(frenchExplore, /<main\b[^>]*id="main"/);
  assert.match(frenchExplore, /Explorer les pertes forestières/);
  assert.match(frenchExplore, /<th scope="col">Récolte \(ha\)<\/th><th scope="col">Feu \(ha\)<\/th>/);
  assert.match(frenchExplore, /href="\/fr\/donnees\/recolte-et-incendies\?from=2020&amp;to=2020"/);
  assert.match(frenchExplore, /Attribution de la source/);
  // Condition and recovery shows the owner-admitted five-year figures since
  // 2026-10-03, so it no longer calls itself example data, and it names its source.
  assert.doesNotMatch(englishFixtures, /made-up example data/);
  assert.match(englishFixtures, /treed for at least five years in a row/);
  assert.match(englishFixtures, /Did the trees grow back\?/);
  assert.match(englishFixtures, /<table/);
  assert.match(englishFixtures, /Source attribution/);
  assert.doesNotMatch(frenchFixtures, /données d’exemple inventées/);
  assert.match(frenchFixtures, /boisé pendant au moins cinq années de suite/);
  assert.match(frenchFixtures, /<table/);
  assert.match(frenchFixtures, /Attribution de la source/);
});

test("Compare serves a federal riding beside a provincial one, and an unknown riding as an empty side with a notice", async () => {
  const [mixed, unknown] = await Promise.all([
    render("/en/compare?left=federal-59001&right=provincial-BC-258").then((response) => response.text()),
    render("/fr/comparer?left=inexistante&right=provincial-QC-137").then((response) => response.text()),
  ]);
  assert.match(mixed, /<option value="federal-59001" selected="">/);
  assert.match(mixed, /<option value="provincial-BC-258" selected="">Abbotsford-Mission<\/option>/);
  assert.match(mixed, /Provincial riding · British Columbia/);
  assert.match(mixed, /<h2 id="rankings-BC-heading">Provincial ridings in British Columbia<\/h2>/);
  assert.match(mixed, /53 of British Columbia’s 93 provincial ridings are ranked\./);
  assert.match(mixed, />Show all 280 federal ridings<\/a>/);
  assert.match(unknown, /role="status"/);
  assert.match(unknown, /Côté gauche\u202F: aucune circonscription ne porte l’identifiant «\u00A0inexistante\u00A0»\./);
  assert.match(unknown, /<h2>Aucune circonscription choisie<\/h2>/);
  assert.match(unknown, /<option value="provincial-QC-137" selected="">/);
  assert.doesNotMatch(unknown, /<option value="federal-59001" selected/);
  assert.match(unknown, /<h2 id="rankings-QC-heading">Circonscriptions provinciales du Québec<\/h2>/);
});

// Audit 2026-10-28, B1 and B11: a link with years the page cannot show still
// answers 200, opens at the default span, and says so in the served HTML.
test("Explore and the chart builder name the values they ignore, in both languages", async () => {
  const [englishExplore, frenchExplore, inverted, valid, englishChart, frenchChart, validChart] = await Promise.all([
    render("/en/explore?year=abc"),
    render("/fr/explorer?year=1900"),
    render("/en/explore?from=2010&year=2002"),
    render("/en/explore?from=1990&year=1998"),
    render("/en/data/harvest-and-fire?from=2019&to=2010"),
    render("/fr/donnees/recolte-et-incendies?to=2040&step=7"),
    render("/en/data/harvest-and-fire?from=2000&to=2010"),
  ]);
  for (const response of [englishExplore, frenchExplore, inverted, valid, englishChart, frenchChart, validChart]) {
    assert.equal(response.status, 200);
  }
  const [en, fr, backwards, ok, chartEn, chartFr, chartOk] = await Promise.all(
    [englishExplore, frenchExplore, inverted, valid, englishChart, frenchChart, validChart].map((response) => response.text()),
  );
  assert.match(en, /class="notice query-notice" role="note">The last year in this link, “abc”, is not a four-digit year\. The page shows the default years, 2021–2022, instead\./);
  assert.match(fr, /La dernière année de ce lien, 1900, ne peut pas être utilisée\u202F: une dernière année doit se situer entre 1985 et 2022\. La page affiche donc les années par défaut, 2021–2022\./);
  assert.match(backwards, /The first year in this link, 2010, is not before its last year, 2002\./);
  assert.doesNotMatch(ok, /query-notice/);
  assert.match(chartEn, /The first year in this link, 2019, comes after its last year, 2010\. The chart shows the default years, 1985–2022, instead\./);
  assert.match(chartFr, /La dernière année de ce lien, 2040, ne peut pas être utilisée/);
  assert.match(chartFr, /«\u00A07\u00A0», dans ce lien, n’est pas un regroupement offert par ce graphique/);
  assert.match(chartFr, /L’adresse dans votre navigateur montre toujours le lien d’origine/);
  assert.doesNotMatch(chartOk, /query-notice/);
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


test("Vercel routes preserve the existing API handlers and unavailable services", async () => {
  for (const [path, options, status] of [
    ["/api/search/suggest?locale=en&q=Campbell", {}, 200],
    ["/api/explore/district-spans?from=2020&to=2022", {}, 200],
    ["/api/address/search", { method: "POST", body: "{}" }, 503],
    ["/api/district/resolve", { method: "POST", body: "{}" }, 503],
  ]) {
    const response = await fetch(`${origin}${path}`, options);
    assert.equal(response.status, status, path);
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
  const response = await fetch(`${origin}/en/explore/draw`, {
    headers: { "x-witness-tree-shape": "on" },
  });
  const html = await response.text();
  assert.match(html, /Area measurement is not available/);
});

// A near-miss address used to 404: the other language's slug, or capital letters.
// The proxy now sends each one to its page, permanently and with its query, and
// leaves a real page and a missing one alone. Browsers that ask for the legacy
// icon path get the icon.
test("near-miss addresses redirect to their page and the legacy icon path is served", async () => {
  for (const [path, location] of [
    ["/fr/explore", "/fr/explorer"],
    ["/en/explorer", "/en/explore"],
    ["/EN", "/en"],
    ["/en/Explore", "/en/explore"],
    ["/fr/explore?year=2010&from=1990", "/fr/explorer?year=2010&from=1990"],
  ]) {
    const response = await fetch(`${origin}${path}`, { redirect: "manual" });
    assert.equal(response.status, 308, path);
    const target = new URL(response.headers.get("location"), origin);
    assert.equal(target.origin, origin, path);
    assert.equal(`${target.pathname}${target.search}`, location, path);
  }
  assert.equal((await fetch(`${origin}/fr/explorer`, { redirect: "manual" })).status, 200);
  assert.equal((await fetch(`${origin}/en/not-a-page`, { redirect: "manual" })).status, 404);
  const icon = await fetch(`${origin}/favicon.ico`);
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get("content-type"), /image\/(x-icon|vnd\.microsoft\.icon)/);
});
