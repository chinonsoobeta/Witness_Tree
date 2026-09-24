import type { ReactNode } from "react";
import { FederalDistrictFinder } from "witness-tree";

/*
 * Rows are real districts of the 2023 Representation Order, copied from
 * data/phase2-federal-riding-latest-comparison.json with the same field
 * shaping lib/comparison/real-adapter.ts applies: id is `federal-<boundaryId>`,
 * a complete row grades as "national-baseline" and an unmapped one as
 * "not-applicable", and a row without complete coverage carries no measured
 * loss at all. Only the district name reaches this component's markup, but the
 * measurements travel with it so the fixture stays a true row.
 */

const VANCOUVER_CENTRE = {
  id: "federal-59035",
  name: { en: "Vancouver Centre", fr: "Vancouver-Centre" },
  placeType: "federal-riding",
  detectedChangePercent: 0.030731,
  detectedChangeHectares: 0.09,
  forestedHectares: 292.86,
  coverageGrade: "national-baseline",
  measurementCoverage: "complete",
  evidence: "satellite-observation",
} as const;

const VANCOUVER_EAST = {
  id: "federal-59036",
  name: { en: "Vancouver East", fr: "Vancouver-Est" },
  placeType: "federal-riding",
  detectedChangePercent: 0,
  detectedChangeHectares: 0,
  forestedHectares: 29.61,
  coverageGrade: "national-baseline",
  measurementCoverage: "complete",
  evidence: "satellite-observation",
} as const;

const VANCOUVER_GRANVILLE = {
  id: "federal-59038",
  name: { en: "Vancouver Granville", fr: "Vancouver Granville" },
  placeType: "federal-riding",
  detectedChangePercent: 0.229095,
  detectedChangeHectares: 0.18,
  forestedHectares: 78.57,
  coverageGrade: "national-baseline",
  measurementCoverage: "complete",
  evidence: "satellite-observation",
} as const;

const VANCOUVER_KINGSWAY = {
  id: "federal-59039",
  name: { en: "Vancouver Kingsway", fr: "Vancouver Kingsway" },
  placeType: "federal-riding",
  detectedChangePercent: 0,
  detectedChangeHectares: 0,
  forestedHectares: 8.73,
  coverageGrade: "national-baseline",
  measurementCoverage: "complete",
  evidence: "satellite-observation",
} as const;

const VANCOUVER_QUADRA = {
  id: "federal-59040",
  name: { en: "Vancouver Quadra", fr: "Vancouver Quadra" },
  placeType: "federal-riding",
  detectedChangePercent: 0.513421,
  detectedChangeHectares: 5.13,
  forestedHectares: 999.18,
  coverageGrade: "national-baseline",
  measurementCoverage: "complete",
  evidence: "satellite-observation",
} as const;

const JONQUIERE = {
  id: "federal-24030",
  name: { en: "Jonquière", fr: "Jonquière" },
  placeType: "federal-riding",
  detectedChangePercent: 0.489358,
  detectedChangeHectares: 18834.84,
  forestedHectares: 3848891.58,
  coverageGrade: "national-baseline",
  measurementCoverage: "complete",
  evidence: "satellite-observation",
} as const;

const LAC_SAINT_JEAN = {
  id: "federal-24033",
  name: { en: "Lac-Saint-Jean", fr: "Lac-Saint-Jean" },
  placeType: "federal-riding",
  detectedChangePercent: 0.988768,
  detectedChangeHectares: 28522.17,
  forestedHectares: 2884617.9,
  coverageGrade: "national-baseline",
  measurementCoverage: "complete",
  evidence: "satellite-observation",
} as const;

/** Wholly urban, so the forest product maps none of it: no measured loss. */
const LAC_SAINT_LOUIS = {
  id: "federal-24034",
  name: { en: "Lac-Saint-Louis", fr: "Lac-Saint-Louis" },
  placeType: "federal-riding",
  detectedChangePercent: null,
  detectedChangeHectares: null,
  forestedHectares: 0,
  coverageGrade: "not-applicable",
  measurementCoverage: "none-mapped",
  evidence: "satellite-observation",
} as const;

const SAINT_LAURENT = {
  id: "federal-24068",
  name: { en: "Saint-Laurent", fr: "Saint-Laurent" },
  placeType: "federal-riding",
  detectedChangePercent: null,
  detectedChangeHectares: null,
  forestedHectares: 0,
  coverageGrade: "not-applicable",
  measurementCoverage: "none-mapped",
  evidence: "satellite-observation",
} as const;

const SHERBROOKE = {
  id: "federal-24072",
  name: { en: "Sherbrooke", fr: "Sherbrooke" },
  placeType: "federal-riding",
  detectedChangePercent: 1.650622,
  detectedChangeHectares: 64.35,
  forestedHectares: 3898.53,
  coverageGrade: "national-baseline",
  measurementCoverage: "complete",
  evidence: "satellite-observation",
} as const;

const ROWS = [
  VANCOUVER_CENTRE,
  VANCOUVER_EAST,
  VANCOUVER_GRANVILLE,
  VANCOUVER_KINGSWAY,
  VANCOUVER_QUADRA,
  JONQUIERE,
  LAC_SAINT_JEAN,
  LAC_SAINT_LOUIS,
  SAINT_LAURENT,
  SHERBROOKE,
];

/**
 * The explore route hands the finder every control already in the address bar
 * so submitting the district field does not silently reset the map.
 */
const EXPLORE_PARAMETERS = [
  { name: "mode", value: "cumulative" },
  { name: "presentation", value: "map" },
  { name: "data", value: "chart" },
  { name: "year", value: "2022" },
] as const;

const Frame = ({ children }: { children: ReactNode }) => (
  <div style={{ maxWidth: "40rem" }}>{children}</div>
);

export const Results = () => (
  <Frame>
    <FederalDistrictFinder
      locale="en"
      query="Vancouver"
      rows={ROWS}
      parameters={[...EXPLORE_PARAMETERS]}
    />
  </Frame>
);

export const NoMatch = () => (
  <Frame>
    <FederalDistrictFinder locale="en" query="Saskatoon West" rows={ROWS} />
  </Frame>
);

export const Prompt = () => (
  <Frame>
    <FederalDistrictFinder locale="en" query="" rows={ROWS} />
  </Frame>
);

export const French = () => (
  <Frame>
    <FederalDistrictFinder locale="fr" query="Saint" rows={ROWS} />
  </Frame>
);
