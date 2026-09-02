import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ShapeMeasureClient }
// @ts-expect-error Node test runner needs extensions.
from "../components/explore/ShapeMeasureClient.tsx";

const rendered = (locale: "en" | "fr") => renderToStaticMarkup(<ShapeMeasureClient locale={locale} />);

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
    assert.ok(button[1].replace(/<[^>]*>/g, "").trim().length > 0, "a button has no text");
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
      markup.includes(locale === "en" ? "Optional." : "Facultatif."),
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
  assert.equal(live[1].replace(/<[^>]*>/g, "").trim(), "", "the status region invents an announcement");
  assert.match(markup, /class="shape-draw-live" role="status"/);
});
