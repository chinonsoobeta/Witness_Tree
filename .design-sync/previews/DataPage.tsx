import { DataPage } from "witness-tree";

// DataPage takes only a locale: the download release, its SHA-256 artifacts,
// the source-currency table and the licence attribution all come from the
// repo's own release and probe records. The only real axis is language, and
// the French cell is where the long attribution paragraphs stress the measure.

export const English = () => <DataPage locale="en" />;

export const French = () => <DataPage locale="fr" />;
