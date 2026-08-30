"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  EXPLORE_YEAR_MAX,
  EXPLORE_YEAR_MIN,
  exploreHref,
  type ExploreQueryState,
} from "@/lib/explore";
import type { Locale } from "@/lib/domain";

const TEXT = {
  en: {
    legend: "Year shown",
    help: "Each year is one annual interval: what changed between that year and the year before it. The record runs from 1985 to 2022.",
    interval: (year: number) => `Change between ${year - 1} and ${year}`,
    previous: "Previous year",
    next: "Next year",
    play: "Play through the years",
    pause: "Stop playing",
    playShort: "Play",
    pauseShort: "Pause",
    update: "Update",
  },
  fr: {
    legend: "Année affichée",
    help: "Chaque année est un intervalle annuel : ce qui a changé entre cette année et la précédente. Le relevé va de 1985 à 2022.",
    interval: (year: number) => `Changement entre ${year - 1} et ${year}`,
    previous: "Année précédente",
    next: "Année suivante",
    play: "Faire défiler les années",
    pause: "Arrêter le défilement",
    playShort: "Lecture",
    pauseShort: "Pause",
    update: "Mettre à jour",
  },
} as const;

/** One tick every five years, plus both ends, so the scale is readable at any width. */
const TICKS = (() => {
  const years: number[] = [];
  for (let year = EXPLORE_YEAR_MIN; year <= EXPLORE_YEAR_MAX; year += 5) years.push(year);
  if (years[years.length - 1] !== EXPLORE_YEAR_MAX) years.push(EXPLORE_YEAR_MAX);
  return years;
})();

const STEP_MS = 1500;

/*
 * Fixed ids rather than useId(), for the reason recorded in ThemeToggle: the id
 * useId() produces depends on tree position, and the server and client trees
 * around this island differ. Explore renders one year control, so a fixed string
 * cannot collide.
 */
const SLIDER_ID = "explore-year-slider";
const READOUT_ID = "explore-year-readout";
const HELP_ID = "explore-year-help";
const TICKS_ID = "explore-year-ticks";

/*
 * Whether the years are playing, held in the module rather than in the component.
 *
 * Changing the year is a navigation, and a navigation re-renders the tree this
 * island sits in. Component state would be at the mercy of whether React happens
 * to reconcile the island in place, and a play control that stops after one step
 * because of a reconciliation detail is worse than no play control. The module is
 * evaluated once per page session, which is exactly the lifetime this belongs to:
 * it survives every step, and it is gone on a full reload.
 */
let playing = false;
const playListeners = new Set<() => void>();

function setPlaying(next: boolean) {
  playing = next;
  for (const listener of playListeners) listener();
}

function subscribePlaying(listener: () => void) {
  playListeners.add(listener);
  return () => void playListeners.delete(listener);
}

const readPlaying = () => playing;
const notPlaying = () => false;

/* Hydration state, read through the same primitive as the play flag: the control
   is server-rendered inert so that the no-JavaScript form keeps its Update
   button, and the button disappears the moment the island can do the work. */
const neverChanges = () => () => {};
const alwaysReady = () => true;
const neverReady = () => false;

/**
 * The year control: a full-width slider, the interval it selects named in full,
 * a step either side, and a play control that walks the record.
 *
 * It is a client island inside a plain GET form. Without JavaScript the form and
 * its Update button still work, which is why the slider keeps its `name` and the
 * hidden fields stay in the server-rendered form around it. With JavaScript the
 * Update button is redundant, so it is hidden rather than left as a second way to
 * do what releasing the slider already did.
 */
export function ExploreYearControl({
  locale,
  state,
}: {
  locale: Locale;
  state: ExploreQueryState;
}) {
  const text = TEXT[locale];
  const router = useRouter();
  const pathname = usePathname();

  const isPlaying = useSyncExternalStore(subscribePlaying, readPlaying, notPlaying);
  const ready = useSyncExternalStore(neverChanges, alwaysReady, neverReady);

  /*
   * While the reader drags, the year has not been committed yet: the readout has
   * to follow the thumb without a navigation on every pixel. `draft` holds that
   * uncommitted value along with the year it was started from, so a year arriving
   * from anywhere else, the browser's Back button included, drops it. Adjusting
   * state during render is React's documented way to react to a changed prop, and
   * it costs one extra render rather than an effect and a second commit.
   */
  const [draft, setDraft] = useState<{ from: number; value: number } | null>(null);
  if (draft && draft.from !== state.year) setDraft(null);
  const shown = draft && draft.from === state.year ? draft.value : state.year;

  const go = (year: number) => {
    const next = Math.min(EXPLORE_YEAR_MAX, Math.max(EXPLORE_YEAR_MIN, year));
    // Releasing the thumb where it started, or clicking the track on the current
    // year, is not a change. Pushing the same URL would reload the map for nothing.
    if (next === state.year) {
      setDraft(null);
      return;
    }
    setDraft({ from: state.year, value: next });
    router.push(`${pathname}${exploreHref({ ...state, year: next })}`);
  };

  /*
   * The next step, resolved during render rather than inside the timer. The
   * effect below depends on this string: the query state is a fresh object on
   * every server render, and depending on the object would restart the clock on
   * every unrelated re-render, so the years would never advance while dragging.
   */
  const nextHref = `${pathname}${exploreHref({
    ...state,
    year: state.year >= EXPLORE_YEAR_MAX ? EXPLORE_YEAR_MIN : state.year + 1,
  })}`;

  // The player is a subscription to a clock, which is what an effect is for.
  // It wraps rather than stopping at the end: a control that keeps its Pause
  // label while nothing moves is a control that looks broken.
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setTimeout(() => router.push(nextHref), STEP_MS);
    return () => clearTimeout(timer);
  }, [isPlaying, nextHref, router]);

  return (
    <div className="year-control">
      <div className="year-head">
        <label className="year-legend" htmlFor={SLIDER_ID}>{text.legend}</label>
        <output className="year-readout" id={READOUT_ID} htmlFor={SLIDER_ID}>
          {text.interval(shown)}
        </output>
      </div>
      <input
        type="range"
        className="explore-slider"
        id={SLIDER_ID}
        name="year"
        list={TICKS_ID}
        min={EXPLORE_YEAR_MIN}
        max={EXPLORE_YEAR_MAX}
        step={1}
        value={shown}
        aria-label={text.legend}
        aria-describedby={HELP_ID}
        aria-valuetext={text.interval(shown)}
        onChange={(event) => setDraft({ from: state.year, value: Number(event.target.value) })}
        // A range fires change continuously while dragging, so the commit hangs off
        // the release instead: one navigation per drag rather than one per pixel.
        onKeyUp={(event) => { if (event.key.startsWith("Arrow")) go(shown); }}
        onPointerUp={() => go(shown)}
      />
      <datalist id={TICKS_ID}>
        {TICKS.map((year) => <option key={year} value={year} label={String(year)} />)}
      </datalist>
      {/* A picture of the datalist, which browsers draw inconsistently or not at
          all. Hidden from assistive technology because the slider already
          announces its range, its value and the interval that value means. */}
      <ul className="year-scale" aria-hidden="true">
        {TICKS.map((year) => <li key={year}>{year}</li>)}
      </ul>
      <div className="year-row">
        <button
          type="button"
          className="year-step"
          onClick={() => go(shown - 1)}
          disabled={!ready || shown <= EXPLORE_YEAR_MIN}
          aria-label={text.previous}
        >
          <span aria-hidden="true">←</span>
        </button>
        <button
          type="button"
          className="year-step"
          onClick={() => go(shown + 1)}
          disabled={!ready || shown >= EXPLORE_YEAR_MAX}
          aria-label={text.next}
        >
          <span aria-hidden="true">→</span>
        </button>
        <button
          type="button"
          className="year-play"
          onClick={() => setPlaying(!isPlaying)}
          disabled={!ready}
          aria-pressed={isPlaying}
          aria-label={isPlaying ? text.pause : text.play}
        >
          {isPlaying ? text.pauseShort : text.playShort}
        </button>
        <button className="btn btn--primary year-submit" type="submit" hidden={ready}>
          {text.update}
        </button>
        <p className="year-help" id={HELP_ID}>{text.help}</p>
      </div>
    </div>
  );
}
