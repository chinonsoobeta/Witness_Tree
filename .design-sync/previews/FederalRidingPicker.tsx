import { FederalRidingPicker } from "witness-tree";
import { rankedRidingFixtures } from "witness-tree/lib/comparison";

/*
 * The two-select form that chooses which pair the comparison shows. Its
 * interesting behaviour is not the form, it is what happens when the URL asks for
 * a riding this four-province comparison does not carry: rather than silently
 * substituting one, the picker renders a notice naming the riding that was asked
 * for and the one shown instead.
 *
 * So the variant axis is the notice. The default cell is the ordinary state, and
 * the fallback cells show the notice in both languages, where the French sentence
 * is materially longer and is the one that tests the layout.
 */
const RIDINGS = rankedRidingFixtures;

export const English = () => (
  <FederalRidingPicker rows={RIDINGS} locale="en" leftId="r1" rightId="r2" />
);

/** A riding id that is not in the four covered provinces. */
export const WithFallbackNotice = () => (
  <FederalRidingPicker rows={RIDINGS} locale="en" leftId="nu-rankin-inlet" rightId="r2" />
);

export const WithFallbackNoticeFrench = () => (
  <FederalRidingPicker rows={RIDINGS} locale="fr" leftId="nu-rankin-inlet" rightId="r2" />
);
