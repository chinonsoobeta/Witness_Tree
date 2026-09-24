import type { ReactNode } from "react";
import { PlaceFinder } from "witness-tree";

/*
 * PlaceFinder holds no result data of its own to pass in: it calls
 * searchPlaces() over lib/places, whose records are deliberately illustrative
 * ("Illustrative British Columbia watershed"), and the component's own empty
 * copy says so ("No illustrative place record matches this query."). The only
 * fixture a card can supply is therefore the query, so each cell is a real
 * query a reader would type and the state it actually produces.
 */

/**
 * Matches one illustrative watershed record in each of the four provinces the
 * place records cover, which is the result list a card can show whole: a
 * province name matches all nine records for that province and overruns the
 * 900x700 story viewport.
 */
const QUERY_EN = "watershed";

/** The same four records reached through their French names. */
const QUERY_FR = "bassin versant";

/**
 * A real Canadian city outside the four provinces the place records cover, so
 * the search resolves to the no-match note rather than to a result list.
 */
const OUT_OF_COVERAGE = "Yellowknife";

const Frame = ({ children }: { children: ReactNode }) => (
  <div style={{ maxWidth: "40rem" }}>{children}</div>
);

export const Results = () => (
  <Frame>
    <PlaceFinder locale="en" query={QUERY_EN} />
  </Frame>
);

export const NoMatch = () => (
  <Frame>
    <PlaceFinder locale="en" query={OUT_OF_COVERAGE} />
  </Frame>
);

export const Prompt = () => (
  <Frame>
    <PlaceFinder locale="en" query="" />
  </Frame>
);

export const French = () => (
  <Frame>
    <PlaceFinder locale="fr" query={QUERY_FR} />
  </Frame>
);
