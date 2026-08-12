import type { CoveragePointQuery } from "./types";
export const coverageFixtures: readonly CoveragePointQuery[] = [
  { province: "BC", latitude: 50, year: 2020, boundaryEdition: "example-2023", periods: [{ startYear: 2000, endYear: 2025, grade: "enhanced-local-records", containsPoint: true }] },
  { province: "AB", latitude: 50, year: 2020, boundaryEdition: "example-2023", periods: [{ startYear: 2000, endYear: 2025, grade: "national-baseline-plus-local-context", containsPoint: true }] },
  { province: "ON", latitude: 50, year: 1990, boundaryEdition: "example-2023" },
  { province: "QC", latitude: 53, year: 2020, boundaryEdition: "example-2023", periods: [{ startYear: 2000, endYear: 2025, grade: "enhanced-local-records", containsPoint: true }] },
];
