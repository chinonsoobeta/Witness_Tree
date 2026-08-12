/**
 * Preflight only: this module intentionally performs no network or download work.
 * A ready result is permission to plan a controlled acquisition, never permission
 * to ingest or publish a source.
 */

export const LARGE_SOURCE_BYTES = 100 * 1024 * 1024;

export type CandidateSource = Readonly<{
  status: "candidate";
  productionEligible: boolean;
  licence?: Readonly<{ state: "verified" | "unresolved"; id?: string; officialUrl?: string }>;
  access?: Readonly<{ state: "verified" | "catalogue-listed"; url?: string; formats?: readonly string[] }>;
}>;

export type AcquisitionMetadata = Readonly<{
  expectedByteSize: number;
  format: string;
  storageReviewed: boolean;
  computeReviewed: boolean;
}>;

export type AcquisitionBlocker =
  | "candidate-status-required"
  | "verified-licence-required"
  | "exact-access-url-required"
  | "format-must-match-access"
  | "expected-byte-size-required"
  | "large-source-storage-review-required"
  | "large-source-compute-review-required";

export type AcquisitionPreflight = Readonly<{
  status: "ready" | "blocked";
  reasons: readonly AcquisitionBlocker[];
  /** Always false: retrieval review cannot authorize ingestion or publication. */
  ingestable: false;
}>;

function isHttpsUrl(value: unknown): value is string {
  try {
    return typeof value === "string" && new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Evaluates supplied metadata only; it never fetches, downloads, or stores data. */
export function preflightSourceAcquisition(candidate: CandidateSource, metadata: AcquisitionMetadata): AcquisitionPreflight {
  const reasons: AcquisitionBlocker[] = [];
  if (candidate.status !== "candidate") reasons.push("candidate-status-required");

  const licence = candidate.licence;
  if (licence?.state !== "verified" || !licence.id?.trim() || !isHttpsUrl(licence.officialUrl)) reasons.push("verified-licence-required");

  const access = candidate.access;
  if (access?.state !== "verified" || !isHttpsUrl(access.url)) reasons.push("exact-access-url-required");
  if (!metadata.format.trim() || !access?.formats?.some((format) => format.toLowerCase() === metadata.format.toLowerCase())) reasons.push("format-must-match-access");

  if (!Number.isSafeInteger(metadata.expectedByteSize) || metadata.expectedByteSize <= 0) reasons.push("expected-byte-size-required");
  if (metadata.expectedByteSize >= LARGE_SOURCE_BYTES && !metadata.storageReviewed) reasons.push("large-source-storage-review-required");
  if (metadata.expectedByteSize >= LARGE_SOURCE_BYTES && !metadata.computeReviewed) reasons.push("large-source-compute-review-required");

  return Object.freeze({ status: reasons.length === 0 ? "ready" : "blocked", reasons: Object.freeze(reasons), ingestable: false });
}
