import { EVIDENCE_DEFINITIONS, type EvidenceClass, type Locale } from "@/lib/domain";

const EVIDENCE_SHAPES: Record<EvidenceClass, string> = {
  "official-record": "■",
  "satellite-observation": "●",
  "derived-estimate": "▲",
  unknown: "○",
};

export type EvidenceChipProps = Readonly<{
  evidence: EvidenceClass;
  locale: Locale;
}>;

export function EvidenceChip({ evidence, locale }: EvidenceChipProps) {
  return (
    <span data-evidence={evidence} aria-label={EVIDENCE_DEFINITIONS[evidence].label[locale]}>
      <span data-evidence-shape aria-hidden="true">{EVIDENCE_SHAPES[evidence]} </span>
      <span data-evidence-label>{EVIDENCE_DEFINITIONS[evidence].label[locale]}</span>
    </span>
  );
}
