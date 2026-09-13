import type { Locale } from "@/lib/domain";
import { EvidenceChip } from "@/components/policy";

export function NoRecordResult({ locale, reason }: Readonly<{ locale: Locale; reason: string }>) {
  return (
    <div className="no-record-result">
      <EvidenceChip evidence="unknown" locale={locale} />
      <p className="no-record-reason"><strong>– {reason}</strong></p>
      <p>{locale === "en"
        ? "This is a limit of the available record, not evidence that no event occurred."
        : "Il s’agit d’une limite du registre disponible, et non d’une preuve qu’aucun événement n’a eu lieu."}</p>
      <a href={locale === "en" ? "/en/methods" : "/fr/methodes"}>
        {locale === "en" ? "How to read missing records" : "Comment interpréter les registres manquants"}
      </a>
    </div>
  );
}
