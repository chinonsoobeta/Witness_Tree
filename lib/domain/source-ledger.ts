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

/**
 * The illustrative/candidate metadata common to all ledger rows. It is not an
 * ingestion or release approval. `terms-pending` remains available here so an
 * unresolved candidate can be recorded without being silently admitted.
 */
export type CandidateSourceLedgerEntry = SourceLedgerEntry;

export type RedistributionStatus = "redistribution-permitted";
export type AdmissionState = "admitted";
export type OriginalLanguage = "en" | "fr" | "bilingual" | "other";
export type NextExpectedRefresh =
  | Readonly<{ status: "scheduled"; date: string }>
  | Readonly<{ status: "unknown"; reason: LocalizedString }>;
export type LedgerPosition = readonly [longitude: number, latitude: number];
export type LedgerPolygon = Readonly<{ type: "Polygon"; coordinates: readonly (readonly LedgerPosition[])[] }>;
export type LedgerMultiPolygon = Readonly<{ type: "MultiPolygon"; coordinates: readonly (readonly (readonly LedgerPosition[])[])[] }>;
export type CoverageLimit =
  | Readonly<{ status: "geometry"; geometry: LedgerPolygon | LedgerMultiPolygon }>
  | Readonly<{ status: "unavailable"; reason: LocalizedString }>;

/**
 * The only ledger row shape that may cross the source-admission boundary.
 * Keep this deliberately flat: every value is a required, reviewable record.
 */
export type AdmissibleSourceLedgerEntry = Readonly<{
  status: "admissible";
  id: string;
  publisher: string;
  datasetNameOriginal: string;
  originalLanguage: OriginalLanguage;
  explanation: LocalizedString;
  catalogueUrl: string;
  sourceUrl: string;
  licenceId: Exclude<LicenceId, "terms-pending">;
  licenceUrl: string;
  edition: string;
  sourceVersion: string;
  effectiveDate: string;
  retrievedAt: string;
  rawChecksumSha256: string;
  archiveVersion: string;
  updateCadence: string;
  nextExpectedRefresh: NextExpectedRefresh;
  redistributionTerms: string;
  bulkRedistributionStatus: "bulk-republication-permitted" | "bulk-republication-prohibited";
  coverage: CoverageLimit;
  schemaSummary: string;
  transformations: string;
  requiredAttribution: string;
  redistributionStatus: RedistributionStatus;
  modificationNotice: string;
  correctionsContact: string;
  admissionState: AdmissionState;
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

const ADMISSIBLE_STRING_FIELDS: ReadonlyArray<keyof AdmissibleSourceLedgerEntry> = [
  "id",
  "publisher",
  "datasetNameOriginal",
  "catalogueUrl",
  "sourceUrl",
  "licenceUrl",
  "edition",
  "sourceVersion",
  "effectiveDate",
  "retrievedAt",
  "rawChecksumSha256",
  "archiveVersion",
  "updateCadence",
  "redistributionTerms",
  "schemaSummary",
  "transformations",
  "requiredAttribution",
  "modificationNotice",
  "correctionsContact",
];

function requiredIsoDate(value: unknown, field: string): string {
  const parsed = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Admissible source requires a valid ${field}.`);
  }
  return value;
}

function requiredTimestamp(value: unknown): string {
  const parsed = typeof value === "string" ? new Date(value) : null;
  const canonical = typeof value === "string" && !value.includes(".") ? value.replace(/Z$/, ".000Z") : value;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString() !== canonical) {
    throw new Error("Admissible source requires a valid retrievedAt.");
  }
  return value;
}

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function isCorrectionsContact(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (isHttpsUrl(value)) return true;
  if (!value.startsWith("mailto:")) return false;
  const address = value.slice("mailto:".length).split("?")[0]?.trim() ?? "";
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address);
}

function validateCoverageLimit(coverage: CoverageLimit | undefined): void {
  if (!coverage || (coverage.status !== "geometry" && coverage.status !== "unavailable")) throw new Error("An admissible source requires coverage geometry or an explicit unavailable reason.");
  if (coverage.status === "unavailable") {
    if (!coverage.reason.en.trim() || !coverage.reason.fr.trim()) throw new Error("Unavailable coverage requires a bilingual reason.");
    return;
  }
  const polygons = coverage.geometry?.type === "Polygon"
    ? [coverage.geometry.coordinates]
    : coverage.geometry?.type === "MultiPolygon" ? coverage.geometry.coordinates : undefined;
  if (!polygons?.length) throw new Error("Coverage geometry must be a Polygon or MultiPolygon.");
  for (const polygon of polygons) {
    if (!polygon.length) throw new Error("Coverage geometry requires an outer ring.");
    for (const ring of polygon) {
      if (ring.length < 4 || ring.some((position) => position.length !== 2 || !position.every(Number.isFinite) || Math.abs(position[0]!) > 180 || Math.abs(position[1]!) > 90)) throw new Error("Coverage geometry requires finite longitude/latitude rings.");
      const first = ring[0]!;
      const last = ring[ring.length - 1]!;
      if (first[0] !== last[0] || first[1] !== last[1]) throw new Error("Coverage geometry rings must be closed.");
    }
  }
}

function validateNextExpectedRefresh(value: NextExpectedRefresh | undefined): void {
  if (value?.status === "scheduled") {
    requiredIsoDate(value.date, "nextExpectedRefresh.date");
    return;
  }
  if (value?.status === "unknown" && value.reason.en.trim() && value.reason.fr.trim()) return;
  throw new Error("An admissible source requires a scheduled next refresh or a bilingual Unknown reason.");
}

/** Rejects any source whose exact rights and lineage have not been admitted. */
export function validateAdmissibleSourceLedgerEntry(
  candidate: Partial<AdmissibleSourceLedgerEntry>,
): AdmissibleSourceLedgerEntry {
  for (const field of ADMISSIBLE_STRING_FIELDS) {
    const value = candidate[field];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Admissible source ledger field is required: ${field}`);
    }
  }
  if (!candidate.explanation?.en.trim() || !candidate.explanation.fr.trim()) {
    throw new Error("An admissible source requires a reviewed bilingual explanation.");
  }
  if (candidate.originalLanguage !== "en" && candidate.originalLanguage !== "fr" && candidate.originalLanguage !== "bilingual" && candidate.originalLanguage !== "other") {
    throw new Error("An admissible source requires its original-language designation.");
  }
  if (candidate.status !== "admissible") throw new Error("An admissible source must have admissible status.");
  const licenceId = candidate.licenceId as LicenceId | undefined;
  if (!licenceId || licenceId === "terms-pending" || !LICENCE_IDS.includes(licenceId)) {
    throw new Error("An admissible source requires an exact, resolved licence identifier.");
  }
  if (![candidate.catalogueUrl, candidate.sourceUrl, candidate.licenceUrl].every(isHttpsUrl)) {
    throw new Error("An admissible source requires HTTPS catalogue, source, and licence URLs.");
  }
  requiredIsoDate(candidate.effectiveDate, "effectiveDate");
  validateNextExpectedRefresh(candidate.nextExpectedRefresh);
  requiredTimestamp(candidate.retrievedAt);
  if (!/^[a-f0-9]{64}$/i.test(candidate.rawChecksumSha256 ?? "")) {
    throw new Error("An admissible source requires a SHA-256 raw checksum.");
  }
  if (candidate.redistributionStatus !== "redistribution-permitted") {
    throw new Error("An admissible source requires an explicit redistribution-permitted status.");
  }
  if (candidate.bulkRedistributionStatus !== "bulk-republication-permitted" && candidate.bulkRedistributionStatus !== "bulk-republication-prohibited") {
    throw new Error("An admissible source requires an explicit bulk-republication status.");
  }
  validateCoverageLimit(candidate.coverage);
  if (!isCorrectionsContact(candidate.correctionsContact)) throw new Error("An admissible source requires a valid HTTPS or mailto corrections contact.");
  if (candidate.admissionState !== "admitted") {
    throw new Error("An admissible source requires an admitted admission state.");
  }
  return Object.freeze({ ...candidate } as AdmissibleSourceLedgerEntry);
}
