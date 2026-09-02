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
