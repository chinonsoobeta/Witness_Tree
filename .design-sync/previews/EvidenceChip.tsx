import type { ReactNode } from "react";
import { EvidenceChip } from "witness-tree";

// The four classes of EVIDENCE_CLASSES (lib/domain/evidence.ts). Each one gets
// its own tint, edge and corner treatment plus a glyph, so the sweep is what
// proves the classes are told apart by more than colour; the labels themselves
// come from EVIDENCE_DEFINITIONS.
const CLASSES = [
  "official-record",
  "satellite-observation",
  "derived-estimate",
  "unknown",
] as const;

const Row = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", maxWidth: "52rem" }}>
    {children}
  </div>
);

// The chip is always introduced by a label in the product ("Evidence" /
// "Preuve" in components/explore/ExploreView.tsx), never dropped in bare.
export const InEventDetails = () => (
  <p style={{ margin: 0 }}>
    Evidence: <EvidenceChip evidence="official-record" locale="en" />
  </p>
);

export const AllClasses = () => (
  <Row>
    {CLASSES.map((evidence) => <EvidenceChip key={evidence} evidence={evidence} locale="en" />)}
  </Row>
);

export const AllClassesFrench = () => (
  <Row>
    {CLASSES.map((evidence) => <EvidenceChip key={evidence} evidence={evidence} locale="fr" />)}
  </Row>
);
