import { PlacePage } from "witness-tree";
import { placeById, PLACES } from "witness-tree/lib/places";

/*
 * The whole record page for one geography: masthead, boundary and denominator
 * stats, coverage shares, the reported-value stack, the annual chart, sources
 * and citation. It reads the illustrative place records, so every figure and
 * dataset name on the card is one the repo actually ships.
 *
 * Two things make the variant axis worth the cells. `view` switches the embedded
 * AnnualChangeChart between chart and table, and reserve and treaty-area records
 * carry a `safeguard` that no other place type has: a notice stating the example
 * does not speak for rights holders. A design built from this component must keep
 * that notice, so it gets a cell of its own rather than hiding inside a variant.
 */
const WATERSHED = PLACES.find((place) => place.type === "watershed" && place.province === "BC")!;
const RESERVE = placeById("bc-reserve")!;

export const Chart = () => <PlacePage locale="en" place={WATERSHED} view="chart" />;

export const French = () => <PlacePage locale="fr" place={WATERSHED} view="chart" />;

/** The safeguard notice only ever renders for reserve and treaty-area records. */
export const WithSafeguard = () => <PlacePage locale="en" place={RESERVE} view="table" />;
