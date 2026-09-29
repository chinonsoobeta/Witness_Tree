import { EVIDENCE_CLASSES, EVIDENCE_DEFINITIONS, type EvidenceClass, type Locale } from "@/lib/domain";

/*
 * A key for the evidence marks, placed beside the figures that carry them.
 *
 * It replaces the row of four tinted chips that stood under the title of every
 * page, including pages with no marked figure on them. A key explains the marks
 * in front of the reader, so it lists only the classes the caller says are
 * shown, in the canonical order. The full definitions stay on the home page and
 * in the glossary.
 */
const GLYPH: Record<EvidenceClass, string> = {
  "official-record": "mark-glyph mark-glyph--record",
  "satellite-observation": "mark-glyph mark-glyph--satellite",
  "derived-estimate": "mark-glyph mark-glyph--derived",
  unknown: "mark-glyph mark-glyph--unknown",
};

export function EvidenceKey({
  locale,
  classes,
}: Readonly<{ locale: Locale; classes: readonly EvidenceClass[] }>) {
  const shown = EVIDENCE_CLASSES.filter((evidence) => classes.includes(evidence));
  if (shown.length === 0) return null;
  const title = locale === "en" ? "Key" : "Légende";
  return (
    <p className="evidence-key">
      <span className="evidence-key-title">{title}</span>
      {shown.map((evidence) => (
        <span className="evidence-key-item" key={evidence}>
          <span className={GLYPH[evidence]} aria-hidden="true" />
          {EVIDENCE_DEFINITIONS[evidence].label[locale]}
        </span>
      ))}
    </p>
  );
}
