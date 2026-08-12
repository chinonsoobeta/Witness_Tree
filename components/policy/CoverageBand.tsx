import { COVERAGE_LABELS, type CoverageGrade, type Locale } from "@/lib/domain";

export type CoverageBandProps = Readonly<{
  coverageGrade: CoverageGrade;
  locale: Locale;
}>;

export function CoverageBand({ coverageGrade, locale }: CoverageBandProps) {
  return <span>{COVERAGE_LABELS[coverageGrade][locale]}</span>;
}
