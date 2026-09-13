import { ProvenanceBlock } from "witness-tree";

// Real ledger entries: dataset names, versions and licence ids the site
// actually cites. recordUrl is optional, and the last row only appears when
// it is present, so both shapes need a cell.
const NTEMS = {
  dataset: "NTEMS Forest Change 1984-2022",
  version: "2024-08",
  retrievedDate: "2026-02-14",
  licence: "ogl-canada-2.0",
  recordUrl: "https://opendata.nfis.org/mapserver/nfis-change_eng.html",
} as const;

const BC_FTEN = {
  dataset: "BC FTEN Harvest Authority",
  version: "2026-01-30",
  retrievedDate: "2026-01-31",
  licence: "ogl-bc-2.0",
} as const;

export const WithRecordLink = () => <ProvenanceBlock provenance={NTEMS} locale="en" />;

export const WithoutRecordLink = () => <ProvenanceBlock provenance={BC_FTEN} locale="en" />;

export const French = () => <ProvenanceBlock provenance={NTEMS} locale="fr" />;
