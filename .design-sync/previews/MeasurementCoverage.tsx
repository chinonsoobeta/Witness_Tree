import type { ReactNode } from "react";
import { MeasurementCoverage } from "witness-tree";

/*
 * A one-line component with a decision inside it: when a place carries an
 * explicit measurementCoverage it states that in words, and otherwise it falls
 * back to the CoverageBand for the coverage grade. Both branches matter, because
 * the fallback is what keeps a place with no coverage statement from reading as
 * though coverage were complete.
 *
 * The three measurementCoverage values and the fallback are the whole surface, so
 * one cell per language shows all four side by side.
 */
const MEASURED = ["complete", "partial-with-unknown", "none-mapped"] as const;

const Row = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", maxWidth: "56rem" }}>
    {children}
  </div>
);

const Stack = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>{children}</div>
);

const measured = (value: (typeof MEASURED)[number]) => ({
  coverageGrade: "national-baseline" as const,
  measurementCoverage: value,
});

/** No measurementCoverage at all, so the component falls through to CoverageBand. */
const unmeasured = { coverageGrade: "extended-record-sparse-official-matching" as const };

export const English = () => (
  <Stack>
    <Row>
      {MEASURED.map((value) => (
        <MeasurementCoverage key={value} place={measured(value)} locale="en" />
      ))}
    </Row>
    <Row>
      <MeasurementCoverage place={unmeasured} locale="en" />
    </Row>
  </Stack>
);

export const French = () => (
  <Stack>
    <Row>
      {MEASURED.map((value) => (
        <MeasurementCoverage key={value} place={measured(value)} locale="fr" />
      ))}
    </Row>
    <Row>
      <MeasurementCoverage place={unmeasured} locale="fr" />
    </Row>
  </Stack>
);
