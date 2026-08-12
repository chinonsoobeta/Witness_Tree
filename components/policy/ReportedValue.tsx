import type { Reported, CoverageGrade, Locale } from "@/lib/domain";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { CoverageBand } from "./CoverageBand";
import { EvidenceChip } from "./EvidenceChip";
import { ProvenanceBlock } from "./ProvenanceBlock";

export type ReportedValueProps = Readonly<{
  reported: Reported;
  coverageGrade: CoverageGrade;
  locale: Locale;
}>;

export function ReportedValue({ reported, coverageGrade, locale }: ReportedValueProps) {
  if (reported.kind === "unknown") {
    return (
      <section>
        <output aria-label={reported.reason}>— {reported.reason}</output>
        <EvidenceChip evidence={reported.evidence} locale={locale} />
        <CoverageBand coverageGrade={coverageGrade} locale={locale} />
      </section>
    );
  }

  return (
    <section>
      <output>{reported.value} {reported.unit}</output>
      <EvidenceChip evidence={reported.evidence} locale={locale} />
      <ConfidenceBadge confidence={reported.confidence} locale={locale} />
      <CoverageBand coverageGrade={coverageGrade} locale={locale} />
      <ProvenanceBlock provenance={reported.provenance} locale={locale} />
    </section>
  );
}
