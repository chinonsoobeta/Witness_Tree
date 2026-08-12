import type { Locale, Provenance } from "@/lib/domain";

export type ProvenanceBlockProps = Readonly<{
  provenance: Provenance;
  locale: Locale;
}>;

const LABELS = {
  dataset: { en: "Dataset", fr: "Jeu de données" },
  version: { en: "Version", fr: "Version" },
  retrieved: { en: "Retrieved", fr: "Récupéré" },
  licence: { en: "Licence", fr: "Licence" },
  record: { en: "Record", fr: "Registre" },
} as const;

export function ProvenanceBlock({ provenance, locale }: ProvenanceBlockProps) {
  return (
    <dl>
      <div><dt>{LABELS.dataset[locale]}</dt><dd>{provenance.dataset}</dd></div>
      <div><dt>{LABELS.version[locale]}</dt><dd>{provenance.version}</dd></div>
      <div><dt>{LABELS.retrieved[locale]}</dt><dd>{provenance.retrievedDate}</dd></div>
      <div><dt>{LABELS.licence[locale]}</dt><dd>{provenance.licence}</dd></div>
      {provenance.recordUrl ? (
        <div><dt>{LABELS.record[locale]}</dt><dd><a href={provenance.recordUrl}>{provenance.recordUrl}</a></dd></div>
      ) : null}
    </dl>
  );
}
