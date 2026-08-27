import type { LocalStagingRecord } from "./types";
// The explicit extension is required by Node's ESM resolver, which loads this
// module directly from the .mjs checkers and does not rewrite extensionless
// specifiers. tsconfig uses moduleResolution "bundler" without
// allowImportingTsExtensions, and enabling that flag repo-wide surfaces 91
// unrelated errors, so the exemption is kept to this one line.
// @ts-expect-error TS5097: intentional, and this directive fails loudly if the constraint ever lifts
import { safeSegment, validateLocalStaging } from "./validate.ts";

const SHA_256 = /^[a-f\d]{64}$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const UNKNOWN_ZERO = /\bunknown\b\s*[:=]?\s*0(?:\.0+)?\b/i;
const HTTPS = /^https:\/\/[^\s]+$/i;
const LAYER = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;

export type RecordedStagingMetadata = Readonly<{
  sourceId: string;
  sourceVersion: string;
  retrievedAt: string;
  byteLength: number;
  sha256: string;
  publisher: string;
  catalogueUrl: string;
  requestedUrl: string;
  licenceId: string;
  licenceUrl: string;
  requiredAttribution: string;
  changesNotice: string;
  localPath: string;
}>;

export type LocalAdmissionCandidate = Readonly<{
  status: "local-staging-admission-candidate";
  sourceId: string;
  sourceVersion: string;
  retrievedAt: string;
  input: Readonly<{ byteLength: number; sha256: string; localPath: string }>;
  release: Readonly<{ production: false; ingested: false; immutableObjectStorage: false }>;
  geometryEvidence: ReadonlyArray<Readonly<{
    layer: string;
    geometryType: string;
    featureCount: number;
    missingGeometryCount: number;
    emptyGeometryCount: number;
    invalidGeometryCount: number;
    invalidGeometryReasons: Readonly<Record<string, number>>;
  }>>;
}>;

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Local admission requires ${field}.`);
  return value;
}

function timestamp(value: unknown, field: string): string {
  const result = required(value, field);
  if (!UTC.test(result) || Number.isNaN(new Date(result).getTime()) || new Date(result).toISOString() !== result.replace("Z", ".000Z")) throw new Error(`Local admission requires a canonical UTC ${field}.`);
  return result;
}

function safePath(value: unknown): string {
  const result = required(value, "local path");
  if (!/^\.\.\/Witness_Tree-data\/raw\/[a-z0-9]+(?:[._-][a-z0-9]+)*\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/.test(result) || result.includes("/../") || /(?:^|[._/-])(?:current|latest)(?:$|[._/-])/i.test(result)) throw new Error("Local admission requires a safe, pinned staging path.");
  return result;
}

/**
 * Turns recorded local-staging metadata into the existing archive-staging contract.
 * It is deliberately pure: no files are read and no source is retrieved or promoted.
 */
export function recordedStagingRecord(record: RecordedStagingMetadata): LocalStagingRecord {
  return validateLocalStaging({
    storageState: "local-staging",
    immutableObjectStorage: false,
    production: false,
    sourceId: record.sourceId,
    sourceVersion: record.sourceVersion,
    retrievedAt: record.retrievedAt,
    byteLength: record.byteLength,
    sha256: record.sha256,
    originalFilename: safePath(record.localPath).split("/").at(-1)!,
    publisher: record.publisher,
    catalogueUrl: record.catalogueUrl,
    requestedUrl: record.requestedUrl,
    licenceId: record.licenceId,
    licenceUrl: record.licenceUrl,
    requiredAttribution: record.requiredAttribution,
    changesNotice: record.changesNotice,
  });
}

function validateGeometryEvidence(evidence: LocalAdmissionCandidate["geometryEvidence"]) {
  if (!Array.isArray(evidence) || evidence.length === 0) throw new Error("Local admission requires geometry/count evidence.");
  const layers = new Set<string>();
  for (const layer of evidence) {
    if (!LAYER.test(layer.layer) || /(?:^|[._-])(?:current|latest)(?:$|[._-])/i.test(layer.layer) || layers.has(layer.layer) || !required(layer.geometryType, "geometry type")) throw new Error("Local admission geometry evidence has an unsafe layer.");
    layers.add(layer.layer);
    for (const [field, value] of Object.entries({ featureCount: layer.featureCount, missingGeometryCount: layer.missingGeometryCount, emptyGeometryCount: layer.emptyGeometryCount, invalidGeometryCount: layer.invalidGeometryCount })) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Local admission geometry ${field} must be a non-negative safe integer.`);
    }
    if (layer.featureCount === 0 || layer.missingGeometryCount > layer.featureCount || layer.emptyGeometryCount > layer.featureCount) throw new Error("Local admission geometry/count evidence is malformed.");
    if (!layer.invalidGeometryReasons || Array.isArray(layer.invalidGeometryReasons)) throw new Error("Local admission geometry reasons are required.");
    const reasonTotal = (Object.values(layer.invalidGeometryReasons) as number[]).reduce<number>((total, value) => {
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Local admission geometry reason counts must be positive safe integers.");
      return total + value;
    }, 0);
    if (reasonTotal !== layer.invalidGeometryCount) throw new Error("Local admission geometry reason counts must reconcile.");
  }
}

/** Validates one production-shaped candidate without allowing it to become production. */
export function validateLocalAdmission(candidate: LocalAdmissionCandidate, recorded: RecordedStagingMetadata): LocalAdmissionCandidate {
  const staged = recordedStagingRecord(recorded);
  if (candidate.status !== "local-staging-admission-candidate" || candidate.release?.production !== false || candidate.release?.ingested !== false || candidate.release?.immutableObjectStorage !== false) throw new Error("Local admission candidates can never claim production, ingestion, or immutable storage.");
  if (!safeSegment(candidate.sourceId) || !safeSegment(candidate.sourceVersion) || timestamp(candidate.retrievedAt, "retrieval time") !== staged.retrievedAt) throw new Error("Local admission source version and retrieval time must match recorded staging metadata.");
  if (candidate.sourceId !== staged.sourceId || candidate.sourceVersion !== staged.sourceVersion || candidate.input?.byteLength !== staged.byteLength || candidate.input?.sha256?.toLowerCase() !== staged.sha256.toLowerCase() || safePath(candidate.input?.localPath) !== safePath(recorded.localPath)) throw new Error("Local admission checksum, source, version, retrieval, byte length, and path must match recorded staging metadata.");
  if (!SHA_256.test(candidate.input.sha256)) throw new Error("Local admission requires a SHA-256 checksum.");
  if (![staged.publisher, staged.licenceId, staged.requiredAttribution].every((value) => value.trim()) || !HTTPS.test(staged.licenceUrl)) throw new Error("Local admission requires verified attribution and an HTTPS licence URL.");
  validateGeometryEvidence(candidate.geometryEvidence);
  if (UNKNOWN_ZERO.test(JSON.stringify(candidate))) throw new Error("Local admission cannot represent Unknown as zero.");
  return candidate;
}
