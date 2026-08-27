import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, lstatSync, openSync, readFileSync, readSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { approvedDataRootRealPathSync, resolveDataRoot } from "./data-root.mjs";

import {
  assertBurnedAreaComparison,
  assertHarvestComparison,
  type BurnedAreaComparison,
  type HarvestComparison,
} from "../lib/phase2/validation-comparison";

const root = fileURLToPath(new URL("..", import.meta.url));
const canonicalDataRoot = resolve(root, "../../Witness_Tree-data");
// Keep the envelope identifier at /1: the formal Phase 2 checker already
// names this completion schema. The hardened fields below make old, loose /1
// envelopes fail closed without changing the formal-status record.
const evidenceSchema = "witness-tree/phase2-independent-comparison-evidence/1";
const availabilityPath = "data/phase2-real-comparison-availability.json";
const requiredInputIds = [
  "provincial-harvest-statistics",
  "nbac-1972-2025",
  "hansen-global-forest-change",
] as const;
const requiredProvinces = ["BC", "AB", "ON", "QC"] as const;
const baselineYears = Array.from({ length: 39 }, (_, index) => 1984 + index);
const contractIds = ["method", "mask", "boundary", "resampling", "area", "uncertainty"] as const;
const maxJsonBytes = 4 * 1024 * 1024;
const maxPrefixBytes = 64 * 1024;
const readChunkBytes = 64 * 1024;
const requiredClaims = {
  comparisonResultsExist: true,
  comparisonResultsPublished: true,
  causalAttributionClaim: false,
  likeForLikeClaim: false,
  productAccuracyClaim: false,
  sourceInputsReleased: false,
  released: false,
  productionEligible: false,
} as const;
const ownerAuthorization = {
  ownerName: "Chinonso Obeta",
  statement: "I explicitly authorize ingestion, release, production admission, and deployment.",
  decision: "approve",
} as const;
const inputAdmissionSchema = "witness-tree/phase2-comparison-input-admission/2";
const amendmentSchema = "witness-tree/phase2-comparison-scope-amendment/1";

type UnknownRecord = Record<string, unknown>;
type Binding = Readonly<{
  path: string;
  sha256: string;
  byteLength: number;
}>;
type SourceArtifact = Binding & Readonly<{
  format: "zip" | "geotiff" | "csv" | "json" | "jsonl" | "geopackage" | "shapefile-zip";
  role: "primary" | "tile" | "auxiliary";
}>;
type ScopeState = Readonly<{
  provinces: readonly string[];
  years: readonly number[];
  amendment: "none" | "four-2022";
}>;

type AggregateLineage = Readonly<{
  inputId: string;
  outputId: string;
}>;

type BoundReadOptions = Readonly<{
  captureBytes?: number;
  contains?: readonly string[];
  kind?: "artifact" | "metadata";
  maxBytes?: number;
}>;

type BoundRead = Readonly<{
  binding: Binding;
  contains: ReadonlySet<string>;
  prefix: Buffer;
}>;

function isTestOnlyPath(path: string): boolean {
  return /(?:^|[\\/])[^\\/]*test-only[^\\/]*(?:$|[\\/])/i.test(path);
}

function pathSegments(path: string): string[] {
  return path.replaceAll("\\", "/").split("/").filter(Boolean);
}

function assertNoTraversal(path: string, label: string, allowCanonicalDataParent: boolean): void {
  assert(!path.includes("\0"), `${label} path must not contain NUL`);
  const segments = pathSegments(path);
  if (!segments.some((segment) => segment === "." || segment === "..")) return;
  const normalised = path.replaceAll("\\", "/");
  const canonicalPrefix = /^(?:\.\.\/)+Witness_Tree-data(?:\/|$)/.exec(normalised)?.[0];
  if (allowCanonicalDataParent && canonicalPrefix) {
    const remainder = normalised.slice(canonicalPrefix.length);
    assert(!pathSegments(remainder).some((segment) => segment === "." || segment === ".."), `${label} path must not contain traversal segments`);
    return;
  }
  throw new Error(`${label} path must not contain traversal segments`);
}

// Resolved once and only when a symlink is actually met, so a detached drive
// cannot make this check fail for a reason unrelated to the evidence.
function approvedDataRootLink(): string {
  const configured = resolveDataRoot();
  // Throws if the link points anywhere other than the approved SSD root.
  approvedDataRootRealPathSync(configured);
  return configured;
}

function comparisonDataRoot(): string {
  const configured = resolveDataRoot();
  assert(typeof configured === "string" && configured.trim().length > 0, "WITNESS_TREE_DATA_ROOT must not be empty");
  assert(!configured.includes("\0"), "WITNESS_TREE_DATA_ROOT must not contain NUL");
  assert(isAbsolute(configured), "WITNESS_TREE_DATA_ROOT must be an absolute path");
  const approved = approvedDataRootRealPathSync(configured);
  let info;
  try {
    info = lstatSync(approved);
  } catch (error) {
    throw new Error(`WITNESS_TREE_DATA_ROOT is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(!info.isSymbolicLink() && info.isDirectory(), "WITNESS_TREE_DATA_ROOT must resolve to a directory");
  let current = configured;
  while (true) {
    let ancestor;
    try {
      ancestor = lstatSync(current);
    } catch {
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
      continue;
    }
    const approvedLink = current === "/tmp" || current === "/var" || current === configured;
    assert(!ancestor.isSymbolicLink() || approvedLink, "WITNESS_TREE_DATA_ROOT must not traverse an unapproved symlink parent");
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolve(approved);
}

function reRootCanonicalDataPath(absolutePath: string, label: string): string {
  const prefix = `${canonicalDataRoot}/`;
  if (!absolutePath.startsWith(prefix)) return absolutePath;
  const relativePath = absolutePath.slice(prefix.length);
  const dataRoot = comparisonDataRoot();
  const rerooted = resolve(dataRoot, relativePath);
  assert(rerooted === dataRoot || rerooted.startsWith(`${dataRoot}/`), `${label} escapes the configured data root`);
  return rerooted;
}

function assertNoSymlinkAncestors(absolutePath: string, label: string): void {
  let current = absolutePath;
  while (true) {
    let info;
    try {
      info = lstatSync(current);
    } catch {
      // The final lstat below gives the useful unavailable-file error. Missing
      // intermediate parents cannot be a symlink traversal that we can follow.
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
      continue;
    }
    // macOS commonly exposes /tmp as a system alias for /private/tmp. That
    // alias is safe; every task-local symlink remains rejected.
    //
    // The data root is the third approved alias. After the SSD cutover the
    // recorded internal path is a compatibility symlink, so every artifact
    // this check is built to accept sits beneath one. Exempting that single
    // link keeps the guard's purpose intact: any other symlink ancestor,
    // including one planted inside the data root, is still rejected.
    const approvedLink = current === "/tmp" || current === "/var" || current === approvedDataRootLink();
    assert(!info.isSymbolicLink() || approvedLink, `${label} must not traverse a symlink parent`);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function resolvePath(path: string, label: string, kind: "artifact" | "metadata" | "generic"): string {
  nonEmptyString(path, `${label} path`);
  assertNoTraversal(path, label, kind === "artifact");
  const absolutePath = reRootCanonicalDataPath(resolve(root, path), label);
  assertNoSymlinkAncestors(absolutePath, label);
  if (kind === "metadata" && !isTestOnlyPath(absolutePath)) {
    const dataRoot = resolve(root, "data");
    const relativeDataPath = !isAbsolute(path) && path.replaceAll("\\", "/").startsWith("data/");
    const absoluteDataPath = absolutePath === dataRoot || absolutePath.startsWith(`${dataRoot}/`);
    assert(relativeDataPath || absoluteDataPath, `${label} must use a durable repository-relative data path`);
    assert(absoluteDataPath, `${label} must remain under repository data/`);
  }
  return absolutePath;
}

function resolveInputPath(path: string): string {
  return resolvePath(path, "input", "generic");
}

function resolveMetadataPath(path: string, label: string): string {
  return resolvePath(path, label, "metadata");
}

function exactKeys(value: UnknownRecord, expected: readonly string[], label: string): void {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} contains missing or unexpected fields`);
}

function nonEmptyString(value: unknown, label: string): asserts value is string {
  assert.equal(typeof value, "string", `${label} is required`);
  assert((value as string).trim().length > 0, `${label} is required`);
}

function assertSha256(value: unknown, label: string): asserts value is string {
  assert.match(value as string, /^[a-f0-9]{64}$/, `${label} SHA-256 is invalid`);
}

function assertNoNulls(value: unknown, label: string, seen = new WeakSet<object>()): void {
  if (value === null) throw new Error(`${label} contains an unsupported null`);
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoNulls(item, `${label}[${index}]`, seen));
    return;
  }
  for (const [key, item] of Object.entries(value)) assertNoNulls(item, `${label}.${key}`, seen);
}

function validateBindingShape(value: unknown, label: string): asserts value is UnknownRecord {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} binding is required`);
  const candidate = value as UnknownRecord;
  exactKeys(candidate, ["byteLength", "path", "sha256"], `${label} binding`);
  nonEmptyString(candidate.path, `${label} path`);
  assertSha256(candidate.sha256, `${label}`);
  assert(Number.isSafeInteger(candidate.byteLength) && (candidate.byteLength as number) > 0, `${label} byte length is invalid`);
}

function readBoundBytes(value: unknown, label: string, options: BoundReadOptions = {}): BoundRead {
  validateBindingShape(value, label);
  const candidate = value as UnknownRecord;
  const kind = options.kind ?? "artifact";
  const absolutePath = kind === "metadata"
    ? resolveMetadataPath(candidate.path as string, label)
    : resolvePath(candidate.path as string, label, "artifact");
  let fileStat;
  try {
    fileStat = lstatSync(absolutePath);
  } catch (error) {
    throw new Error(`${label} file is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(!fileStat.isSymbolicLink(), `${label} must not bind a symlink`);
  assert(fileStat.isFile(), `${label} must bind a regular file`);
  assert(Number.isSafeInteger(fileStat.size), `${label} file size is not safely representable`);
  assert.equal(fileStat.size, candidate.byteLength, `${label} declared byte length differs from the file`);
  if (options.maxBytes !== undefined) assert(fileStat.size <= options.maxBytes, `${label} exceeds the safe ${options.maxBytes}-byte read limit`);

  const captureLimit = options.maxBytes === undefined ? maxPrefixBytes : options.maxBytes;
  const captureBytes = Math.max(0, Math.min(options.captureBytes ?? maxPrefixBytes, captureLimit));
  const needles = [...new Set((options.contains ?? []).filter((needle) => needle.length > 0))];
  const needleBuffers = needles.map((needle) => ({ needle, bytes: Buffer.from(needle, "utf8") }));
  const maxNeedleLength = needleBuffers.reduce((maximum, item) => Math.max(maximum, item.bytes.length), 0);
  const found = new Set<string>();
  const prefixParts: Buffer[] = [];
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(readChunkBytes);
  let prefixLength = 0;
  let position = 0;
  let totalLength = 0;
  let carry = Buffer.alloc(0);
  const descriptor = openSync(absolutePath, "r");
  try {
    while (position < fileStat.size) {
      const count = readSync(descriptor, buffer, 0, Math.min(buffer.length, fileStat.size - position), position);
      if (count === 0) break;
      const chunk = buffer.subarray(0, count);
      hash.update(chunk);
      if (prefixLength < captureBytes) {
        const length = Math.min(captureBytes - prefixLength, chunk.length);
        prefixParts.push(Buffer.from(chunk.subarray(0, length)));
        prefixLength += length;
      }
      if (needleBuffers.length > 0) {
        const searchWindow = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk;
        for (const item of needleBuffers) {
          if (!found.has(item.needle) && searchWindow.includes(item.bytes)) found.add(item.needle);
        }
        carry = maxNeedleLength > 1
          ? Buffer.from(searchWindow.subarray(Math.max(0, searchWindow.length - maxNeedleLength + 1)))
          : Buffer.alloc(0);
      }
      position += count;
      totalLength += count;
    }
  } finally {
    closeSync(descriptor);
  }
  assert.equal(totalLength, fileStat.size, `${label} could not be read completely`);
  const actual: Binding = { path: candidate.path as string, sha256: hash.digest("hex"), byteLength: totalLength };
  assert.deepEqual(
    { path: candidate.path, sha256: candidate.sha256, byteLength: candidate.byteLength },
    actual,
    `${label} checksum binding differs`,
  );
  return { binding: actual, contains: found, prefix: Buffer.concat(prefixParts) };
}

function readBoundJson(value: unknown, label: string): { binding: Binding; document: UnknownRecord } {
  const bound = readBoundBytes(value, label, { captureBytes: maxJsonBytes, kind: "metadata", maxBytes: maxJsonBytes });
  let document: unknown;
  try {
    document = JSON.parse(bound.prefix.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} must contain valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(document && typeof document === "object" && !Array.isArray(document), `${label} JSON object is required`);
  return { binding: bound.binding, document: document as UnknownRecord };
}

function normalisePath(path: string): string {
  return resolveInputPath(path).replaceAll("\\", "/");
}

function assertRealSourcePath(path: string, label: string): void {
  const normalised = resolvePath(path, label, "artifact").replaceAll("\\", "/");
  assert.match(normalised, /\/Witness_Tree-data\/raw\//, `${label} must point at the raw source archive, not a metadata file`);
  assert.doesNotMatch(normalised, /(?:synthetic|fixture|illustrative|example|fake|\.bin$)/i, `${label} cannot be synthetic or illustrative`);
  const canonicalRoot = (isTestOnlyPath(normalised) ? canonicalDataRoot : comparisonDataRoot()).replaceAll("\\", "/");
  assert(
    normalised.startsWith(`${canonicalRoot}/`) || isTestOnlyPath(normalised),
    `${label} must be in the canonical Witness_Tree-data root or an explicitly test-only path`,
  );
}

function assertRealArtifactBytes(bytes: Uint8Array, byteLength: number, format: SourceArtifact["format"], label: string): void {
  assert(bytes.length > 0, `${label} source bytes are empty`);
  const markerWindow = Buffer.from(bytes.subarray(0, maxPrefixBytes)).toString("utf8");
  assert.doesNotMatch(markerWindow, /synthetic|illustrative|fixture|fake/i, `${label} source bytes are synthetic or illustrative`);
  if (format === "zip" || format === "shapefile-zip") {
    assert.equal(bytes[0], 0x50, `${label} is not a ZIP payload`);
    assert.equal(bytes[1], 0x4b, `${label} is not a ZIP payload`);
    return;
  }
  if (format === "geotiff") {
    const tiff = Buffer.from(bytes.subarray(0, 4)).toString("binary");
    assert(["II*\0", "MM\0*"].includes(tiff), `${label} is not a GeoTIFF payload`);
    return;
  }
  if (format === "geopackage") {
    const sqlite = Buffer.from(bytes.subarray(0, 16)).toString("binary");
    assert.equal(sqlite, "SQLite format 3\0", `${label} is not a GeoPackage/SQLite payload`);
    return;
  }
  const text = Buffer.from(bytes.subarray(0, maxPrefixBytes)).toString("utf8");
  assert(!text.includes("\0"), `${label} ${format} payload is not valid text`);
  if (format === "json" && byteLength <= maxJsonBytes && bytes.length === byteLength) {
    try {
      JSON.parse(text);
    } catch (error) {
      throw new Error(`${label} JSON payload is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function profileArtifacts(document: UnknownRecord): Array<Readonly<{ path: string; sha256: string; byteLength: number }>> {
  const found: Array<Readonly<{ path: string; sha256: string; byteLength: number }>> = [];
  const raw = document.raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const candidate = raw as UnknownRecord;
    if (typeof candidate.localPath === "string" && typeof candidate.sha256 === "string" && typeof candidate.byteLength === "number") {
      found.push({ path: candidate.localPath, sha256: candidate.sha256, byteLength: candidate.byteLength });
    }
  }
  if (Array.isArray(document.artifacts)) {
    for (const item of document.artifacts) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const candidate = item as UnknownRecord;
      if (typeof candidate.localPath === "string" && typeof candidate.sha256 === "string" && typeof candidate.byteLength === "number") {
        found.push({ path: candidate.localPath, sha256: candidate.sha256, byteLength: candidate.byteLength });
      }
    }
  }
  return found;
}

function assertProfileIsReal(document: UnknownRecord, label: string): void {
  assert.doesNotMatch(JSON.stringify(document), /synthetic|illustrative|fixture|fake|example/i, `${label} is synthetic or illustrative`);
  assert(
    typeof document.sourceId === "string" || (document.source && typeof document.source === "object"),
    `${label} must identify the publisher source, not only an unbound metadata record`,
  );
  const claims = document.claims;
  if (claims && typeof claims === "object" && !Array.isArray(claims)) {
    for (const key of ["admitted", "released", "productionEligible", "comparisonComputed", "likeForLike"]) {
      if (key in (claims as UnknownRecord)) assert.equal((claims as UnknownRecord)[key], false, `${label} cannot claim ${key}`);
    }
  }
}

function validateSourceArtifact(value: unknown, label: string): SourceArtifact {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} artifact is required`);
  const artifact = value as UnknownRecord;
  exactKeys(artifact, ["byteLength", "format", "path", "role", "sha256"], `${label} artifact`);
  assert(["zip", "geotiff", "csv", "json", "jsonl", "geopackage", "shapefile-zip"].includes(artifact.format as string), `${label} format is unsupported`);
  assert(["primary", "tile", "auxiliary"].includes(artifact.role as string), `${label} role is unsupported`);
  assertRealSourcePath(artifact.path as string, label);
  const captureBytes = artifact.format === "json" && (artifact.byteLength as number) <= maxJsonBytes ? maxJsonBytes : maxPrefixBytes;
  const bound = readBoundBytes({ path: artifact.path, sha256: artifact.sha256, byteLength: artifact.byteLength }, label, {
    captureBytes,
    ...(artifact.format === "json" && (artifact.byteLength as number) <= maxJsonBytes ? { maxBytes: maxJsonBytes } : {}),
  });
  assertRealArtifactBytes(bound.prefix, bound.binding.byteLength, artifact.format as SourceArtifact["format"], label);
  return { ...bound.binding, format: artifact.format as SourceArtifact["format"], role: artifact.role as SourceArtifact["role"] };
}

function assertRequiredInputIds(inputs: unknown): asserts inputs is UnknownRecord[] {
  assert(Array.isArray(inputs), "independent input bindings are required");
  assert.equal(inputs.length, requiredInputIds.length, "independent input bindings contain hidden or missing inputs");
  const ids = inputs.map((input) => {
    assert(input && typeof input === "object" && !Array.isArray(input), "each independent input binding must be an object");
    const id = (input as UnknownRecord).id;
    nonEmptyString(id, "each independent input id");
    return id;
  });
  assert.deepEqual([...new Set(ids)].sort(), [...requiredInputIds].sort(), "independent input ids differ from the required comparison inputs");
}

function validateAdmittedInput(input: UnknownRecord): { id: string; profile: Binding; artifacts: SourceArtifact[]; admission: Binding } {
  exactKeys(input, ["admission", "artifacts", "id", "profile", "sourceKind"], `${String(input.id)} input binding`);
  nonEmptyString(input.id, "input id");
  assert.equal(input.sourceKind, "real-source-artifact", `${input.id as string} input must be a real source artifact`);
  const profile = readBoundJson(input.profile, `${input.id as string} source profile`);
  assertProfileIsReal(profile.document, `${input.id as string} source profile`);
  const profileEntries = profileArtifacts(profile.document);
  assert(profileEntries.length > 0, `${input.id as string} source profile must enumerate its raw artifact bytes`);
  assert(Array.isArray(input.artifacts) && input.artifacts.length > 0, `${input.id as string} source artifacts are required`);
  const artifacts = input.artifacts.map((artifact, index) => validateSourceArtifact(artifact, `${input.id as string} artifact ${index + 1}`));
  assert.equal(artifacts.length, profileEntries.length, `${input.id as string} must bind every profiled source artifact`);
  for (const artifact of artifacts) {
    const match = profileEntries.find((entry) => normalisePath(entry.path) === normalisePath(artifact.path));
    assert(match, `${input.id as string} profile does not bind ${artifact.path}`);
    assert.equal(match.sha256, artifact.sha256, `${input.id as string} profile checksum differs for ${artifact.path}`);
    assert.equal(match.byteLength, artifact.byteLength, `${input.id as string} profile byte length differs for ${artifact.path}`);
  }

  const admission = readBoundJson(input.admission, `${input.id as string} admission evidence`);
  exactKeys(admission.document, ["claims", "input", "ownerAuthorization", "schemaVersion", "status"], `${input.id as string} admission evidence`);
  assert.equal(admission.document.schemaVersion, inputAdmissionSchema, `${input.id as string} admission schema differs`);
  assert.equal(admission.document.status, "owner-approved-limited-comparison-input", `${input.id as string} admission status differs`);
  assert.deepEqual(admission.document.ownerAuthorization, ownerAuthorization, `${input.id as string} admission owner authorization differs`);
  const admissionInput = admission.document.input;
  assert(admissionInput && typeof admissionInput === "object" && !Array.isArray(admissionInput), `${input.id as string} admission input is required`);
  exactKeys(admissionInput as UnknownRecord, ["artifacts", "id", "profile"], `${input.id as string} admission input`);
  assert.deepEqual(admissionInput, {
    id: input.id,
    profile: profile.binding,
    artifacts: artifacts.map(({ format, role, ...artifact }) => ({ ...artifact, format, role })),
  }, `${input.id as string} admission evidence is not bound to the exact source files`);
  assert.deepEqual(admission.document.claims, { comparisonInputAdmitted: true, sourceInputReleased: false, productionEligible: false }, `${input.id as string} admission claim boundary differs`);
  return { id: input.id as string, profile: profile.binding, artifacts, admission: admission.binding };
}

function validateScope(value: unknown): ScopeState {
  assert(value && typeof value === "object" && !Array.isArray(value), "comparison scope declaration is required");
  const scope = value as UnknownRecord;
  exactKeys(scope, ["annualProvinceYearRequirement", "baselineYears", "promptAmendment", "provinces"], "comparison scope declaration");
  assert.equal(scope.annualProvinceYearRequirement, "per-province-per-year", "the annual province/year requirement cannot be weakened implicitly");
  assert.deepEqual(scope.provinces, [...requiredProvinces], "comparison scope must cover all four provinces");
  assert(scope.baselineYears && typeof scope.baselineYears === "object" && !Array.isArray(scope.baselineYears), "comparison baseline years are required");
  exactKeys(scope.baselineYears as UnknownRecord, ["first", "last"], "comparison baseline years");
  assert.deepEqual(scope.baselineYears, { first: baselineYears[0], last: baselineYears.at(-1) }, "comparison scope baseline years differ");

  const amendment = scope.promptAmendment;
  assert(amendment && typeof amendment === "object" && !Array.isArray(amendment), "comparison scope amendment state is required");
  const amendmentRecord = amendment as UnknownRecord;
  if (amendmentRecord.status === "none-bound") {
    exactKeys(amendmentRecord, ["status"], "unamended comparison scope");
    return { provinces: [...requiredProvinces], years: baselineYears, amendment: "none" };
  }
  exactKeys(amendmentRecord, ["binding", "status"], "comparison scope amendment");
  assert.equal(amendmentRecord.status, "bound", "comparison scope amendment status differs");
  const amendmentEvidence = readBoundJson(amendmentRecord.binding, "comparison scope amendment evidence");
  exactKeys(amendmentEvidence.document, ["amendedRequirement", "decision", "originalRequirement", "schemaVersion", "status", "targetRows"], "comparison scope amendment evidence");
  assert.equal(amendmentEvidence.document.schemaVersion, amendmentSchema, "comparison scope amendment schema differs");
  assert.equal(amendmentEvidence.document.status, "binding-prompt-amendment", "comparison scope amendment is not binding");
  assert.equal(amendmentEvidence.document.decision, "approve", "comparison scope amendment is not approved");
  assert.equal(amendmentEvidence.document.originalRequirement, "per-province-per-year", "comparison scope amendment does not identify the older requirement");
  assert.equal(amendmentEvidence.document.amendedRequirement, "four-province-2022", "comparison scope amendment does not state the narrowed requirement");
  assert.deepEqual(amendmentEvidence.document.targetRows, { provinces: [...requiredProvinces], years: [2022] }, "comparison scope amendment target is not explicit");
  return { provinces: [...requiredProvinces], years: [2022], amendment: "four-2022" };
}

function validateRealComparisonContract(value: unknown, scope: ScopeState): UnknownRecord {
  const contract = readBoundJson(value, "comparison contract");
  assert.doesNotMatch(JSON.stringify(contract.document), /synthetic|illustrative|fixture|fake/i, "comparison contract cannot be synthetic or illustrative");
  exactKeys(contract.document, ["claims", "scope", "schemaVersion", "status"], "comparison contract");
  assert.equal(contract.document.schemaVersion, "witness-tree/phase2-independent-comparison-contract/2", "comparison contract schema differs");
  assert.equal(contract.document.status, "owner-approved-real-comparison-contract", "comparison contract is not an approved real-data contract");
  assert.deepEqual(contract.document.claims, { comparisonResultsExist: false, likeForLikeClaim: false, productAccuracyClaim: false, productionEligible: false, externalAction: false }, "comparison contract claim boundary differs");
  assert.deepEqual(contract.document.scope, {
    annualProvinceYearRequirement: "per-province-per-year",
    baselineYears: { first: scope.years[0], last: scope.years.at(-1) },
    provinces: [...scope.provinces],
  }, "comparison contract scope differs from the bound scope declaration");
  return contract.document;
}

function contractDocumentContains(document: UnknownRecord, pattern: RegExp, label: string): void {
  assert.match(JSON.stringify(document), pattern, `${label} contract does not state its required semantics`);
}

function validateContracts(value: unknown): Record<string, Binding> {
  assert(value && typeof value === "object" && !Array.isArray(value), "comparison method contracts are required");
  const contracts = value as UnknownRecord;
  exactKeys(contracts, contractIds, "comparison method contracts");
  const bindings: Record<string, Binding> = {};
  const paths = new Set<string>();
  for (const id of contractIds) {
    const bound = readBoundJson(contracts[id], `${id} contract`);
    assert.doesNotMatch(JSON.stringify(bound.document), /synthetic|illustrative|fixture|fake/i, `${id} contract cannot be synthetic or illustrative`);
    assert(typeof bound.document.schemaVersion === "string" || typeof bound.document.version === "string", `${id} contract must carry a version`);
    if (bound.document.productionEligible !== undefined) assert.equal(bound.document.productionEligible, false, `${id} contract cannot be production eligible`);
    const patterns: Record<string, RegExp> = {
      method: /method|algorithm|parameter/i,
      mask: /mask|nodata|forest.?class/i,
      boundary: /boundary|edition|geometry/i,
      resampling: /resampl|reproject|grid|alignment/i,
      area: /area|hectare|aggregation|denominator/i,
      uncertainty: /uncertainty|error|confidence|interval/i,
    };
    contractDocumentContains(bound.document, patterns[id], id);
    assert(!paths.has(normalisePath(bound.binding.path)), `comparison contracts must bind distinct files; ${id} is duplicated`);
    paths.add(normalisePath(bound.binding.path));
    bindings[id] = bound.binding;
  }
  return bindings;
}

function findMatchingArtifact(admission: UnknownRecord, artifact: Binding, label: string): UnknownRecord {
  const bindings = admission.artifactBindings;
  assert(Array.isArray(bindings), `${label} admission record must enumerate artifact bindings`);
  const match = bindings.find((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const candidate = item as UnknownRecord;
    nonEmptyString(candidate.path, `${label} admission artifact path`);
    resolvePath(candidate.path, `${label} admission artifact`, "artifact");
    return candidate.sha256 === artifact.sha256
      && candidate.byteLength === artifact.byteLength
      && basename(candidate.path) === basename(artifact.path);
  });
  assert(match && typeof match === "object" && !Array.isArray(match), `${label} output is not present in the admitted artifact record`);
  return match as UnknownRecord;
}

function assertBindingReference(value: unknown, expected: Binding, label: string): void {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} binding is required`);
  const candidate = value as UnknownRecord;
  assert.equal(candidate.path, expected.path, `${label} path differs`);
  assert.equal(candidate.sha256, expected.sha256, `${label} checksum differs`);
  assert.equal(candidate.byteLength, expected.byteLength, `${label} byte length differs`);
}

function validateComparisonAggregate(value: UnknownRecord, outputIds: Set<string>): Map<string, AggregateLineage> {
  assertNoNulls(value, "Witness Tree comparison aggregate");
  exactKeys(value, ["claims", "rows", "schemaVersion", "status"], "Witness Tree comparison aggregate");
  assert.equal(value.schemaVersion, "witness-tree/phase2-comparison-aggregate/1", "Witness Tree comparison aggregate schema differs");
  assert.equal(value.status, "recorded-comparison-aggregate", "Witness Tree comparison aggregate is not recorded");
  assert.deepEqual(value.claims, { comparisonResultsExist: true, productionEligible: false, released: false }, "Witness Tree comparison aggregate claim boundary differs");
  assert(Array.isArray(value.rows) && value.rows.length > 0, "Witness Tree comparison aggregate rows are required");
  const rows = new Map<string, AggregateLineage>();
  for (const [index, item] of value.rows.entries()) {
    assert(item && typeof item === "object" && !Array.isArray(item), `Witness Tree comparison aggregate row ${index + 1} is required`);
    const row = item as UnknownRecord;
    assert(["provincial-harvest", "nbac", "hansen"].includes(row.kind as string), `Witness Tree comparison aggregate row ${index + 1} kind is unsupported`);
    const kind = row.kind as string;
    if (kind === "provincial-harvest") {
      exactKeys(row, ["key", "kind", "province", "referenceInputId", "witnessTreeOutputId", "year"], `Witness Tree comparison aggregate row ${index + 1}`);
      assert(requiredProvinces.includes(row.province as typeof requiredProvinces[number]), `Witness Tree comparison aggregate row ${index + 1} province is unsupported`);
      assert(Number.isSafeInteger(row.year), `Witness Tree comparison aggregate row ${index + 1} year is invalid`);
      assert.equal(row.key, `${row.province}:${row.year}`, `Witness Tree comparison aggregate row ${index + 1} key differs`);
    } else if (kind === "nbac") {
      exactKeys(row, ["key", "kind", "referenceInputId", "witnessTreeOutputId", "year"], `Witness Tree comparison aggregate row ${index + 1}`);
      assert.equal(row.year, 2022, `Witness Tree comparison aggregate row ${index + 1} year differs`);
      assert.equal(row.key, `NBAC:${row.year}`, `Witness Tree comparison aggregate row ${index + 1} key differs`);
    } else {
      exactKeys(row, ["key", "kind", "name", "referenceInputId", "witnessTreeOutputId"], `Witness Tree comparison aggregate row ${index + 1}`);
      assert.equal(row.name, "cross-check", `Witness Tree comparison aggregate row ${index + 1} name differs`);
      assert.equal(row.key, "Hansen:cross-check", `Witness Tree comparison aggregate row ${index + 1} key differs`);
    }
    nonEmptyString(row.key, `Witness Tree comparison aggregate row ${index + 1} key`);
    assert(requiredInputIds.includes(row.referenceInputId as typeof requiredInputIds[number]), `Witness Tree comparison aggregate row ${index + 1} input is unsupported`);
    nonEmptyString(row.witnessTreeOutputId, `Witness Tree comparison aggregate row ${index + 1} output id`);
    const key = row.key as string;
    const inputId = row.referenceInputId as string;
    const outputId = row.witnessTreeOutputId as string;
    assert(outputIds.has(outputId), `Witness Tree comparison aggregate row ${index + 1} references an unadmitted output`);
    assert(!rows.has(key), `Witness Tree comparison aggregate key is duplicated: ${key}`);
    rows.set(key, { inputId, outputId });
  }
  return rows;
}

function validateWitnessTree(value: unknown, contracts: Record<string, Binding>): { aggregate: Map<string, AggregateLineage>; outputIds: Set<string>; admission: UnknownRecord } {
  assert(value && typeof value === "object" && !Array.isArray(value), "admitted Witness Tree output evidence is required");
  const witnessTree = value as UnknownRecord;
  exactKeys(witnessTree, ["admissionRecord", "claims", "comparisonAggregate", "outputReadbackEvidence", "outputs"], "Witness Tree output evidence");
  assert.deepEqual(witnessTree.claims, { admitted: true, released: false, productionEligible: false }, "Witness Tree output claim boundary differs");
  const admission = readBoundJson(witnessTree.admissionRecord, "Witness Tree admission record");
  assert.equal(admission.document.schemaVersion, "witness-tree/phase2-admission-record/1", "Witness Tree admission schema differs");
  assert.equal(admission.document.status, "recorded-admission", "Witness Tree admission record is not recorded");
  const admissionClaims = admission.document.claims;
  assert(admissionClaims && typeof admissionClaims === "object" && !Array.isArray(admissionClaims), "Witness Tree admission claims are required");
  assert.equal((admissionClaims as UnknownRecord).admitted, true, "Witness Tree outputs are not admitted");
  assert.equal((admissionClaims as UnknownRecord).released, false, "Witness Tree source release must remain false");
  assert.equal((admissionClaims as UnknownRecord).productionEligible, false, "Witness Tree outputs cannot be production eligible");
  const readback = readBoundJson(witnessTree.outputReadbackEvidence, "Witness Tree output readback evidence");
  assert.match(String(readback.document.schemaVersion), /witness-tree\/phase2-v21-raster-readback-evidence\//, "Witness Tree readback schema differs");
  assert.equal(readback.document.status, "local-readback-passed-nonproduction", "Witness Tree readback is not the expected output record");
  const admissionReadback = (admission.document.evidenceBindings as UnknownRecord | undefined)?.rasterReadback;
  assert(admissionReadback && typeof admissionReadback === "object" && !Array.isArray(admissionReadback), "Witness Tree admission must bind the output readback record");
  assertBindingReference(admissionReadback, readback.binding, "Witness Tree admission/readback");
  const aggregate = readBoundJson(witnessTree.comparisonAggregate, "Witness Tree comparison aggregate");
  const admissionAggregate = (admission.document.evidenceBindings as UnknownRecord | undefined)?.comparisonAggregate;
  assertBindingReference(admissionAggregate, aggregate.binding, "Witness Tree admission/comparison aggregate");
  const readbackAggregate = readback.document.comparisonAggregate;
  assertBindingReference(readbackAggregate, aggregate.binding, "Witness Tree readback/comparison aggregate");
  const outputs = witnessTree.outputs;
  assert(Array.isArray(outputs) && outputs.length > 0, "admitted Witness Tree output artifacts are required");
  const outputIds = new Set<string>();
  for (const [index, value] of outputs.entries()) {
    assert(value && typeof value === "object" && !Array.isArray(value), `Witness Tree output ${index + 1} is required`);
    const output = value as UnknownRecord;
    exactKeys(output, ["artifact", "id", "record"], `Witness Tree output ${index + 1}`);
    nonEmptyString(output.id, `Witness Tree output ${index + 1} id`);
    assert(!outputIds.has(output.id as string), `Witness Tree output id is duplicated: ${output.id as string}`);
    outputIds.add(output.id as string);
    const artifact = readBoundBytes(output.artifact, `${output.id as string} output artifact`).binding;
    const record = readBoundJson(output.record, `${output.id as string} output record`);
    assert.equal(record.document.productionEligible, false, `${output.id as string} output record cannot be production eligible`);
    assert.equal(record.document.released, false, `${output.id as string} output record cannot be released`);
    const recordOutput = record.document.output;
    assert(recordOutput && typeof recordOutput === "object" && !Array.isArray(recordOutput), `${output.id as string} output record must bind its output bytes`);
    assert.equal((recordOutput as UnknownRecord).sha256, artifact.sha256, `${output.id as string} output record checksum differs`);
    assert.equal((recordOutput as UnknownRecord).byteLength, artifact.byteLength, `${output.id as string} output record byte length differs`);
    findMatchingArtifact(admission.document, artifact, output.id as string);
    const readbackOutputs = readback.document.outputs;
    assert(Array.isArray(readbackOutputs), "Witness Tree output readback must enumerate outputs");
    const readbackMatch = readbackOutputs.find((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const candidate = item as UnknownRecord;
      if (!candidate.raster || typeof candidate.raster !== "object" || Array.isArray(candidate.raster)) return false;
      validateBindingShape(candidate.raster, `${output.id as string} readback raster`);
      resolvePath((candidate.raster as UnknownRecord).path as string, `${output.id as string} readback raster`, "artifact");
      return (candidate.raster as UnknownRecord).sha256 === artifact.sha256
        && (candidate.raster as UnknownRecord).byteLength === artifact.byteLength;
    });
    assert(readbackMatch, `${output.id as string} artifact is not present in the output readback record`);
  }
  const methodParameterBinding = (admission.document.evidenceBindings as UnknownRecord | undefined)?.methodParameters;
  assert(methodParameterBinding && typeof methodParameterBinding === "object" && !Array.isArray(methodParameterBinding), "Witness Tree admission must bind the method contract");
  assertBindingReference(methodParameterBinding, contracts.method, "admission method contract");
  return { aggregate: validateComparisonAggregate(aggregate.document, outputIds), outputIds, admission: admission.document };
}

function validateRowLineage(value: unknown, expectedInputId: string, expectedKey: string, outputIds: Set<string>, aggregate: Map<string, AggregateLineage>, label: string): void {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} lineage is required`);
  const lineage = value as UnknownRecord;
  exactKeys(lineage, ["comparisonKey", "referenceInputId", "witnessTreeOutputId"], `${label} lineage`);
  assert.equal(lineage.comparisonKey, expectedKey, `${label} comparison key differs`);
  assert.equal(lineage.referenceInputId, expectedInputId, `${label} reference input differs`);
  nonEmptyString(lineage.witnessTreeOutputId, `${label} Witness Tree output id`);
  assert(outputIds.has(lineage.witnessTreeOutputId), `${label} references an unadmitted Witness Tree output`);
  const aggregateLineage = aggregate.get(expectedKey);
  assert(aggregateLineage, `${label} comparison key is absent from the admitted Witness Tree aggregate`);
  assert.equal(aggregateLineage.inputId, expectedInputId, `${label} aggregate input differs`);
  assert.equal(aggregateLineage.outputId, lineage.witnessTreeOutputId, `${label} aggregate output differs`);
}

function validateUncertainty(value: unknown, label: string): void {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} uncertainty treatment is required`);
  const uncertainty = value as UnknownRecord;
  exactKeys(uncertainty, ["basis", "contractId", "status"], `${label} uncertainty treatment`);
  assert.equal(uncertainty.contractId, "uncertainty", `${label} uncertainty treatment must use the bound uncertainty contract`);
  assert(["quantified", "not-quantified"].includes(uncertainty.status as string), `${label} uncertainty status is unsupported`);
  nonEmptyString(uncertainty.basis, `${label} uncertainty basis`);
}

function expectedHarvestKeys(scope: ScopeState): string[] {
  return scope.provinces.flatMap((province) => scope.years.map((year) => `${province}:${year}`)).sort();
}

function validateHarvestRows(rows: unknown, scope: ScopeState, inputs: Map<string, ReturnType<typeof validateAdmittedInput>>, outputIds: Set<string>, aggregate: Map<string, AggregateLineage>): void {
  assert(Array.isArray(rows), "provincial harvest comparison rows are required");
  const expected = expectedHarvestKeys(scope);
  assert.equal(rows.length, expected.length, `provincial harvest rows must cover every province/year pair (${expected.length} rows required)`);
  const actual = rows.map((row) => {
    assert(row && typeof row === "object" && !Array.isArray(row), "each provincial harvest row must be an object");
    const candidate = row as UnknownRecord;
    assert.equal(candidate.status, "computed", "completed evidence cannot contain pending provincial harvest rows");
    return `${candidate.province}:${candidate.year}`;
  }).sort();
  assert.deepEqual(actual, expected, "provincial harvest rows contain an unexpected or missing province/year pair");
  for (const row of rows) {
    const candidate = row as UnknownRecord;
    assertNoNulls(candidate, `provincial harvest row ${String(candidate.province)}:${String(candidate.year)}`);
    exactKeys(candidate, ["absoluteDifferenceHectares", "explanation", "lineage", "province", "provincialPublishedHectares", "publication", "relativeDifference", "status", "uncertainty", "witnessTreeHectares", "year"], "provincial harvest row");
    assertHarvestComparison(candidate as HarvestComparison);
    validateRowLineage(candidate.lineage, "provincial-harvest-statistics", `${candidate.province}:${candidate.year}`, outputIds, aggregate, `${String(candidate.province)} harvest comparison`);
    assert(inputs.has("provincial-harvest-statistics"), "provincial harvest input is unavailable");
    validateUncertainty(candidate.uncertainty, `${String(candidate.province)} harvest comparison`);
  }
}

function validateNbacRows(rows: unknown, outputIds: Set<string>, inputs: Map<string, ReturnType<typeof validateAdmittedInput>>, aggregate: Map<string, AggregateLineage>): void {
  assert(Array.isArray(rows), "NBAC comparison rows are required");
  assert.equal(rows.length, 1, "NBAC comparison must contain exactly one bound row");
  const row = rows[0];
  assert(row && typeof row === "object" && !Array.isArray(row), "each NBAC row must be an object");
  const candidate = row as UnknownRecord;
  assert.equal(candidate.status, "computed", "completed evidence cannot contain pending NBAC rows");
  assert.equal(candidate.year, 2022, "NBAC comparison year must match the admitted comparison endpoint");
  assertNoNulls(candidate, "NBAC comparison row");
  exactKeys(candidate, ["absoluteDifferenceHectares", "explanation", "lineage", "nbacHectares", "publication", "relativeDifference", "status", "uncertainty", "witnessTreeHectares", "year"], "NBAC comparison row");
  assertBurnedAreaComparison(candidate as BurnedAreaComparison);
  validateRowLineage(candidate.lineage, "nbac-1972-2025", "NBAC:2022", outputIds, aggregate, "NBAC comparison");
  assert(inputs.has("nbac-1972-2025"), "NBAC input is unavailable");
  validateUncertainty(candidate.uncertainty, "NBAC comparison");
}

function validateHansenCrossCheck(value: unknown, inputs: Map<string, ReturnType<typeof validateAdmittedInput>>, outputIds: Set<string>, aggregate: Map<string, AggregateLineage>): UnknownRecord {
  assert(value && typeof value === "object" && !Array.isArray(value), "bounded Hansen cross-check evidence is required");
  const crossCheck = value as UnknownRecord;
  exactKeys(crossCheck, ["fixtureStatus", "lineage", "productionEligible", "resultClaims", "role", "sampleSize", "status", "uncertainty"], "Hansen cross-check evidence");
  assert.equal(crossCheck.fixtureStatus, "real-source-cross-check", "Hansen cross-check cannot use a synthetic fixture");
  assert.equal(crossCheck.role, "independent-cross-check-not-source", "Hansen cross-check role differs");
  assert.equal(crossCheck.productionEligible, false, "Hansen cross-check cannot be production eligible");
  assert.equal(crossCheck.status, "completed", "Hansen evidence must have a completed bounded cross-check result");
  assert.equal(crossCheck.resultClaims, "cross-check-only", "Hansen evidence cannot claim a source or product result");
  assert(Number.isSafeInteger(crossCheck.sampleSize) && (crossCheck.sampleSize as number) > 0, "Hansen cross-check requires a positive sample size");
  validateRowLineage(crossCheck.lineage, "hansen-global-forest-change", "Hansen:cross-check", outputIds, aggregate, "Hansen cross-check");
  assert(inputs.has("hansen-global-forest-change"), "Hansen input is unavailable");
  validateUncertainty(crossCheck.uncertainty, "Hansen cross-check");
  return crossCheck;
}

function validatePublication(value: unknown, rowKeys: string[]): UnknownRecord {
  assert(value && typeof value === "object" && !Array.isArray(value), "comparison publication evidence is required");
  const publication = value as UnknownRecord;
  exactKeys(publication, ["enPage", "enPath", "frPage", "frPath", "metadata", "publishedAt", "status"], "comparison publication evidence");
  assert.equal(publication.status, "published-bilingual", "comparison results must be published bilingually");
  assert.equal(publication.enPath, "/en/methods", "English comparison publication route differs");
  assert.equal(publication.frPath, "/fr/methodes", "French comparison publication route differs");
  assert.match(publication.publishedAt as string, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, "comparison publication timestamp must be a whole-second UTC instant");
  assert.equal(new Date(publication.publishedAt as string).toISOString(), (publication.publishedAt as string).replace("Z", ".000Z"), "comparison publication timestamp must be real");
  const enPage = readBoundBytes(publication.enPage, "English comparison publication page", { contains: rowKeys });
  const frPage = readBoundBytes(publication.frPage, "French comparison publication page", { contains: rowKeys });
  assert(enPage.binding.byteLength > 0 && frPage.binding.byteLength > 0, "published comparison pages cannot be empty");
  assert.equal(enPage.contains.size, rowKeys.length, "English comparison publication page does not enumerate every result row");
  assert.equal(frPage.contains.size, rowKeys.length, "French comparison publication page does not enumerate every result row");
  assert.doesNotMatch(`${enPage.binding.path} ${frPage.binding.path}`, /synthetic|fixture|illustrative|example/i, "published comparison pages cannot be synthetic");
  const metadata = readBoundJson(publication.metadata, "comparison publication metadata");
  exactKeys(metadata.document, ["claims", "enPage", "enPath", "frPage", "frPath", "publishedAt", "rowKeys", "schemaVersion", "status"], "comparison publication metadata");
  assert.equal(metadata.document.schemaVersion, "witness-tree/phase2-comparison-publication/1", "comparison publication metadata schema differs");
  assert.equal(metadata.document.status, "published-bilingual", "comparison publication metadata is not published");
  assert.deepEqual(metadata.document.claims, { comparisonResultsExist: true, productAccuracyClaim: false, released: false, productionEligible: false }, "comparison publication claim boundary differs");
  assert.deepEqual({ enPath: metadata.document.enPath, frPath: metadata.document.frPath, publishedAt: metadata.document.publishedAt }, { enPath: publication.enPath, frPath: publication.frPath, publishedAt: publication.publishedAt }, "comparison publication metadata differs");
  assertBindingReference(metadata.document.enPage, enPage.binding, "English publication metadata/page");
  assertBindingReference(metadata.document.frPage, frPage.binding, "French publication metadata/page");
  assert.deepEqual(metadata.document.rowKeys, rowKeys, "comparison publication metadata does not enumerate every result row");
  return publication;
}

function validateClaims(value: unknown): typeof requiredClaims {
  assert.deepEqual(value, requiredClaims, "comparison evidence claim boundary differs");
  return requiredClaims;
}

export function validateIndependentComparisonEvidence(evidence: UnknownRecord): UnknownRecord {
  // An explicit override is an operator input, not evidence. Validate it even
  // for a test-only envelope so a typo or redirect cannot silently fall back
  // to the repository's internal compatibility path.
  if (process.env.WITNESS_TREE_DATA_ROOT !== undefined) comparisonDataRoot();
  exactKeys(
    evidence ?? {},
    ["claims", "comparisonScope", "contract", "contracts", "harvestComparisons", "inputs", "nbacComparisons", "ntemsHansenCrossCheck", "publication", "schemaVersion", "status", "witnessTree"],
    "independent comparison evidence",
  );
  assertNoNulls(evidence, "independent comparison evidence");
  assert.equal(evidence.schemaVersion, evidenceSchema, "independent comparison evidence schema version differs");
  assert.equal(evidence.status, "completed", "independent comparison evidence must be completed");
  const scope = validateScope(evidence.comparisonScope);
  const contract = validateRealComparisonContract(evidence.contract, scope);
  const contracts = validateContracts(evidence.contracts);
  assertRequiredInputIds(evidence.inputs);
  const inputs = new Map(evidence.inputs.map((input) => {
    const validated = validateAdmittedInput(input);
    return [validated.id, validated] as const;
  }));
  const allSourceHashes = evidence.inputs.flatMap((input) => (input.artifacts as UnknownRecord[]).map((artifact) => artifact.sha256));
  assert.equal(new Set(allSourceHashes).size, allSourceHashes.length, "independent source artifacts must not collapse distinct inputs");
  const witnessTree = validateWitnessTree(evidence.witnessTree, contracts);
  const expectedKeys = [...expectedHarvestKeys(scope), "NBAC:2022", "Hansen:cross-check"].sort();
  assert.deepEqual([...witnessTree.aggregate.keys()].sort(), expectedKeys, "Witness Tree comparison aggregate does not enumerate every comparison key");
  validateHarvestRows(evidence.harvestComparisons, scope, inputs, witnessTree.outputIds, witnessTree.aggregate);
  validateNbacRows(evidence.nbacComparisons, witnessTree.outputIds, inputs, witnessTree.aggregate);
  const crossCheck = validateHansenCrossCheck(evidence.ntemsHansenCrossCheck, inputs, witnessTree.outputIds, witnessTree.aggregate);
  const rowKeys = expectedKeys;
  const publication = validatePublication(evidence.publication, rowKeys);
  const claims = validateClaims(evidence.claims);
  return {
    status: "completed",
    scope: { provinces: scope.provinces, years: scope.years, amendment: scope.amendment },
    contract: { schemaVersion: contract.schemaVersion, status: contract.status },
    inputs: requiredInputIds.map((id) => ({ id, artifacts: inputs.get(id)?.artifacts.length ?? 0 })),
    provincialHarvestRows: (evidence.harvestComparisons as unknown[]).length,
    nbacRows: (evidence.nbacComparisons as unknown[]).length,
    hansenCrossCheck: { status: crossCheck.status, sampleSize: crossCheck.sampleSize, resultClaims: crossCheck.resultClaims },
    publication,
    claims,
  };
}

function readMetadataJson(path: string, label: string): UnknownRecord {
  const absolutePath = resolveMetadataPath(path, label);
  const info = lstatSync(absolutePath);
  assert(!info.isSymbolicLink() && info.isFile(), `${label} must be a regular file`);
  assert(info.size <= maxJsonBytes, `${label} exceeds the safe ${maxJsonBytes}-byte read limit`);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} must contain valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} JSON object is required`);
  return value as UnknownRecord;
}

function currentReadiness(): UnknownRecord {
  const availability = readMetadataJson(availabilityPath, "comparison availability record");
  const sources = Array.isArray(availability.sources) ? availability.sources : [];
  const publishedComparisons = Array.isArray(availability.publishedComparisons) ? availability.publishedComparisons : [];
  const missingInputs = sources
    .filter((source) => source && typeof source === "object" && (source as UnknownRecord).comparisonStatus !== "complete")
    .map((source) => {
      const item = source as UnknownRecord;
      return { id: item.id, status: item.comparisonStatus, missing: item.missing };
    });
  const missingResults = publishedComparisons
    .filter((comparison) => comparison && typeof comparison === "object" && Object.entries(comparison as UnknownRecord)
      .filter(([key]) => ["witnessTreeHectares", "referenceHectares", "absoluteDifferenceHectares", "relativeDifference"].includes(key))
      .some(([, value]) => value === null))
    .map((comparison) => ({ kind: (comparison as UnknownRecord).kind, status: "missing-results" }));
  return {
    status: "ready-missing-inputs-and-results",
    availabilityStatus: availability.status,
    formalPhase2ComparisonGateComplete: availability.formalPhase2ComparisonGateComplete,
    missingInputs,
    missingResults,
    requiredResults: { provincialHarvestRows: requiredProvinces.length * baselineYears.length, nbacRows: 1, hansenCrossCheck: 1 },
    completedResults: { provincialHarvestRows: 0, nbacRows: 0, hansenCrossCheck: 0 },
    claims: { comparisonResultsExist: false, productAccuracyClaim: false, released: false, productionEligible: false },
  };
}

function main(): void {
  const evidenceIndex = process.argv.indexOf("--evidence");
  if (evidenceIndex === -1) {
    console.log(JSON.stringify(currentReadiness(), null, 2));
    return;
  }
  assert(evidenceIndex + 1 < process.argv.length, "--evidence requires a JSON path");
  const evidencePath = process.argv[evidenceIndex + 1];
  const evidence = readMetadataJson(evidencePath, "comparison evidence envelope");
  console.log(JSON.stringify(validateIndependentComparisonEvidence(evidence), null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === resolveInputPath("scripts/check-phase2-independent-comparison-evidence.mts")) main();
