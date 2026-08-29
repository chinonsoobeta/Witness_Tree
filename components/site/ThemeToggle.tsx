"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/domain";
import { THEME_CHOICES, THEME_STORAGE_KEY, applyTheme, isThemeChoice, type ThemeChoice } from "@/lib/theme";

const TEXT = {
  en: { group: "Colour theme", system: "System", light: "Light", dark: "Dark" },
  fr: { group: "Thème de couleur", system: "Système", light: "Clair", dark: "Sombre" },
} as const;

/*
 * The stored choice is external state, not React state, so it is read through
 * useSyncExternalStore rather than copied into a useState inside an effect. That
 * is not only the lint rule: localStorage is shared between every tab on the
 * origin, and subscribing to the storage event means a reader who switches to
 * dark in one tab sees the others follow instead of drifting apart.
 *
 * The storage event fires only in the other tabs, so a write in this one has to
 * announce itself. Hence the local listener set.
 */
/*
 * Hand-written rather than useId(), because the id has to survive hydration and
 * useId() does not here: the value is derived from the component's position in
 * the tree, and the server and client trees around this island are not the same
 * shape. Fixed strings are safe because the header renders exactly one of these.
 */
const GROUP_NAME = "witness-tree-theme-choice";
const LABEL_ID = "witness-tree-theme-label";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/*
 * Where the choice lives when storage throws, which it does outright in some
 * privacy configurations. Without it the palette would change on click while the
 * control snapped back to "System", because the snapshot had nowhere to read the
 * new value from. It is deliberately not a persistence layer: it lasts the visit.
 */
let unstoredChoice: ThemeChoice = "system";

function rememberUnstoredChoice(next: ThemeChoice) {
  unstoredChoice = next;
}

function readChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : "system";
  } catch {
    return unstoredChoice;
  }
}

/** The server cannot read the browser's storage, so it renders the default. */
const serverChoice = (): ThemeChoice => "system";

/*
 * Hydration state, expressed through the same primitive: false while the server
 * snapshot is in use, true once the client store is live. It gates the control's
 * `disabled`, so the markup is present and inert until it can actually work.
 */
const neverChanges = () => () => {};
const mounted = () => true;
const notMounted = () => false;

/**
 * The colour-theme control. A client island for the same reason LocaleLink is one:
 * the header sits in the shell on every page, and marking the whole header client
 * would ship the navigation to the browser to operate one control.
 *
 * Three native radios rather than a switch, because the choice genuinely has three
 * values and a two-state switch cannot express "follow the system". Native inputs
 * carry arrow-key navigation, roving focus and the group relationship from the
 * platform, so the only ARIA here is the group's name.
 *
 * Without JavaScript the control cannot change anything, and a radio that visibly
 * accepts a click while doing nothing is a worse failure than one that says it is
 * unavailable. Rendering nothing until mount would instead shift the whole
 * navigation row sideways on hydration, so the markup is present and inert.
 */
export function ThemeToggle({ locale }: { locale: Locale }) {
  const text = TEXT[locale];

  const choice = useSyncExternalStore(subscribe, readChoice, serverChoice);
  const ready = useSyncExternalStore(neverChanges, mounted, notMounted);

  // The document is the external system this component synchronises. Doing it
  // here rather than in the change handler also covers the write that arrives
  // from another tab, which has no handler to run.
  useEffect(() => {
    applyTheme(choice, document.documentElement);
  }, [choice]);

  const select = (next: ThemeChoice) => {
    try {
      if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Unwritable storage still has to move the page, so the choice is held in
      // memory for this visit and forgotten when the tab closes.
      rememberUnstoredChoice(next);
    }
    for (const listener of listeners) listener();
  };

  return (
    <div className="theme-toggle" role="radiogroup" aria-labelledby={LABEL_ID}>
      <span className="theme-toggle-label" id={LABEL_ID}>{text.group}</span>
      {THEME_CHOICES.map((value) => (
        <label className="theme-option" key={value}>
          <input
            type="radio"
            name={GROUP_NAME}
            value={value}
            aria-label={text[value]}
            checked={choice === value}
            disabled={!ready}
            onChange={() => select(value)}
          />
          <span>{text[value]}</span>
        </label>
      ))}
    </div>
  );
}
