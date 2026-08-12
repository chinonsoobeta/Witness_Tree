import type { LocalizedString } from "./localized";

export const LICENCE_IDS = [
  "ogl-canada-2.0",
  "ogl-bc-2.0",
  "ogl-alberta",
  "ogl-ontario",
  "cc-by-4.0-quebec",
  "terms-pending",
] as const;

export type LicenceId = (typeof LICENCE_IDS)[number];

export type SourceLedgerEntry = Readonly<{
  id: string;
  datasetNameOriginal: string;
  explanation: LocalizedString;
  publisher: string;
  catalogueUrl: string;
  licenceId: LicenceId;
  attribution: string;
  sourceVersion: string;
  effectiveDate: string;
  retrievedAt: string;
  rawChecksumSha256: string;
  updateCadence: string;
  nextExpectedRefresh: string;
  redistributionTerms: string;
  coverageLimits: string;
  correctionsContact: string;
}>;

const REQUIRED_STRING_FIELDS: ReadonlyArray<keyof SourceLedgerEntry> = [
  "id",
  "datasetNameOriginal",
  "publisher",
  "catalogueUrl",
  "attribution",
  "sourceVersion",
  "effectiveDate",
  "retrievedAt",
  "rawChecksumSha256",
  "updateCadence",
  "nextExpectedRefresh",
  "redistributionTerms",
  "coverageLimits",
  "correctionsContact",
];

export function validateSourceLedgerEntry(candidate: Partial<SourceLedgerEntry>): SourceLedgerEntry {
  for (const field of REQUIRED_STRING_FIELDS) {
    const value = candidate[field];
    if (typeof value !== "string" || !value.trim()) throw new Error(`Source ledger field is required: ${field}`);
  }
  if (!candidate.explanation?.en.trim() || !candidate.explanation.fr.trim()) {
    throw new Error("Source ledger explanations require English and French.");
  }
  if (!candidate.licenceId || !LICENCE_IDS.includes(candidate.licenceId)) {
    throw new Error("A registered licence identifier is required before ingestion.");
  }
  if (!/^https:\/\//.test(candidate.catalogueUrl ?? "")) throw new Error("Catalogue URL must use HTTPS.");
  if (!/^[a-f0-9]{64}$/i.test(candidate.rawChecksumSha256 ?? "")) {
    throw new Error("Raw archive checksum must be a SHA-256 hexadecimal value.");
  }
  return Object.freeze(candidate as SourceLedgerEntry);
}
