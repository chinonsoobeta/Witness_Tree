import { formatHectares, formatPercent, type Reported, type CoverageGrade, type Locale } from "@/lib/domain";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { CoverageBand } from "./CoverageBand";
import { EvidenceChip } from "./EvidenceChip";
import { ProvenanceBlock } from "./ProvenanceBlock";

const PROVENANCE_SUMMARY = {
  en: "Source details",
  fr: "Détails de la source",
} as const;

export type ReportedValueProps = Readonly<{
  reported: Reported;
  coverageGrade: CoverageGrade;
  locale: Locale;
}>;

// Areas and shares read in the reader's number format; a count or a year is shown as recorded.
function figureText(reported: Extract<Reported, { kind: "figure" }>, locale: Locale) {
  if (reported.unit === "ha") return formatHectares(reported.value, locale);
  if (reported.unit === "%") return formatPercent(reported.value, locale);
  return `${reported.value} ${reported.unit}`;
}

export function ReportedValue({ reported, coverageGrade, locale }: ReportedValueProps) {
  if (reported.kind === "unknown") {
    const reason = reported.reason[locale];
    return (
      <section className="reported reported--unknown">
        <output className="reported-figure reported-figure--unknown" aria-label={reason}>– {reason}</output>
        <EvidenceChip evidence={reported.evidence} locale={locale} />
        <CoverageBand coverageGrade={coverageGrade} locale={locale} />
      </section>
    );
  }

  return (
    <section className={`reported reported--${reported.evidence}`}>
      <output className="reported-figure">{figureText(reported, locale)}</output>
      <EvidenceChip evidence={reported.evidence} locale={locale} />
      <ConfidenceBadge confidence={reported.confidence} locale={locale} />
      <CoverageBand coverageGrade={coverageGrade} locale={locale} />
      <details className="reported-provenance">
        <summary>{PROVENANCE_SUMMARY[locale]}</summary>
        <ProvenanceBlock provenance={reported.provenance} locale={locale} />
      </details>
    </section>
  );
}
