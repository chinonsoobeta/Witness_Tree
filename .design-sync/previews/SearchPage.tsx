import type { ReactNode } from "react";
import { SearchPage } from "witness-tree";

/*
 * SearchPage owns its own data: the places scope reads the illustrative place
 * records through PlaceFinder, and the districts scope passes the real
 * 343-district comparison to FederalDistrictFinder. So a card supplies only
 * what the route decides: the scope, the query the reader typed, and whether
 * the address lookup is answerable.
 *
 * `addressLookup` is not a caller's preference. The route sets it from the
 * worker's stamped headers, so both values are real page states: a deployment
 * with the address and district services configured offers the field, and one
 * without them withholds it rather than offering a field that cannot answer.
 */

/** Matches the four illustrative watershed records, one per covered province. */
const PLACES_QUERY = "watershed";

/** Two measured districts in the Southern Interior of British Columbia. */
const DISTRICTS_QUERY = "Kootenay";

/** A single district, the shape a reader lands on from a district link. */
const SINGLE_DISTRICT_QUERY = "Vancouver Quadra";

/** A measured Saguenay district, reached through the French surface. */
const FRENCH_DISTRICT_QUERY = "Jonquière";

/*
 * The French cell withholds the address lookup on purpose. Every French string
 * on this page is longer than its English counterpart and the notice and the
 * two privacy notes each wrap to a second line, so the page with both finders
 * runs past the 900x700 story viewport and the result card falls off the card.
 * The French address field is shown on AddressFinderClient's own French cell.
 */

const Frame = ({ children }: { children: ReactNode }) => (
  <div style={{ maxWidth: "44rem" }}>{children}</div>
);

export const Places = () => (
  <Frame>
    <SearchPage locale="en" query={PLACES_QUERY} scope="places" />
  </Frame>
);

export const DistrictsWithoutAddressLookup = () => (
  <Frame>
    <SearchPage
      locale="en"
      query={DISTRICTS_QUERY}
      scope="districts"
      addressLookup={false}
    />
  </Frame>
);

export const DistrictsWithAddressLookup = () => (
  <Frame>
    <SearchPage
      locale="en"
      query={SINGLE_DISTRICT_QUERY}
      scope="districts"
      addressLookup
    />
  </Frame>
);

export const French = () => (
  <Frame>
    <SearchPage
      locale="fr"
      query={FRENCH_DISTRICT_QUERY}
      scope="districts"
      addressLookup={false}
    />
  </Frame>
);
