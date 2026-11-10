import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Context, ReactElement } from "react";
import { renderToStaticMarkup as renderElement } from "react-dom/server";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  ExploreView,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../components/explore/ExploreView.tsx";
import {
  exploreFixtures,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/explore/fixtures.ts";

/*
 * E1: Play has a pace to choose and a slider for the last year that works while
 * paused and while playing. The same router stub as tests/explore.test.tsx: no
 * assertion here navigates.
 */
const stubRouter = Object.fromEntries(
  ["push", "replace", "back", "forward", "refresh", "prefetch"].map((method) => [method, () => undefined]),
) as unknown as AppRouterInstance;
const RouterContext: Context<AppRouterInstance | null> = AppRouterContext;
const render = (element: ReactElement) => renderElement(<RouterContext.Provider value={stubRouter}>{element}</RouterContext.Provider>);
const source = readFileSync(new URL("../components/explore/ExploreYearControl.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("E1: three paces, Normal is the old pace, and a reader who asks for less motion starts on Slow", () => {
  assert.match(source, /const STEP_MS = 1500;/);
  assert.match(source, /const PLAY_SPEEDS = \{ slow: STEP_MS \* 2, normal: STEP_MS, fast: STEP_MS \/ 2 \} as const;/);
  assert.match(source, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  assert.match(source, /const playSpeed: PlaySpeed = chosenSpeed \?\? \(reducedMotion \? "slow" : "normal"\);/);
  // The timer runs at the chosen pace and restarts when the pace changes.
  assert.match(source, /\}, mapBlocked \? 0 : PLAY_SPEEDS\[playSpeed\]\);/);
  assert.match(source, /mapWaiting, mapBlocked, playSpeed\]\);/);
});

test("E1: the slider moves the last year inside a run without ending it, and ends the run at the last year", () => {
  const jump = source.match(/const jumpTo = [\s\S]*?\n {2}\};/)?.[0] ?? "";
  // Outside a run it is the last-year picker by another means.
  assert.match(jump, /if \(!inRun\) \{\n\s+selectYear\("to", toYear, timestamp\);\n\s+return;/);
  // Inside one it keeps the first year, replaces the address and leaves Play as it was.
  assert.match(jump, /orderSpan\(\{ fromYear: committed\.fromYear, toYear \}, "to"\)/);
  assert.match(jump, /commit\(span, "replace"\);/);
  assert.doesNotMatch(jump, /setPlaying\(true\)|setPlayRun\(false\)/);
  assert.match(jump, /if \(span\.toYear === EXPLORE_YEAR_MAX\) \{\n\s+setPlaying\(false\);\n\s+setPlayStatus\("complete"\);\n\s+\} else if \(!isPlaying\) setPlayStatus\("paused"\);/);
  // It announces nothing of its own: the status lines are still the only live regions.
  assert.equal(source.match(/role="status"/g)?.length, 2);
  assert.doesNotMatch(source, /aria-live/);
});

for (const locale of ["en", "fr"] as const) {
  test(`E1: the server markup carries both tools, labelled and inert until the island runs (${locale})`, () => {
    const html = render(<ExploreView events={exploreFixtures} locale={locale} mode="wildfire" year={2010} fromYear={2005} />);
    const tools = html.match(/<div class="explore-play-tools" hidden="">[\s\S]*?<\/div>/)?.[0] ?? "";
    assert.ok(tools, "the tools are in the markup and hidden until the island is ready");
    const words = locale === "en"
      ? { jump: "Move the last year", speed: "Speed", options: ["Slow", "Normal", "Fast"] }
      : { jump: "Déplacer la dernière année", speed: "Vitesse", options: ["Lente", "Normale", "Rapide"] };
    assert.match(tools, new RegExp(`<label class="explore-play-jump" for="explore-play-jump-year"><span>${words.jump}</span><input id="explore-play-jump-year" type="range" min="1985" max="2022" step="1" disabled="" value="2010"/></label>`));
    assert.match(tools, new RegExp(`<label class="explore-play-speed" for="explore-play-speed-choice"><span>${words.speed}</span><select id="explore-play-speed-choice" class="explore-year-select" disabled="">`));
    assert.deepEqual([...tools.matchAll(/<option value="(\w+)"[^>]*>([^<]+)<\/option>/g)].map((m) => `${m[1]}:${m[2]}`), ["slow", "normal", "fast"].map((value, i) => `${value}:${words.options[i]}`));
    assert.match(tools, /<option value="normal" selected="">/);
    // Neither tool is a form field: a no-JavaScript submit sends what it always sent.
    assert.doesNotMatch(tools, /\bname="/);
  });
}

test("E1: Condition and recovery covers the whole record, so it has no slider and no pace", () => {
  const html = render(<ExploreView events={exploreFixtures} locale="en" mode="condition-recovery" />);
  assert.doesNotMatch(html, /explore-play-tools|explore-play-jump-year|explore-play-speed-choice/);
  assert.match(html, /class="year-play" disabled=""/);
});

test("E1: the tools are styled with the Explore rules and folded into one row in the phone's full screen", () => {
  assert.match(css, /\.explore-play-tools \{\n {2}display: flex;[\s\S]*?flex-basis: 100%;\n\}/);
  assert.match(css, /\.explore-play-tools\[hidden\] \{\n {2}display: none;\n\}/);
  assert.match(css, /\.explore--expanded \.explore-play-tools \{\n {4}display: grid;\n {4}grid-template-columns: minmax\(0, 1fr\) auto;/);
});

/*
 * E2: once playback is paused or done, one control gives back the span the
 * reader had before pressing Play, if it differs from what is on display.
 */
test("E2: a new run remembers the reader's span, and choosing years by hand forgets it", () => {
  const toggle = source.match(/const togglePlayback = [\s\S]*?\n {2}\};/)?.[0] ?? "";
  // Remembered before Play moves the first year, and only by a run that is not
  // already holding the reader's own years from an earlier, undone run.
  assert.match(toggle, /if \(!resumable && !inRun\) setBeforePlay\(committed\);\n\s+if \(!resumable\) setPlayRun\(true\);[\s\S]*commit\(\{ fromYear: playStart, toYear: playStart \+ 1 \}, "replace"\)/);
  const select = source.match(/const selectYear = [\s\S]*?\n {2}\};/)?.[0] ?? "";
  assert.match(select, /setPlayRun\(false\);\n\s+setBeforePlay\(null\);/);
});

test("E2: the control shows only when stopped inside a run with different years, and puts them back", () => {
  assert.match(source, /const restoreSpan = restorable && !isPlaying && inRun && spanKey\(restorable\) !== committedKey \? restorable : null;/);
  const restore = source.match(/const restoreYears = [\s\S]*?\n {2}\};/)?.[0] ?? "";
  assert.match(restore, /setPlayRun\(false\);\n\s+setBeforePlay\(null\);\n\s+setPlayStatus\("idle"\);\n\s+commit\(restoreSpan, "replace"\);/);
  // The button goes once it has worked; focus goes to Play rather than to the page.
  assert.match(restore, /playButtonRef\.current\?\.focus\(\);/);
  assert.match(source, /className="year-play"\n\s+ref=\{playButtonRef\}/);
  assert.match(source, /\{restoreSpan \? \(\n\s+<button type="button" className="year-play explore-play-restore" onClick=\{restoreYears\}>\n\s+\{text\.restore\(formatYearRange\(yearRange\(restoreSpan\.fromYear, restoreSpan\.toYear\), locale\)\)\}/);
  assert.match(source, /restore: \(span: string\) => `Back to your years, \$\{span\}`,/);
  assert.match(source, /restore: \(span: string\) => `Revenir à vos années, \$\{span\}`,/);
  // Nothing has played in a server render, so there is nothing to give back.
  for (const locale of ["en", "fr"] as const) {
    const html = render(<ExploreView events={exploreFixtures} locale={locale} mode="wildfire" year={2010} fromYear={2005} />);
    assert.doesNotMatch(html, /explore-play-restore/);
  }
  assert.match(css, /\.explore-play-restore \{\n {2}white-space: normal;/);
});
