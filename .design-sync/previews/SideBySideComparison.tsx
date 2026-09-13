import { SideBySideComparison } from "witness-tree";
import { comparisonFixtures } from "witness-tree/lib/comparison";

/*
 * Two places set against each other on four measures. The component renders the
 * same comparison two ways and the reader switches between them, so `view` is the
 * real variant axis: cards for scanning a pair, table for reading the measures
 * down a column.
 *
 * Every figure passes through the unknown guard - a null share or hectare figure
 * renders as "Unknown", never as zero - so the third cell pairs a measured place
 * with one whose figures were never computed. That is the case a design built
 * from this component has to keep intact.
 */
const [MEASURED, OTHER] = comparisonFixtures;

/** Same shape, no computed figures: the state the unknown guard exists for. */
const WITHOUT_FIGURES = {
  ...OTHER,
  id: "unmeasured",
  name: { en: "Example Unmeasured", fr: "Exemple non mesuré" },
  detectedChangePercent: null,
  detectedChangeHectares: null,
  measurementCoverage: "none-mapped" as const,
  evidence: "unknown" as const,
};

export const Cards = () => (
  <SideBySideComparison places={comparisonFixtures} locale="en" view="cards" />
);

export const Table = () => (
  <SideBySideComparison places={comparisonFixtures} locale="en" view="table" />
);

export const TableFrench = () => (
  <SideBySideComparison places={comparisonFixtures} locale="fr" view="table" />
);

export const WithUnknownFigures = () => (
  <SideBySideComparison places={[MEASURED, WITHOUT_FIGURES]} locale="en" view="table" />
);
