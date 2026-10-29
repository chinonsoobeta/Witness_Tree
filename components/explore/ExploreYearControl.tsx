"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  EXPLORE_INTERVAL_FIRST_YEAR,
  EXPLORE_INTERVAL_LAST_YEAR,
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
    help: "Choose a first and last year to set a span. The record runs from 1984 to 2022.",
    between: (fromYear: number, toYear: number) => `Change between ${fromYear} and ${toYear}`,
    moved: (which: "first" | "last", year: number) => `${which === "first" ? "First" : "Last"} year moved to ${year} so the span stays at least one year long.`,
    play: (start: number) => `Play year by year from ${start}`,
    pause: "Pause playback",
    resume: "Resume playback",
    playShort: "Play",
    pauseShort: "Pause",
    resumeShort: "Resume",
    playing: (start: number) => `Playing year by year from ${start}: the first year stays at ${start} and the last year moves on one year at a time.`,
    waiting: "Waiting for the interactive map to load before moving on.",
    paused: "Paused. Press Resume to carry on from these years.",
    stalled: "Paused, because the interactive map isn’t showing and a still map is shown instead. Retry the interactive map, then press Resume.",
    stillMap: "Play needs the interactive map, which isn’t showing. Retry the interactive map to play through the years.",
    complete: `Playback reached ${EXPLORE_YEAR_MAX}, the end of the record.`,
    update: "Update",
  },
  fr: {
    legend: "Années affichées",
    firstYear: "Première année",
    lastYear: "Dernière année",
    help: "Choisissez une première et une dernière année pour établir une période. Le registre couvre la période de 1984 à 2022.",
    between: (fromYear: number, toYear: number) => `Changement entre ${fromYear} et ${toYear}`,
    moved: (which: "first" | "last", year: number) => `${which === "first" ? "La première" : "La dernière"} année a été déplacée à ${year} pour garder une période d’au moins un an.`,
    play: (start: number) => `Lecture année par année depuis ${start}`,
    pause: "Mettre la lecture en pause",
    resume: "Reprendre la lecture",
    playShort: "Lecture",
    pauseShort: "Pause",
    resumeShort: "Reprendre",
    playing: (start: number) => `Lecture année par année depuis ${start}\u202F: la première année reste ${start} et la dernière avance d’un an à la fois.`,
    waiting: "En attente du chargement de la carte interactive avant de continuer.",
    paused: "En pause. Appuyez sur Reprendre pour continuer à partir de ces années.",
    stalled: "En pause, car la carte interactive ne s’affiche pas et une carte fixe est affichée à sa place. Réessayez la carte interactive, puis appuyez sur Reprendre.",
    stillMap: "La lecture a besoin de la carte interactive, qui ne s’affiche pas. Réessayez la carte interactive pour faire défiler les années.",
    complete: `La lecture a atteint ${EXPLORE_YEAR_MAX}, la fin du registre.`,
    update: "Mettre à jour",
  },
} as const;

const STEP_MS = 1500;

/**
 * What the map beside this control can show, as far as playback cares.
 *
 * `interactive` draws each span as it arrives; `loading` has not drawn yet;
 * `fallback` is the still map or no map at all, which cannot follow the years
 * the way the reader expects; `none` means the mode has no map layer to wait for.
 */
export type ExploreMapPlayback = "loading" | "interactive" | "fallback" | "none";

/*
 * The address for a span, always naming its first year. exploreHref leaves
 * `from` out of an annual span, because a bare year has always meant that span,
 * but playback holds the first year fixed and a reader who copies the address
 * mid-play has to get the same first year back.
 */
function spanHref(pathname: string, state: ExploreQueryState, span: Span) {
  const href = exploreHref({ ...state, year: span.toYear, fromYear: span.fromYear });
  return `${pathname}${href}${span.fromYear === span.toYear - 1 ? `&from=${span.fromYear}` : ""}`;
}

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
const FROM_SELECT_ID = "explore-year-from";
const SELECT_ID = "explore-year";
const READOUT_ID = "explore-year-readout";
const HELP_ID = "explore-year-help";

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
 * The span control: two native selects, the interval they select named in full,
 * and a play control that walks the record.
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
  wholeRecord = false,
  mapPlayback = "interactive",
}: {
  locale: Locale;
  state: ExploreQueryState;
  onYearChange: (year: number) => void;
  onIntervalChange?: (interval: Span) => void;
  /**
   * The view's figures always cover the whole record, as Condition and recovery
   * does. The control then shows 1984 to 2022 and cannot be changed; the reader's
   * own years stay in the URL for the other views.
   */
  wholeRecord?: boolean;
  /** Whether the map can follow playback; see ExploreMapPlayback. */
  mapPlayback?: ExploreMapPlayback;
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
  const [playStatus, setPlayStatus] = useState<"idle" | "playing" | "paused" | "stalled" | "complete">("idle");
  const [orderStatus, setOrderStatus] = useState<{ which: "first" | "last"; year: number } | null>(null);
  const changeGroup = useRef<{ name: "from" | "to"; started: number; span: Span } | null>(null);
  if (draft && draft.from !== committedKey) setDraft(null);
  const shown = wholeRecord
    ? { fromYear: EXPLORE_INTERVAL_FIRST_YEAR, toYear: EXPLORE_INTERVAL_LAST_YEAR }
    : draft && draft.from === committedKey ? draft.span : committed;

  const readout = wholeRecord || isAnnualInterval(shown)
    ? text.between(shown.fromYear, shown.toYear)
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
    writeHistory(history, spanHref(pathname, state, next));
  };

  const selectYear = (name: "from" | "to", value: number, timestamp: number) => {
    setPlaying(false);
    setPlayStatus("idle");
    const now = timestamp;
    const group = changeGroup.current;
    const grouped = group && group.name === name && now - group.started < 1000;
    const base = grouped ? group.span : committed;
    const ordered = orderSpan(
      name === "from"
        ? { fromYear: value, toYear: base.toYear }
        : { fromYear: base.fromYear, toYear: value },
      name,
    );
    changeGroup.current = { name, started: grouped ? group.started : now, span: grouped ? group.span : committed };
    const moved = name === "from" ? ordered.toYear !== value : ordered.fromYear !== base.fromYear;
    setOrderStatus(moved
      ? { which: name === "from" ? "last" : "first", year: name === "from" ? ordered.toYear : ordered.fromYear }
      : null);
    commit(ordered, grouped ? "replace" : "push");
  };

  /*
   * The next step, resolved during render rather than inside the timer. The
   * effect below depends on this string: the query state is a fresh object on
   * every server render, and depending on the object would restart the clock on
   * every unrelated re-render, so the years would never advance while dragging.
   *
   * Playback holds the first year the reader chose and moves only the last
   * year, one year a step, to the end of the record; the button says so. A
   * first year with no later span to grow into (the default 2021 to 2022)
   * starts from the beginning of the record instead, and the button names
   * that year too, so the reader is never surprised by where it starts.
   */
  const nextSpan: Span = { fromYear: committed.fromYear, toYear: Math.min(EXPLORE_YEAR_MAX, committed.toYear + 1) };
  const nextHref = spanHref(pathname, state, nextSpan);
  const playStart = committed.fromYear < EXPLORE_YEAR_MAX - 1 ? committed.fromYear : EXPLORE_INTERVAL_FIRST_YEAR;
  // Nothing to step while the map has not drawn yet, and nothing honest to
  // step while it has fallen back: playback waits, or pauses with a reason.
  const mapBlocked = mapPlayback === "fallback";
  const mapWaiting = mapPlayback === "loading";

  // Playback changes only the active source and URL state. It neither asks the
  // App Router for a new page nor silently wraps at the end of the record.
  useEffect(() => {
    if (wholeRecord || !isPlaying || committed.toYear >= EXPLORE_YEAR_MAX || mapWaiting) return;
    const timer = setTimeout(() => {
      if (mapBlocked) {
        setPlaying(false);
        setPlayStatus("stalled");
        return;
      }
      setDraft({ from: committedKey, span: nextSpan });
      onYearChange(nextSpan.toYear);
      onIntervalChange?.(nextSpan);
      writeHistory("replace", nextHref);
      if (nextSpan.toYear === EXPLORE_YEAR_MAX) {
        setPlaying(false);
        setPlayStatus("complete");
      }
    }, mapBlocked ? 0 : STEP_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wholeRecord, isPlaying, nextHref, committedKey, onYearChange, onIntervalChange, mapWaiting, mapBlocked]);

  const resumable = (playStatus === "paused" || playStatus === "stalled") && committed.toYear < EXPLORE_YEAR_MAX;
  const togglePlayback = () => {
    if (isPlaying) {
      setPlaying(false);
      setPlayStatus("paused");
      return;
    }
    setPlayStatus("playing");
    setPlaying(true);
    // Resume carries on from the span on display; Play starts the walk again.
    if (!resumable) commit({ fromYear: playStart, toYear: playStart + 1 }, "replace");
  };
  // The accessible name starts with the visible word, so a reader who says or
  // searches for "Pause" finds the control that shows "Pause".
  const playLabel = isPlaying
    ? { short: text.pauseShort, name: text.pause }
    : resumable
      ? { short: text.resumeShort, name: text.resume }
      : { short: text.playShort, name: text.play(playStart) };
  const playMessage = wholeRecord
    ? null
    : isPlaying
      ? mapBlocked
        ? text.stalled
        : mapWaiting
          ? `${text.playing(shown.fromYear)} ${text.waiting}`
          : text.playing(shown.fromYear)
      : playStatus === "stalled"
        ? text.stalled
        : mapBlocked
          ? text.stillMap
          : playStatus === "paused" && resumable
            ? text.paused
            : playStatus === "complete"
              ? text.complete
              : null;

  return (
    <div className="year-control">
      <div className="year-head">
        <span className="year-legend" id={`${READOUT_ID}-legend`}>{text.legend}</span>
        <output className="year-readout" id={READOUT_ID} htmlFor={`${FROM_SELECT_ID} ${SELECT_ID}`}>
          {readout}
        </output>
      </div>
      <label className="year-handle-label" htmlFor={FROM_SELECT_ID}>{text.firstYear}</label>
      <select
        className="explore-year-select"
        id={FROM_SELECT_ID}
        name="from"
        value={String(shown.fromYear)}
        disabled={wholeRecord}
        aria-describedby={wholeRecord ? undefined : HELP_ID}
        onChange={(event) => selectYear("from", Number(event.target.value), event.timeStamp)}
      >
        {Array.from({ length: EXPLORE_YEAR_MAX - EXPLORE_INTERVAL_FIRST_YEAR }, (_, index) => EXPLORE_INTERVAL_FIRST_YEAR + index).map((year) => (
          <option key={year} value={year}>{year}</option>
        ))}
      </select>
      <label className="year-handle-label" htmlFor={SELECT_ID}>{text.lastYear}</label>
      <select
        className="explore-year-select"
        id={SELECT_ID}
        name="year"
        value={String(shown.toYear)}
        disabled={wholeRecord}
        aria-describedby={wholeRecord ? undefined : HELP_ID}
        onChange={(event) => selectYear("to", Number(event.target.value), event.timeStamp)}
      >
        {Array.from({ length: EXPLORE_YEAR_MAX - EXPLORE_YEAR_MIN + 1 }, (_, index) => EXPLORE_YEAR_MIN + index).map((year) => (
          <option key={year} value={year}>{year}</option>
        ))}
      </select>
      <div className="year-row">
        <button
          type="button"
          className="year-play"
          onClick={togglePlayback}
          disabled={!ready || wholeRecord || (mapBlocked && !isPlaying)}
          aria-label={playLabel.name}
        >
          {playLabel.short}
        </button>
        <button className="btn btn--primary year-submit" type="submit" hidden={ready || wholeRecord}>
          {text.update}
        </button>
        {wholeRecord ? null : <p className="year-help" id={HELP_ID}>{text.help}</p>}
      </div>
      {orderStatus !== null ? <p className="year-order-status" role="status">{text.moved(orderStatus.which, orderStatus.year)}</p> : null}
      {playMessage !== null ? (
        <p className="year-play-status" role="status">
          {playMessage}
        </p>
      ) : null}
    </div>
  );
}
