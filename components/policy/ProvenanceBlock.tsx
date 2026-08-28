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
    <dl className="provenance">
      <div className="provenance-row"><dt>{LABELS.dataset[locale]}</dt><dd>{provenance.dataset}</dd></div>
      <div className="provenance-row"><dt>{LABELS.version[locale]}</dt><dd>{provenance.version}</dd></div>
      <div className="provenance-row"><dt>{LABELS.retrieved[locale]}</dt><dd>{provenance.retrievedDate}</dd></div>
      <div className="provenance-row"><dt>{LABELS.licence[locale]}</dt><dd>{provenance.licence}</dd></div>
      {provenance.recordUrl ? (
        <div className="provenance-row"><dt>{LABELS.record[locale]}</dt><dd><a href={provenance.recordUrl}>{provenance.recordUrl}</a></dd></div>
      ) : null}
    </dl>
  );
}
