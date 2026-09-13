import { ComponentGallery } from "witness-tree";

// The gallery is itself the design system's own card: it mounts EvidenceChip,
// ConfidenceBadge, CoverageBand and ReportedValue side by side in a light
// panel and a dark panel, with its own fixture data. Its canonical cell is
// therefore the whole gallery; the French cell is the natural second, because
// the evidence and coverage labels are materially longer in French.

export const English = () => <ComponentGallery locale="en" />;

export const French = () => <ComponentGallery locale="fr" />;
