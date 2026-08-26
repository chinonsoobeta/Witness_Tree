import type { CoverageFeature, CoveragePointQuery } from "./types";

/** Illustrative geometry only; it is not a real national coverage layer. */
export const coverageFeatures: readonly CoverageFeature[] = [
  {
    id: "example-bc-enhanced",
    boundaryEdition: "example-2023",
    startYear: 2000,
    endYear: 2025,
    grade: "enhanced-local-records",
    geometry: { type: "Polygon", coordinates: [[[-126, 49], [-124, 49], [-124, 51], [-126, 51], [-126, 49]]] },
  },
  {
    id: "example-ab-context",
    boundaryEdition: "example-2023",
    startYear: 2000,
    endYear: 2025,
    grade: "national-baseline-plus-local-context",
    geometry: { type: "Polygon", coordinates: [[[-114, 49], [-112, 49], [-112, 51], [-114, 51], [-114, 49]]] },
  },
];
export const coverageFixtures: readonly CoveragePointQuery[] = [
  { province: "BC", longitude: -125, latitude: 50, year: 2020, boundaryEdition: "example-2023", features: coverageFeatures },
  { province: "AB", longitude: -113, latitude: 50, year: 2020, boundaryEdition: "example-2023", features: coverageFeatures },
  { province: "ON", longitude: -80, latitude: 50, year: 1990, boundaryEdition: "example-2023" },
  { province: "QC", longitude: -72, latitude: 53, year: 2020, boundaryEdition: "example-2023", features: coverageFeatures },
];
