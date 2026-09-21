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
    en: "A public authority records an event, perimeter, intervention or named role.",
    fr: "Une autorité publique consigne un événement, un périmètre, une intervention ou un rôle désigné.",
  },
  "satellite-observation": {
    en: "Imagery shows tree-cover reduction or later canopy recovery. It does not, by itself, establish a cause.",
    fr: "Les images montrent une réduction du couvert arboré ou une reprise ultérieure du couvert. À elles seules, elles n’en établissent pas la cause.",
  },
  "derived-estimate": {
    en: "A calculation made from documented records and a published method.",
    fr: "Un calcul fondé sur des registres documentés et une méthode publiée.",
  },
  unknown: {
    en: "No authoritative public record has been integrated for the question.",
    fr: "Aucun registre public faisant autorité n’a été intégré pour la question.",
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
