import { RankedRidingsTable } from "witness-tree";
import { comparisonContext, rankedRidingFixtures } from "witness-tree/lib/comparison";

/*
 * The ranking surface, and the component that carries most of the app's honesty
 * rules at once. It refuses to rank a riding it cannot rank and files it under an
 * explicit reason instead: no mapped coverage, partial coverage with unknown area
 * remaining, or a forested area below the ranking floor. The component throws if
 * any unranked row lacks one of those reasons, so a design that drops the
 * unranked tables is not a styling change, it is a different claim.
 *
 * The illustrative rows are built to exercise that: two rank normally and
 * "Example Sparse" falls below the floor at 100 forested hectares. The collapsed
 * context panel above the table carries the time range, boundary edition, data
 * version, denominator definition and method, which is where the ranking states
 * what it is a ranking of.
 */
export const HighestFirst = () => (
  <RankedRidingsTable
    rows={rankedRidingFixtures}
    context={comparisonContext}
    locale="en"
    sort="share-desc"
  />
);

/** The sort control is a real page state, not decoration: the order inverts. */
export const LowestFirst = () => (
  <RankedRidingsTable
    rows={rankedRidingFixtures}
    context={comparisonContext}
    locale="en"
    sort="share-asc"
  />
);

export const French = () => (
  <RankedRidingsTable
    rows={rankedRidingFixtures}
    context={comparisonContext}
    locale="fr"
    sort="share-desc"
  />
);
