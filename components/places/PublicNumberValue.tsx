import type { Locale } from "@/lib/domain";
import type { PublicNumber, PublicNumberUnit } from "@/lib/places";
import { ConfidenceBadge, CoverageBand, EvidenceChip, ProvenanceBlock } from "@/components/policy";

const units: Record<PublicNumberUnit, Readonly<Record<Locale, string>>> = {
  ha: { en: "ha", fr: "ha" }, "%": { en: "%", fr: "%" }, count: { en: "", fr: "" }, year: { en: "", fr: "" },
  "degrees-latitude": { en: "° latitude", fr: "° latitude" }, "degrees-longitude": { en: "° longitude", fr: "° longitude" }, m: { en: "m", fr: "m" },
};

export function PublicNumberValue({ value, locale }: Readonly<{ value: PublicNumber; locale: Locale }>) {
  const output = value.kind === "unknown"
    ? <output aria-label={value.reason[locale]}>— {value.reason[locale]}</output>
    : <output>{new Intl.NumberFormat(locale === "en" ? "en-CA" : "fr-CA", { maximumFractionDigits: 6 }).format(value.value)} {units[value.unit][locale]}</output>;
  return <section className="public-number">{output}<EvidenceChip evidence={value.evidence} locale={locale} />{value.kind === "figure" ? <ConfidenceBadge confidence={value.confidence} locale={locale} /> : null}<CoverageBand coverageGrade={value.coverageGrade} locale={locale} /><ProvenanceBlock provenance={value.provenance} locale={locale} /></section>;
}
