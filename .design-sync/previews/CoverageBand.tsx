import type { ReactNode } from "react";
import { CoverageBand } from "witness-tree";

// The five grades of COVERAGE_GRADES (lib/domain/coverage.ts), in the order
// coverageGradeForPoint can return them. The band never abbreviates the grade,
// so the sweep is also the layout test: "Extended record, sparse official
// matching" is the longest label in either language.
const GRADES = [
  "enhanced-local-records",
  "national-baseline-plus-local-context",
  "national-baseline",
  "extended-record-sparse-official-matching",
  "not-applicable",
] as const;

const Row = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", maxWidth: "52rem" }}>
    {children}
  </div>
);

// ExploreView renders the band after its own label ("Coverage" / "Couverture",
// components/explore/ExploreView.tsx), never on its own, so the canonical cell
// keeps that framing.
export const InEventDetails = () => (
  <p style={{ margin: 0 }}>
    Coverage: <CoverageBand coverageGrade="national-baseline" locale="en" />
  </p>
);

export const AllGrades = () => (
  <Row>
    {GRADES.map((grade) => <CoverageBand key={grade} coverageGrade={grade} locale="en" />)}
  </Row>
);

export const AllGradesFrench = () => (
  <Row>
    {GRADES.map((grade) => <CoverageBand key={grade} coverageGrade={grade} locale="fr" />)}
  </Row>
);
