"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  EXPLORE_INTERVAL_FIRST_YEAR,
  EXPLORE_YEAR_MAX,
  EXPLORE_YEAR_MIN,
  exploreHref,
  isAnnualInterval,
  parseExploreInterval,
  type ExploreQueryState,
} from "@/lib/explore";
import { intervalHeading } from "@/lib/domain/loss-vocabulary";
import type { Locale } from "@/lib/domain";

const TEXT = {
  en: {
    legend: "Years shown",
    firstYear: "First year",
    lastYear: "Last year",
    help: "Move both handles to choose a span, for example 1990 to 1998. Leave them one year apart to see a single year on its own. The record runs from 1984 to 2022.",
    annual: (year: number) => `Change between ${year - 1} and ${year}`,
    previous: "Earlier last year",
    next: "Later last year",
    play: "Play through the years",
    pause: "Stop playing",
    playShort: "Play",
    pauseShort: "Pause",
    playing: "Playing from the beginning of the record.",
    complete: "Playback reached the end of the record.",
    update: "Update",
  },
  fr: {
    legend: "Années affichées",
    firstYear: "Première année",
    lastYear: "Dernière année",
    help: "Déplacez les deux curseurs pour choisir une période, par exemple de 1990 à 1998. Laissez-les à un an d’écart pour voir une seule année. Le relevé va de 1984 à 2022.",
    annual: (year: number) => `Changement entre ${year - 1} et ${year}`,
    previous: "Dernière année plus tôt",
    next: "Dernière année plus tard",
    play: "Faire défiler les années",
    pause: "Arrêter le défilement",
    playShort: "Lecture",
    pauseShort: "Pause",
    playing: "Lecture depuis le début du relevé.",
    complete: "La lecture a atteint la fin du relevé.",
    update: "Mettre à jour",
  },
} as const;

/** One tick every five years, plus both ends, so the scale is readable at any width. */
const TICKS = (() => {
  const years: number[] = [];
  for (let year = EXPLORE_INTERVAL_FIRST_YEAR; year <= EXPLORE_YEAR_MAX; year += 5) years.push(year);
  if (years[years.length - 1] !== EXPLORE_YEAR_MAX) years.push(EXPLORE_YEAR_MAX);
  return years;
})();

const STEP_MS = 1500;

function writeHistory(method: "push" | "replace", url: string) {
  // Vinext patches the instance methods to start an RSC navigation. Calling
  // the browser's native prototype method keeps this client-owned control
  // shareable without remounting the map for every annual source swap.
  const write = method === "push" ? History.prototype.pushState : History.prototype.replaceState;
  write.call(window.history, null, "", url);
}

/*
 * Fixed ids rather than useId(), for the reason recorded in ThemeToggle: the id
 * useId() produces depends on tree position, and the server and client trees
 * around this island differ. Explore renders one year control, so a fixed string
 * cannot collide.
 */
const FROM_SLIDER_ID = "explore-year-from-slider";
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

type Span = { fromYear: number; toYear: number };

const spanKey = (span: Span) => `${span.fromYear}-${span.toYear}`;

/**
 * Order a span the reader is part way through dragging.
 *
 * The two handles are separate native sliders, so nothing stops the reader from
 * dragging one past the other. Rather than refuse the gesture, the handle being
 * moved keeps the year it was dropped on and pushes the other one out of its
 * way. A span of zero years is not a span, so the pushed handle stops one year
 * short and the record always has an interval to answer.
 */
function orderSpan(span: Span, moved: "from" | "to"): Span {
  if (span.fromYear < span.toYear) return span;
  return moved === "from"
    ? { fromYear: Math.min(span.fromYear, EXPLORE_YEAR_MAX - 1), toYear: Math.min(span.fromYear, EXPLORE_YEAR_MAX - 1) + 1 }
    : { fromYear: Math.max(span.toYear, EXPLORE_YEAR_MIN) - 1, toYear: Math.max(span.toYear, EXPLORE_YEAR_MIN) };
}

/**
 * The span control: two handles, the interval they select named in full, a step
 * either side of the closing year, and a play control that walks the record.
 *
 * It used to be one handle, because the record used to answer one question: a
 * year meant the single annual interval ending there. A reader who wants 1990
 * to 1998 is asking something the single handle could not express, so the
 * annual interval is now the narrowest span rather than a separate mode. One
 * code path answers both, and a URL that names only its closing year still
 * means exactly the annual interval it always meant.
 *
 * It is a client island inside a plain GET form. Without JavaScript the form and
 * its Update button still work, which is why both sliders keep their `name` and
 * the hidden fields stay in the server-rendered form around it. With JavaScript
 * the Update button is redundant, so it is hidden rather than left as a second
 * way to do what releasing a handle already did.
 */
export function ExploreYearControl({
  locale,
  state,
  onYearChange,
  onIntervalChange,
}: {
  locale: Locale;
  state: ExploreQueryState;
  onYearChange: (year: number) => void;
  onIntervalChange?: (interval: Span) => void;
}) {
  const text = TEXT[locale];
  const pathname = usePathname();

  const isPlaying = useSyncExternalStore(subscribePlaying, readPlaying, notPlaying);
  const ready = useSyncExternalStore(neverChanges, alwaysReady, neverReady);

  const committed = parseExploreInterval(state.fromYear, state.year);
  const committedKey = spanKey(committed);

  /*
   * While the reader drags, the span has not been committed yet: the readout has
   * to follow the thumb without a navigation on every pixel. `draft` holds that
   * uncommitted span along with the span it was started from, so a span arriving
   * from anywhere else, the browser's Back button included, drops it. Adjusting
   * state during render is React's documented way to react to a changed prop, and
   * it costs one extra render rather than an effect and a second commit.
   */
  const [draft, setDraft] = useState<{ from: string; span: Span } | null>(null);
  const [playStatus, setPlayStatus] = useState<"idle" | "playing" | "complete">("idle");
  if (draft && draft.from !== committedKey) setDraft(null);
  const shown = draft && draft.from === committedKey ? draft.span : committed;

  const readout = isAnnualInterval(shown)
    ? text.annual(shown.toYear)
    : intervalHeading(shown.fromYear, shown.toYear)[locale];

  const commit = (span: Span, history: "push" | "replace") => {
    const next = parseExploreInterval(span.fromYear, span.toYear);
    // Releasing a handle where it started, or clicking the track on the current
    // year, is not a change. Pushing the same URL would reload the map for nothing.
    if (spanKey(next) === committedKey) {
      setDraft(null);
      return;
    }
    setDraft({ from: committedKey, span: next });
    onYearChange(next.toYear);
    onIntervalChange?.(next);
    const nextUrl = `${pathname}${exploreHref({ ...state, year: next.toYear, fromYear: next.fromYear })}`;
    writeHistory(history, nextUrl);
  };

  const go = (span: Span) => {
    setPlaying(false);
    setPlayStatus("idle");
    commit(span, "push");
  };

  /*
   * The next step, resolved during render rather than inside the timer. The
   * effect below depends on this string: the query state is a fresh object on
   * every server render, and depending on the object would restart the clock on
   * every unrelated re-render, so the years would never advance while dragging.
   *
   * Playback moves the closing year. When the span is a single year the opening
   * year moves with it, which is exactly what the control did before spans
   * existed; when the reader has chosen a wider span the opening year stays put
   * and the window grows, which is the honest reading of a fixed start date.
   */
  const nextToYear = Math.min(EXPLORE_YEAR_MAX, committed.toYear + 1);
  const nextSpan: Span = isAnnualInterval(committed)
    ? { fromYear: nextToYear - 1, toYear: nextToYear }
    : { fromYear: committed.fromYear, toYear: nextToYear };
  const nextHref = `${pathname}${exploreHref({
    ...state,
    year: nextSpan.toYear,
    fromYear: nextSpan.fromYear,
  })}`;

  // Playback changes only the active source and URL state. It neither asks the
  // App Router for a new page nor silently wraps at the end of the record.
  useEffect(() => {
    if (!isPlaying || committed.toYear >= EXPLORE_YEAR_MAX) return;
    const timer = setTimeout(() => {
      setDraft({ from: committedKey, span: nextSpan });
      onYearChange(nextSpan.toYear);
      onIntervalChange?.(nextSpan);
      writeHistory("replace", nextHref);
      if (nextSpan.toYear === EXPLORE_YEAR_MAX) {
        setPlaying(false);
        setPlayStatus("complete");
      }
    }, STEP_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, nextHref, committedKey, onYearChange, onIntervalChange]);

  const togglePlayback = () => {
    if (isPlaying) {
      setPlaying(false);
      setPlayStatus("idle");
      return;
    }
    setPlayStatus("playing");
    setPlaying(true);
    commit(
      isAnnualInterval(committed)
        ? { fromYear: EXPLORE_INTERVAL_FIRST_YEAR, toYear: EXPLORE_YEAR_MIN }
        : { fromYear: committed.fromYear, toYear: committed.fromYear + 1 },
      "replace",
    );
  };

  return (
    <div className="year-control">
      <div className="year-head">
        <span className="year-legend" id={`${READOUT_ID}-legend`}>{text.legend}</span>
        <output className="year-readout" id={READOUT_ID} htmlFor={`${FROM_SLIDER_ID} ${SLIDER_ID}`}>
          {readout}
        </output>
      </div>
      <label className="year-handle-label" htmlFor={FROM_SLIDER_ID}>{text.firstYear}</label>
      <input
        type="range"
        className="explore-slider"
        id={FROM_SLIDER_ID}
        name="from"
        list={TICKS_ID}
        min={EXPLORE_INTERVAL_FIRST_YEAR}
        max={EXPLORE_YEAR_MAX - 1}
        step={1}
        value={shown.fromYear}
        aria-describedby={HELP_ID}
        aria-valuetext={`${text.firstYear}: ${shown.fromYear}`}
        onChange={(event) =>
          setDraft({
            from: committedKey,
            span: orderSpan({ fromYear: Number(event.target.value), toYear: shown.toYear }, "from"),
          })
        }
        // A range fires change continuously while dragging, so the commit hangs off
        // the release instead: one navigation per drag rather than one per pixel.
        onKeyUp={(event) => { if (event.key.startsWith("Arrow")) go(shown); }}
        onPointerUp={() => go(shown)}
      />
      <label className="year-handle-label" htmlFor={SLIDER_ID}>{text.lastYear}</label>
      <input
        type="range"
        className="explore-slider"
        id={SLIDER_ID}
        name="year"
        list={TICKS_ID}
        min={EXPLORE_YEAR_MIN}
        max={EXPLORE_YEAR_MAX}
        step={1}
        value={shown.toYear}
        aria-describedby={HELP_ID}
        aria-valuetext={readout}
        onChange={(event) =>
          setDraft({
            from: committedKey,
            span: orderSpan({ fromYear: shown.fromYear, toYear: Number(event.target.value) }, "to"),
          })
        }
        onKeyUp={(event) => { if (event.key.startsWith("Arrow")) go(shown); }}
        onPointerUp={() => go(shown)}
      />
      <datalist id={TICKS_ID}>
        {TICKS.map((year) => <option key={year} value={year} label={String(year)} />)}
      </datalist>
      {/* A picture of the datalist, which browsers draw inconsistently or not at
          all. Hidden from assistive technology because each slider already
          announces its range, its value and the interval that value means. */}
      <ul className="year-scale" aria-hidden="true">
        {TICKS.map((year) => <li key={year}>{year}</li>)}
      </ul>
      <div className="year-row">
        <button
          type="button"
          className="year-step"
          onClick={() => go(orderSpan({ fromYear: shown.fromYear, toYear: shown.toYear - 1 }, "to"))}
          disabled={!ready || shown.toYear <= EXPLORE_YEAR_MIN}
          aria-label={text.previous}
        >
          <span aria-hidden="true">←</span>
        </button>
        <button
          type="button"
          className="year-step"
          onClick={() => go(orderSpan({ fromYear: shown.fromYear, toYear: shown.toYear + 1 }, "to"))}
          disabled={!ready || shown.toYear >= EXPLORE_YEAR_MAX}
          aria-label={text.next}
        >
          <span aria-hidden="true">→</span>
        </button>
        <button
          type="button"
          className="year-play"
          onClick={togglePlayback}
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
      {playStatus !== "idle" ? (
        <p className="year-play-status" role="status">
          {playStatus === "playing" ? text.playing : text.complete}
        </p>
      ) : null}
    </div>
  );
}
