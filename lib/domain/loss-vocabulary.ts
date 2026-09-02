import { localized, type LocalizedString } from "./localized";

/*
 * The words the product uses for what it measures, in one place.
 *
 * Three distinctions are load-bearing here, and each of them was a naming
 * decision before it was a string:
 *
 * 1. Detected, not observed. Nothing in this product was seen on the ground.
 *    A classifier changed its mind about a 30 m cell between two annual
 *    mosaics. "Observed" invites a reader to hear eyewitness confirmation that
 *    the methodology page explicitly says does not exist.
 *
 * 2. Loss, not change. The layer draws cells that stopped being forest. It has
 *    no gain product and no regrowth product, so "change" promises a symmetry
 *    the data does not have.
 *
 * 3. Union and sum are different quantities and must never share a name. Over
 *    a multi-year window a cell can be counted once (it was lost at some point)
 *    or several times (it was lost, replanted, and lost again). Both are true
 *    and they answer different questions, so each gets its own words.
 */

/** Area of a single VLCE2 cell, in hectares. 30 m by 30 m. */
export const CELL_HECTARES = 0.09;

/**
 * Forest counted once if it was lost in any year of the window.
 *
 * This is the headline quantity. It is bounded by the forest present at the
 * start of the window, so it is the only one of the two that can honestly be
 * divided by that denominator and shown as a percentage.
 */
export const UNION_TERM: LocalizedString = localized(
  "Forest lost at least once",
  "Forêt perdue au moins une fois",
);

/**
 * Every year's detected loss added together.
 *
 * A cell lost in two separate years contributes twice, so this total can
 * exceed the forest that ever existed inside the boundary. That is not an
 * error; it is what the question "how much loss happened" means when loss can
 * recur. It is reported in hectares only. See {@link SUM_PERCENT_IS_FORBIDDEN}.
 */
export const SUM_TERM: LocalizedString = localized(
  "Yearly losses added together",
  "Pertes annuelles additionnées",
);

/**
 * The sum has no valid denominator, so it has no valid percentage.
 *
 * Dividing a total that can double-count by a forest area that cannot produces
 * a figure above 100% in exactly the places where the most happened, which
 * reads as an error rather than as the recurrence it actually is.
 */
export const SUM_PERCENT_IS_FORBIDDEN = true as const;

/** Detected loss, as a measured area. */
export const DETECTED_LOSS_HECTARES: LocalizedString = localized(
  "Detected loss (ha)",
  "Perte détectée (ha)",
);

/** Detected loss, as a share of the forest known at the start of the window. */
export const DETECTED_LOSS_PERCENT: LocalizedString = localized(
  "Detected loss (%)",
  "Perte détectée (%)",
);

/** The map layer that draws cells which stopped being forest. */
export const FOREST_LOSS_LAYER: LocalizedString = localized(
  "Forest loss",
  "Perte forestière",
);

/** The full noun phrase, for prose and legends. */
export const DETECTED_FOREST_LOSS: LocalizedString = localized(
  "Detected forest loss",
  "Perte forestière détectée",
);

/**
 * The heading over an interval readout, in both locales.
 *
 * Written out rather than hyphenated because a heading is read aloud by screen
 * readers, where "1990 to 1998" is a span and "1990-1998" is ambiguous.
 */
export function intervalHeading(fromYear: number, toYear: number): LocalizedString {
  if (!Number.isInteger(fromYear) || !Number.isInteger(toYear)) {
    throw new Error("An interval heading needs two integer years.");
  }
  if (toYear <= fromYear) throw new Error("An interval must end after it starts.");
  return localized(
    `Forest lost between ${fromYear} and ${toYear}`,
    `Forêt perdue entre ${fromYear} et ${toYear}`,
  );
}

/**
 * Wording this product retired, with the replacement and the reason.
 *
 * The checker reads this list, so adding a row here is what makes a phrase
 * enforceable. A phrase stays listed after the sweep: the list is what stops
 * the old wording coming back in the next component somebody writes.
 */
export const RETIRED_WORDING: ReadonlyArray<
  Readonly<{ pattern: string; replacement: string; reason: string }>
> = Object.freeze([
  Object.freeze({
    pattern: "Observed forest loss",
    replacement: "Detected forest loss",
    reason: "Nothing was observed on the ground; a classifier detected a change between two annual mosaics.",
  }),
  Object.freeze({
    pattern: "Observed loss",
    replacement: "Detected loss",
    reason: "Same reason, in the shorter label used in tables and legends.",
  }),
  Object.freeze({
    pattern: "Perte observée",
    replacement: "Perte détectée",
    reason: "The French label carries the same eyewitness implication as the English one.",
  }),
  Object.freeze({
    pattern: "forêt observée",
    replacement: "forêt détectée",
    reason: "Catches the longer French phrasing, which the short label pattern misses.",
  }),
  Object.freeze({
    pattern: "forestière observée",
    replacement: "forestière détectée",
    reason: "Catches the adjectival French phrasing used in prose.",
  }),
  Object.freeze({
    pattern: "Forest change map",
    replacement: "Forest loss map",
    reason: "The layer draws loss only. There is no gain or regrowth product behind it.",
  }),
  Object.freeze({
    pattern: "changements forestiers",
    replacement: "pertes forestières",
    reason: "The French map label carried the same unearned symmetry as the English one.",
  }),
  Object.freeze({
    pattern: ": \"Forest change\"",
    replacement: ": \"Forest loss\"",
    reason: "Bans the bare layer label as an object value while leaving the forest-change route identifier alone.",
  }),
  Object.freeze({
    pattern: ": \"Changement forestier\"",
    replacement: ": \"Perte forestière\"",
    reason: "The French half of the same rule.",
  }),
]);
