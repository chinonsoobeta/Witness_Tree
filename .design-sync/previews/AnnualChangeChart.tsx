import { AnnualChangeChart } from "witness-tree";
import { PLACES } from "witness-tree/lib/places";

/*
 * The component owns both renderings of one series and switches on `view`, so
 * the variant axis is chart against table rather than any data difference. Both
 * cells read the same illustrative watershed record, which is what makes the
 * pair legible as two views of one thing.
 *
 * The bars, axis and value labels are all stylesheet-driven (.annual-bar,
 * .annual-axis, .annual-value), so this card is also where a token change to the
 * chart palette shows up.
 */
const PLACE = PLACES[0];

export const Chart = () => (
  <AnnualChangeChart annual={PLACE.annual} locale="en" view="chart" />
);

export const Table = () => (
  <AnnualChangeChart annual={PLACE.annual} locale="en" view="table" />
);

export const TableFrench = () => (
  <AnnualChangeChart annual={PLACE.annual} locale="fr" view="table" />
);
