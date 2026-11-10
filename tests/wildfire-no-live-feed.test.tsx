import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WildfireView }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../components/wildfire/WildfireView.tsx";

/*
 * The wildfire page keeps the five fields Phase 5 requires (pinned in
 * tests/wildfire-routes.test.tsx, whose digest is gate evidence). This test
 * holds the heading above them to what is true: no feed is connected, so
 * nothing on the page reads as a feed that is running (audit 2026-11-10, K2).
 */
test("the wildfire status panel says there is no live feed, in both languages", () => {
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(<WildfireView locale={locale} />);
    const start = markup.indexOf('aria-labelledby="wildfire-status-heading"');
    const panel = markup.slice(start, markup.indexOf("</section>", start));
    assert.doesNotMatch(markup, /Live feed status|État du flux en direct/);
    assert.match(panel, locale === "en"
      ? /<h2 id="wildfire-status-heading">This page has no live feed<\/h2>/
      : /<h2 id="wildfire-status-heading">Cette page n’a pas de flux en direct<\/h2>/);
    assert.match(panel, locale === "en"
      ? /They are empty because no feed is connected\./
      : /Elles sont vides, car aucun flux n’est connecté\./);
    // The five gate fields are still inside the panel.
    assert.equal((panel.match(/<dt>/g) ?? []).length, 5);
  }
});
