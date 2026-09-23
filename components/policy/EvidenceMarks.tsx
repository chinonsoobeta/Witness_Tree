import { EVIDENCE_CLASSES, EVIDENCE_DEFINITIONS, type EvidenceClass, type Locale } from "@/lib/domain";

/*
 * The four marks, said once.
 *
 * The landing page used to carry the evidence chips near the top and a
 * definition list of the same four classes several screens below, in
 * different words. A reader who met both learned the classes twice and had
 * no way to tell whether the two lists were the same list. They were.
 *
 * This is the definition list, with the chip's mark drawn beside each class
 * so the glyph a figure carries and the sentence that explains it sit
 * together. The chips remain on every other surface, where they annotate a
 * figure rather than teach the vocabulary.
 *
 * The mark is a shape, not a colour: square, circle, triangle and ring
 * survive greyscale printing and forced-colours mode, which a hue does not.
 */

const GLYPH: Record<EvidenceClass, string> = {
  "official-record": "mark-glyph mark-glyph--record",
  "satellite-observation": "mark-glyph mark-glyph--satellite",
  "derived-estimate": "mark-glyph mark-glyph--derived",
  unknown: "mark-glyph mark-glyph--unknown",
};

const MEANING: Record<EvidenceClass, Record<Locale, string>> = {
  "official-record": {
    en: "A public agency recorded it, such as a harvest, a fire or who held a licence.",
    fr: "Un organisme public l’a consigné, par exemple une récolte, un incendie ou le titulaire d’un permis.",
  },
  "satellite-observation": {
    en: "Satellite images show trees lost or growing back. Images alone can’t tell us why.",
    fr: "Les images satellites montrent des arbres perdus ou qui repoussent. Les images seules ne disent pas pourquoi.",
  },
  "derived-estimate": {
    en: "A number calculated from documented records, using a published method.",
    fr: "Un chiffre calculé à partir de registres documentés, selon une méthode publiée.",
  },
  unknown: {
    en: "We don’t yet have an official public record that answers this.",
    fr: "Nous n’avons pas encore de registre public officiel qui répond à cette question.",
  },
};

export function EvidenceMarks({ locale }: Readonly<{ locale: Locale }>) {
  return (
    <dl
      className="evidence-marks"
      aria-label={locale === "en" ? "Evidence classes" : "Catégories de preuves"}
    >
      {EVIDENCE_CLASSES.map((evidence) => (
        <div className="evidence-mark" key={evidence}>
          <dt>
            <span className={GLYPH[evidence]} aria-hidden="true" />
            {EVIDENCE_DEFINITIONS[evidence].label[locale]}
          </dt>
          <dd>{MEANING[evidence][locale]}</dd>
        </div>
      ))}
    </dl>
  );
}
