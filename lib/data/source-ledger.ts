import { validateSourceLedgerEntry, type SourceLedgerEntry }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../domain/source-ledger.ts";

export const EXAMPLE_EVIDENCE_CLASSES = [
  "official-record",
  "satellite-observation",
  "derived-estimate",
] as const;

export type ExampleEvidenceClass = (typeof EXAMPLE_EVIDENCE_CLASSES)[number];

export type ExampleSourceLedgerEntry = SourceLedgerEntry & Readonly<{
  status: "example";
  evidenceClass: ExampleEvidenceClass;
  custodian: string;
  licenceUrl: string;
  temporalCoverage: string;
  spatialCoverage: string;
  methodTransformVersion: string;
}>;

export type ExampleSourceLedger = Readonly<{
  status: "example";
  notice: string;
  entries: readonly ExampleSourceLedgerEntry[];
}>;

const EXAMPLE_REQUIRED_FIELDS = [
  "custodian",
  "licenceUrl",
  "temporalCoverage",
  "spatialCoverage",
  "methodTransformVersion",
] as const;

export function validateExampleSourceLedgerEntry(
  candidate: Partial<ExampleSourceLedgerEntry>,
): ExampleSourceLedgerEntry {
  const entry = validateSourceLedgerEntry(candidate);
  for (const field of EXAMPLE_REQUIRED_FIELDS) {
    if (typeof candidate[field] !== "string" || !candidate[field].trim()) {
      throw new Error(`Example source ledger field is required: ${field}`);
    }
  }
  if (candidate.status !== "example") throw new Error("Example source ledger entries must be labelled example.");
  if (!EXAMPLE_EVIDENCE_CLASSES.includes(candidate.evidenceClass as ExampleEvidenceClass)) {
    throw new Error("Example source ledger entries require a supported evidence class.");
  }
  if (!/^https:\/\//.test(candidate.licenceUrl ?? "")) throw new Error("Licence URL must use HTTPS.");
  return Object.freeze({ ...entry, ...candidate } as ExampleSourceLedgerEntry);
}

export function validateExampleSourceLedger(candidate: Partial<ExampleSourceLedger>): ExampleSourceLedger {
  if (candidate.status !== "example") throw new Error("This source ledger fixture must be labelled example.");
  if (typeof candidate.notice !== "string" || !candidate.notice.trim()) {
    throw new Error("An example source ledger requires a notice.");
  }
  if (!Array.isArray(candidate.entries) || candidate.entries.length === 0) {
    throw new Error("An example source ledger requires entries.");
  }
  return Object.freeze({
    status: candidate.status,
    notice: candidate.notice,
    entries: candidate.entries.map(validateExampleSourceLedgerEntry),
  });
}
