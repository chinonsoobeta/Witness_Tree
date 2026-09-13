import { EVIDENCE_CLASSES, type Locale } from "@/lib/domain";
import { EvidenceChip } from "./EvidenceChip";

export function EvidenceLegend({ locale }: Readonly<{ locale: Locale }>) {
  return (
    <ul className="evidence-legend" aria-label={locale === "en" ? "Evidence classes" : "Catégories de preuves"}>
      {EVIDENCE_CLASSES.map((evidence) => <li key={evidence}><EvidenceChip evidence={evidence} locale={locale} /></li>)}
    </ul>
  );
}
