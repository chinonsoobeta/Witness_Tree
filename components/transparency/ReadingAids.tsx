import type { Locale } from "@/lib/domain";

/*
 * Methods is the way in to the three small pages that help a reader with the
 * figures: the glossary, how figures are marked, and what the record cannot
 * see (audit 2026-11-10, L5). Each page keeps its own address; this row only
 * links them to each other. The page the reader is on is named, not linked.
 */
export type ReadingAid = "methods" | "glossary" | "marks" | "unknown";

const AIDS: Record<Locale, { label: string; links: readonly (readonly [ReadingAid, string, string])[] }> = {
  en: {
    label: "Reading aids",
    links: [
      ["methods", "Methods", "/en/methods"],
      ["glossary", "Glossary", "/en/glossary"],
      ["marks", "How figures are marked", "/en/components"],
      ["unknown", "What the record cannot see", "/en/unknown"],
    ],
  },
  fr: {
    label: "Aides à la lecture",
    links: [
      ["methods", "Méthodes", "/fr/methodes"],
      ["glossary", "Glossaire", "/fr/glossaire"],
      ["marks", "Comment les chiffres sont marqués", "/fr/composants"],
      ["unknown", "Ce que le registre ne peut pas voir", "/fr/inconnu"],
    ],
  },
};

export function ReadingAids({ locale, current }: Readonly<{ locale: Locale; current: ReadingAid }>) {
  const aids = AIDS[locale];
  return (
    <nav className="reading-aids" aria-label={aids.label}>
      <p className="reading-aids-label" aria-hidden="true">{aids.label}</p>
      <ul>
        {aids.links.map(([id, label, href]) => (
          <li key={id}>
            {id === current ? <span aria-current="page">{label}</span> : <a href={href}>{label}</a>}
          </li>
        ))}
      </ul>
    </nav>
  );
}
