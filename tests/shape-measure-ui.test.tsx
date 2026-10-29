import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ShapeMeasureClient }
// @ts-expect-error Node test runner needs extensions.
from "../components/explore/ShapeMeasureClient.tsx";

const rendered = (locale: "en" | "fr") => renderToStaticMarkup(<ShapeMeasureClient locale={locale} />);

/**
 * Whether a fragment of rendered markup holds a text node that is not only
 * whitespace. It asks the question the assertions actually have, rather than
 * stripping tags first, which would be a sanitizer neither of them wants.
 */
const hasTextNode = (fragment: string) => /(?:^|>)[^<>]*[^\s<>]/.test(fragment);

test("the control renders in both locales with a named field for every input", () => {
  for (const locale of ["en", "fr"] as const) {
    const markup = rendered(locale);
    const ids = new Set([...markup.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((match) => match[1]));
    const inputs = [...markup.matchAll(/<(?:input|select)\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(inputs.length >= 7, `only ${inputs.length} controls rendered`);
    for (const id of inputs) {
      assert.ok(ids.has(id), `${locale}: the control ${id} has no label`);
    }
  }
});

test("the keyboard path is the only path on the server, and it is complete", () => {
  const markup = rendered("en");
  // Rectangle edges, the two year selects, and the shape choice are all real
  // form controls, so the whole measurement can be made without a pointer.
  for (const label of ["North edge", "South edge", "West edge", "East edge", "From", "To", "Rectangle", "Polygon"]) {
    assert.ok(markup.includes(label), `the ${label} control is missing`);
  }
  assert.match(markup, /<fieldset/);
  assert.match(markup, /<legend/);
  assert.match(markup, /aria-live="polite"/);
  // Every button says what it does rather than relying on an icon.
  for (const button of markup.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
    assert.ok(hasTextNode(button[1]), "a button has no text");
    assert.match(button[0], /\btype="(?:submit|button)"/);
  }
});

test("nothing about the shape is placed in a link or a form action", () => {
  for (const locale of ["en", "fr"] as const) {
    const markup = rendered(locale);
    assert.doesNotMatch(markup, /<form[^>]*\baction=/, "the form navigates with the shape in the query");
    assert.doesNotMatch(markup, /<a\b[^>]*\bhref="[^"]*(?:latitude|longitude|points=)/);
    assert.doesNotMatch(markup, /method="get"/i);
  }
});

test("no result is shown before one is measured, and no zero stands in for one", () => {
  for (const locale of ["en", "fr"] as const) {
    const markup = rendered(locale);
    assert.doesNotMatch(markup, />\s*0\s*</, "a zero is rendered before anything was measured");
    assert.doesNotMatch(markup, /\bha\b/, "an amount is shown before anything was measured");
  }
});

test("the drawing surface is an addition to the fields, never a replacement for them", () => {
  for (const locale of ["en", "fr"] as const) {
    const markup = rendered(locale);
    // The map renders its container on the server, but it draws nothing until
    // the browser loads MapLibre. What matters here is that the reader who
    // never gets that far still has every control needed to make a
    // measurement, and is told the map is optional.
    assert.match(markup, /class="shape-draw"/, `${locale}: the drawing surface is missing`);
    assert.match(markup, /class="shape-draw-canvas"[^>]*role="img"[^>]*aria-label="[^"]+"/);
    assert.match(markup, /<figcaption/, `${locale}: the map does not say what it is for`);
    assert.ok(
      markup.includes(locale === "en" ? "Optional:" : "Facultatif\u202F:"),
      `${locale}: the map is not declared optional`,
    );
    for (const label of locale === "en" ? ["North edge", "From", "To"] : ["Limite nord", "De", "À"]) {
      assert.ok(markup.includes(label), `${locale}: ${label} disappeared when the map was added`);
    }
  }
});

test("the drawing surface adds no second way to send a shape anywhere", () => {
  const markup = rendered("en");
  // One form, one request. A pointer surface that could post on its own would
  // be a second path with none of the refusals the form's path carries.
  assert.equal(markup.match(/<form\b/g)?.length, 1, "there is more than one form");
  assert.equal(markup.match(/\baction=/g), null, "a form or control names an action");
  assert.equal(markup.match(/<a\b/g), null, "the control renders a link");
  for (const button of markup.matchAll(/<button\b[^>]*>/g)) {
    assert.match(button[0], /\btype="(?:submit|button)"/, "a button has no explicit type");
  }
  // Exactly one submit: the measurement. Everything the map adds is type=button.
  assert.equal(markup.match(/type="submit"/g)?.length, 1, "the map added a second submit");
});

test("the map's own status region starts empty rather than claiming a corner", () => {
  const markup = rendered("en");
  const live = markup.match(/<p class="shape-draw-live"[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(live, "the drawing surface has no status region");
  assert.ok(!hasTextNode(live[1]), "the status region invents an announcement");
  assert.match(markup, /class="shape-draw-live" role="status"/);
});

// @ts-expect-error Node test runner needs extensions.
import { ShapeMeasurementResult } from "../components/explore/ShapeMeasureClient.tsx";
// @ts-expect-error Node test runner needs extensions.
import { DrawPage } from "../components/explore/DrawPage.tsx";

test("draw has its own coverage-first page and keeps unavailable measurement explicit", () => {
  for (const locale of ["en", "fr"] as const) {
    const enabled = renderToStaticMarkup(<DrawPage locale={locale} available />);
    const unavailable = renderToStaticMarkup(<DrawPage locale={locale} available={false} />);
    // The caveat is a closed note under the title, still ahead of the form.
    assert.ok(enabled.indexOf('class="coverage-note"') > 0 && enabled.indexOf('class="coverage-note"') < enabled.indexOf('<form'));
    assert.doesNotMatch(enabled, /class="evidence-legend"/);
    assert.match(unavailable, /role="status">– /);
    assert.doesNotMatch(unavailable, /<form|class="shape-readout"/);
  }
});

test("draw results put both missing coverage states before all three bounded amounts", () => {
  const measurement = {
    startYear: 2000, endYear: 2022,
    unionHectares: { low: 10, estimate: 15, high: 20 },
    forestHectares: { low: 100, estimate: 150, high: 200 },
    sumHectares: { low: 30, estimate: 45, high: 60 },
    unionShareOfForest: null,
    coverage: { blocks: 10, interiorBlocks: 6, edgeBlocks: 4, blocksWithoutData: 2, shapeHectares: 1000, outsideGridHectares: 25, edgeShareOfEstimate: 0.2 },
    precision: { blockMetres: 960, exact: false },
  };
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(<ShapeMeasurementResult locale={locale} measurement={measurement} />);
    const figures = markup.indexOf('class="shape-readout"');
    for (const label of locale === "en" ? ["Blocks without data", "Outside the mapped area"] : ["Carrés sans données", "Hors de la zone cartographiée"]) {
      assert.ok(markup.indexOf(label) >= 0 && markup.indexOf(label) < figures);
    }
    assert.equal((markup.match(/class="shape-range"/g) ?? []).length, 3);
    for (const range of locale === "en" ? ["between 10 and 20", "between 100 and 200", "between 30 and 60"] : ["entre 10 et 20", "entre 100 et 200", "entre 30 et 60"]) assert.ok(markup.includes(range));
    assert.match(markup, /– No forest denominator|– Aucun dénominateur forestier/);
    assert.match(markup, /2 of the squares|2 des carrés/);
    assert.match(markup, /25 ha/);
  }
});

// @ts-expect-error Node test runner needs extensions.
import { CircleDistricts } from "../components/explore/ShapeCircle.tsx";
// @ts-expect-error Node test runner needs extensions.
import { HomeSearch } from "../components/site/HomeSearch.tsx";

const circleOpened = { centre: null, radiusKm: 10 as const };

test("the Draw page offers a circle beside the rectangle and polygon in both locales", () => {
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(<DrawPage locale={locale} available />);
    for (const label of locale === "en" ? ["Rectangle", "Polygon", "Circle"] : ["Rectangle", "Polygone", "Cercle"]) {
      assert.match(markup, new RegExp(`<label[^>]*><input[^>]*type="radio"[^>]*/>${label}</label>`), `${locale}: ${label}`);
    }
    // The rectangle is still the default; the circle's own fields wait until it is chosen.
    assert.doesNotMatch(markup, /Centre latitude|Latitude du centre/);
  }
});

test("a circle opened from the home page starts empty at 10 km with its place field and the provider sentence", () => {
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(
      <DrawPage locale={locale} available initialCircle={circleOpened} addressLookup districtLookup />,
    );
    const words = locale === "en"
      ? { circle: "Circle", lat: "Centre latitude", lon: "Centre longitude", radius: "Radius", place: "Address or place", note: "Your search is sent to Google Places, the address service this site uses, to find the point. This site does not keep it." }
      : { circle: "Cercle", lat: "Latitude du centre", lon: "Longitude du centre", radius: "Rayon", place: "Adresse ou lieu", note: "Votre recherche est transmise à Google Places, le service d’adresses utilisé par ce site, pour trouver le point. Ce site ne la conserve pas." };
    for (const label of Object.values(words)) assert.ok(markup.includes(label), `${locale}: ${label} is missing`);
    assert.match(markup, new RegExp(`<input[^>]*checked=""[^>]*/>${words.circle}</label>`), `${locale}: circle not chosen`);
    const radii = [...markup.matchAll(/<input[^>]*type="radio"[^>]*\/>(\d+)(?:\s|\u00a0)km<\/label>/g)];
    assert.deepEqual(radii.map((match) => match[1]), ["5", "10", "25"]);
    assert.match(radii[1][0], /checked=""/, `${locale}: 10 km is not the default`);
    // The centre is empty rather than a default point, and nothing is measured yet.
    assert.doesNotMatch(markup, /class="shape-readout"/);
    assert.doesNotMatch(markup, /\bha\b/);
    // Every control is labelled, and the place field submits its own form, never the measurement.
    const ids = new Set([...markup.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((match) => match[1]));
    for (const match of markup.matchAll(/<(?:input|select)\b[^>]*\bid="([^"]+)"/g)) assert.ok(ids.has(match[1]), `${locale}: ${match[1]} has no label`);
    const finder = markup.match(/<form id="([^"]+)"><\/form>/);
    assert.ok(finder, `${locale}: the place field has no form of its own`);
    assert.match(markup, new RegExp(`<input[^>]*form="${finder[1]}"`));
    assert.match(markup, new RegExp(`<button type="submit" form="${finder[1]}"`));
    assert.doesNotMatch(markup, /\baction=/);
  }
});

test("without an address service the circle still has its centre fields and makes no provider claim", () => {
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(<DrawPage locale={locale} available initialCircle={circleOpened} />);
    assert.ok(markup.includes(locale === "en" ? "Centre latitude" : "Latitude du centre"));
    assert.doesNotMatch(markup, /Google Places/);
    assert.equal(markup.match(/<form\b/g)?.length, 1);
  }
});

test("the circle's districts link out, and a district the index cannot name is stated, never blank or zero", () => {
  const resolved = {
    federal: { kind: "single" as const, districtId: "59001", name: { en: "Abbotsford", fr: "Abbotsford" } },
    provincial: [{ layerId: "bc-2023", lookup: { kind: "single" as const, districtId: "ABM", name: { en: "Abbotsford-Mission", fr: "Abbotsford-Mission" } } }],
    precision: { blockMetres: 960 },
  };
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(
      <CircleDistricts locale={locale} state={{ status: "ready", resolved }} comparableFederalIds={["federal-59001"]} />,
    );
    assert.match(markup, new RegExp(`href="/${locale === "en" ? "en/compare" : "fr/comparer"}\\?left=federal-59001"`));
    assert.match(markup, new RegExp(`href="/${locale === "en" ? "en/explore" : "fr/explorer"}\\?overlays=provincial-ridings"`));
    assert.match(markup, new RegExp(`href="/${locale === "en" ? "en/explore" : "fr/explorer"}\\?overlays=economic-regions"`));
    assert.match(markup, locale === "en" ? /Economic region<\/dt><dd>– / : /Région économique<\/dt><dd>– /);
    assert.doesNotMatch(markup, />\s*0\s*</);
    const outside = renderToStaticMarkup(<CircleDistricts locale={locale} state={{ status: "outside" }} comparableFederalIds={[]} />);
    assert.match(outside, /<p>– /);
  }
  // A riding the Compare page cannot show is sent to Explore instead.
  const uncompared = renderToStaticMarkup(
    <CircleDistricts locale="en" state={{ status: "ready", resolved }} comparableFederalIds={[]} />,
  );
  assert.doesNotMatch(uncompared, /\/en\/compare/);
  assert.match(uncompared, /href="\/en\/explore\?overlays=federal-ridings"/);
});

test("the home page asks what happened within 10 km and opens the circle without any address", () => {
  const english = renderToStaticMarkup(<HomeSearch locale="en" />);
  const french = renderToStaticMarkup(<HomeSearch locale="fr" />);
  assert.match(english, /<a href="\/en\/explore\/draw\?shape=circle">What happened within 10 km of me\?<\/a>/);
  assert.match(french, /<a href="\/fr\/explorer\/dessiner\?shape=circle">Qu’est-il arrivé dans un rayon de 10\u00a0km autour de moi\u202F\?<\/a>/);
});
