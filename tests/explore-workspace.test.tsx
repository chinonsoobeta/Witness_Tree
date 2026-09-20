import assert from "node:assert/strict";
import test from "node:test";
import type { Context, ReactElement } from "react";
import { renderToStaticMarkup as renderElement } from "react-dom/server";
import type { AppRouterInstance } from "vinext/shims/internal/app-router-context";
import { AppRouterContext } from "vinext/shims/internal/app-router-context";
// @ts-expect-error Node test runner needs extensions.
import { ExploreView } from "../components/explore/ExploreView.tsx";
// @ts-expect-error Node test runner needs extensions.
import { exploreFixtures } from "../lib/explore/fixtures.ts";

/*
 * Explore holds a client island that reads the app router, which the framework
 * mounts around every real render and this bare harness does not. The stub is
 * the missing mount, not a stand-in for behaviour: nothing here navigates, so
 * the methods only have to exist.
 */
const stubRouter = Object.fromEntries(
  ["push", "replace", "back", "forward", "refresh", "prefetch"].map((method) => [method, () => {}]),
) as unknown as AppRouterInstance;
if (!AppRouterContext) throw new Error("vinext no longer exports AppRouterContext");
const RouterContext: Context<AppRouterInstance | null> = AppRouterContext;

function renderToStaticMarkup(element: ReactElement): string {
  return renderElement(<RouterContext.Provider value={stubRouter}>{element}</RouterContext.Provider>);
}

/*
 * Explore's three columns are a placement, not a reordering.
 *
 * The workspace puts the controls left, the map centre and the figures right
 * through named grid areas, so the document keeps the order a screen reader
 * takes: explain, choose, map, figures, layers. tests/explore.test.tsx already
 * pins that order and is checksum-bound evidence in two phase records, so these
 * assertions live in their own file: the layout has to be free to be tested
 * without moving a digest that describes something else.
 */
test("the explore workspace holds the rail, the map and the reading panel", () => {
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(
      <ExploreView events={exploreFixtures} locale={locale} year={1990} />,
    );
    assert.match(markup, /class="explore-workspace"/);
    // Every column is a direct child of the workspace, because a grid area
    // cannot place a box that is nested inside another one.
    const workspace = markup.slice(markup.indexOf('class="explore-workspace"'));
    for (const marker of ["explore-modes", "explore-window", "explore-canvas", "explore-reading", "explore-overlays"]) {
      assert.match(workspace, new RegExp(`class="[^"]*${marker}[^"]*"`), `${marker} missing in ${locale}`);
    }
    // The reading panel is a sibling of the map section, not a child of it.
    assert.ok(markup.indexOf('class="explore-section explore-canvas"') < markup.indexOf("explore-reading"));
    assert.ok(markup.indexOf("explore-reading") < markup.indexOf('id="explore-layers-heading"'));
    // The panel is named, so it is reachable as a landmark rather than an
    // unlabelled aside the reader has to guess the purpose of.
    assert.match(markup, /aria-labelledby="explore-annual-heading"/);
    assert.match(markup, /id="explore-annual-heading"/);
  }
});

test("the reading panel's bar is a composition of the interval, in record-type hues", () => {
  const markup = renderToStaticMarkup(
    <ExploreView events={exploreFixtures} locale="en" year={2022} />,
  );
  // [\s\S] rather than the `s` flag: the repo targets es2017, where that flag is a type error.
  const bar = markup.match(/<span class="explore-annual-bar"[^>]*>([\s\S]*?)<\/span><dl>/);
  assert.ok(bar, "the reading panel renders a composition bar for a real interval");
  const widths = [...bar[1].matchAll(/width:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
  assert.equal(widths.length, 3, "harvest, fire and the unattributed rest");
  // Recorded harvest and recorded fire are exclusive on a cell and the rest is
  // unattributed, so the three segments are the whole interval and nothing else.
  assert.ok(Math.abs(widths.reduce((sum, w) => sum + w, 0) - 100) < 1e-6);
  assert.match(bar[1], /explore-annual-part--harvest/);
  assert.match(bar[1], /explore-annual-part--fire/);
  assert.match(bar[1], /explore-annual-part--neither/);
  // The bar is decorative: the same three figures are read from the list.
  assert.match(markup, /<span class="explore-annual-bar" aria-hidden="true">/);
});
