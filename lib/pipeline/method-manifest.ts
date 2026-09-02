import { createHash } from "node:crypto";

import type { PrecedenceEventKind } from "./precedence";

const SHA256 = /^[a-f0-9]{64}$/;
const PRECEDENCE_KINDS = new Set<PrecedenceEventKind>([
  "fire",
  "recorded-harvest",
  "insect-disease",
  "other-intervention",
  "unmatched-detected-change",
]);

export type MethodParameters = Readonly<{
  matching: Readonly<{
    minimumOverlapOfSmallerGeometry: number;
    standardTemporalToleranceYears: number;
    historicalTemporalToleranceYears: number;
    historicalYearExclusive: number;
    multipleCandidateRule: "highest-overlap-stable-input-order";
  }>;
  precedence: readonly PrecedenceEventKind[];
  mask: Readonly<{
    forestClassCrosswalkStatus: "synthetic-test-only" | "owner-approved-versioned-nonproduction";
    forestClassValues: readonly number[];
    nodataPolicy: "preserve";
    implicitReprojection: "forbidden";
  }>;
  vectorization: Readonly<{
    connectivity: 4 | 8;
    minimumPatchPixels: number;
    simplifyToleranceMetres: number;
    dissolveAdjacentCells: boolean;
  }>;
  aggregation: Readonly<{
    denominatorReference: "first-year-of-range";
    overlapPolicy: "precedence-once-per-hectare-year";
    areaUnit: "hectare";
    decimalPlaces: number;
  }>;
  boundary: Readonly<{
    cellIntersection: "fractional-area";
    gridAlignment: "exact";
    snapToleranceMetres: number;
    boundaryEditionRequired: true;
    crossEditionComparison: "reject-without-acknowledgement";
  }>;
  /**
   * Present only on a method that measures spans rather than single years. Absent on the
   * annual method, so the annual manifest keeps the canonical hash it was admitted with.
   */
  interval?: Readonly<{
    firstYear: number;
    lastYear: number;
    annualStepCount: number;
    spanCount: number;
    spanEnumeration: "every-ordered-pair-of-years";
    unionAccounting: "cell-counted-once-per-span";
    unionDenominator: "known-forest-cells-at-opening-year";
    summedAccounting: "annual-counts-added";
    summedPercentAllowed: false;
    netChangeIncluded: false;
  }>;
}>;

export type MethodParameterManifest = Readonly<{
  schemaVersion: 1;
  methodVersion: string;
  parameterSha256: string;
  reviewStatus: "unapproved" | "owner-approved-versioned-nonproduction";
  scope: "owner-independent-phase2-method-contract" | "versioned-nonproduction-national-processing";
  productionEligible: false;
  parameters: MethodParameters;
}>;

export type MethodParameterIdentity = Readonly<{
  methodVersion: string;
  parameterSha256: string;
  canonicalParameters: string;
  productionEligible: false;
}>;

export type MethodChangeMarker = Readonly<{
  schemaVersion: 1;
  previousMethodVersion: string;
  nextMethodVersion: string;
  previousParameterSha256: string;
  nextParameterSha256: string;
  recomputationRequired: true;
  releaseNoteRequired: true;
  releaseNoteId: string;
  productionEligible: false;
}>;

function canonicalValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical method parameters cannot contain non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (keys.some((key) => record[key] === undefined)) throw new Error("Canonical method parameters cannot contain undefined values.");
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalValue(record[key])}`).join(",")}}`;
  }
  throw new Error("Canonical method parameters must contain JSON values only.");
}

export function canonicalMethodParameters(parameters: MethodParameters): string {
  return `${canonicalValue(parameters)}\n`;
}

export function methodParameterSha256(parameters: MethodParameters): string {
  return createHash("sha256").update(canonicalMethodParameters(parameters)).digest("hex");
}

function integerAtLeast(value: number, minimum: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${label} must be an integer of at least ${minimum}.`);
}

export function validateMethodManifest(manifest: MethodParameterManifest): MethodParameterIdentity {
  if (manifest.schemaVersion !== 1 || !manifest.methodVersion.trim()) throw new Error("Method manifest requires schema version 1 and a method version.");
  const synthetic = manifest.reviewStatus === "unapproved" && manifest.scope === "owner-independent-phase2-method-contract";
  const approved = manifest.reviewStatus === "owner-approved-versioned-nonproduction" && manifest.scope === "versioned-nonproduction-national-processing";
  if ((!synthetic && !approved) || manifest.productionEligible !== false) {
    throw new Error("Method review status and scope must form an exact non-production pair.");
  }

  const { matching, precedence, mask, vectorization, aggregation, boundary } = manifest.parameters;
  if (!Number.isFinite(matching.minimumOverlapOfSmallerGeometry) || matching.minimumOverlapOfSmallerGeometry <= 0 || matching.minimumOverlapOfSmallerGeometry > 1) {
    throw new Error("Matching overlap must be in (0, 1].");
  }
  integerAtLeast(matching.standardTemporalToleranceYears, 0, "Standard temporal tolerance");
  integerAtLeast(matching.historicalTemporalToleranceYears, 0, "Historical temporal tolerance");
  integerAtLeast(matching.historicalYearExclusive, 1, "Historical cutoff year");
  if (matching.multipleCandidateRule !== "highest-overlap-stable-input-order") throw new Error("The multiple-candidate rule is invalid.");

  if (precedence.length !== PRECEDENCE_KINDS.size || new Set(precedence).size !== precedence.length || precedence.some((kind) => !PRECEDENCE_KINDS.has(kind))) {
    throw new Error("Precedence must contain every registered event kind exactly once.");
  }
  const expectedCrosswalkStatus = approved ? "owner-approved-versioned-nonproduction" : "synthetic-test-only";
  if (mask.forestClassCrosswalkStatus !== expectedCrosswalkStatus || mask.forestClassValues.length === 0 || new Set(mask.forestClassValues).size !== mask.forestClassValues.length || mask.forestClassValues.some((value) => !Number.isSafeInteger(value))) {
    throw new Error("Mask forest classes must be non-empty, unique integers.");
  }
  if (approved && JSON.stringify(mask.forestClassValues) !== "[210,220,230]") throw new Error("The approved conservative crosswalk must contain only classes 210, 220, and 230.");
  if (mask.nodataPolicy !== "preserve" || mask.implicitReprojection !== "forbidden") throw new Error("Mask nodata and reprojection policies are invalid.");

  if (![4, 8].includes(vectorization.connectivity)) throw new Error("Vectorization connectivity must be 4 or 8.");
  integerAtLeast(vectorization.minimumPatchPixels, 1, "Minimum patch pixels");
  if (!Number.isFinite(vectorization.simplifyToleranceMetres) || vectorization.simplifyToleranceMetres < 0 || typeof vectorization.dissolveAdjacentCells !== "boolean") {
    throw new Error("Vectorization parameters require a non-negative tolerance and explicit dissolve rule.");
  }
  if (aggregation.denominatorReference !== "first-year-of-range" || aggregation.overlapPolicy !== "precedence-once-per-hectare-year" || aggregation.areaUnit !== "hectare") {
    throw new Error("Aggregation parameters do not satisfy the registered denominator and overlap rules.");
  }
  integerAtLeast(aggregation.decimalPlaces, 0, "Aggregation decimal places");
  if (aggregation.decimalPlaces > 9) throw new Error("Aggregation decimal places cannot exceed 9.");
  if (boundary.cellIntersection !== "fractional-area" || boundary.gridAlignment !== "exact" || !Number.isFinite(boundary.snapToleranceMetres) || boundary.snapToleranceMetres < 0 || boundary.boundaryEditionRequired !== true || boundary.crossEditionComparison !== "reject-without-acknowledgement") {
    throw new Error("Boundary parameters do not satisfy the registered edition and grid rules.");
  }

  const { interval } = manifest.parameters;
  if (interval !== undefined) {
    integerAtLeast(interval.firstYear, 1, "Interval first year");
    integerAtLeast(interval.lastYear, 1, "Interval last year");
    if (interval.lastYear <= interval.firstYear) throw new Error("An interval method must close after it opens.");
    if (interval.annualStepCount !== interval.lastYear - interval.firstYear) throw new Error("Interval annual steps must equal the number of year boundaries in the record.");
    if (interval.spanCount !== (interval.annualStepCount * (interval.annualStepCount + 1)) / 2) throw new Error("Interval span count must equal every ordered pair of years in the record.");
    if (interval.spanEnumeration !== "every-ordered-pair-of-years" || interval.unionAccounting !== "cell-counted-once-per-span" || interval.summedAccounting !== "annual-counts-added") {
      throw new Error("Interval accounting rules are invalid.");
    }
    if (interval.unionDenominator !== "known-forest-cells-at-opening-year" || aggregation.denominatorReference !== "first-year-of-range") {
      throw new Error("The interval denominator must be the known forest at the opening year, matching the registered aggregation denominator.");
    }
    // The percentage ban is a property of the method, not of the copy that renders it.
    if (interval.summedPercentAllowed !== false) throw new Error("A summed interval total can never carry a percentage.");
    if (interval.netChangeIncluded !== false) throw new Error("An interval method does not report net change.");
  }

  const canonicalParameters = canonicalMethodParameters(manifest.parameters);
  const parameterSha256 = methodParameterSha256(manifest.parameters);
  if (!SHA256.test(manifest.parameterSha256) || manifest.parameterSha256 !== parameterSha256) {
    throw new Error("Method manifest parameter SHA-256 does not match its canonical parameters.");
  }
  return Object.freeze({
    methodVersion: manifest.methodVersion,
    parameterSha256,
    canonicalParameters,
    productionEligible: false,
  });
}

export function gateMethodChange(
  previous: MethodParameterManifest,
  next: MethodParameterManifest,
  marker?: MethodChangeMarker,
): Readonly<{ changed: boolean; identity: MethodParameterIdentity }> {
  const previousIdentity = validateMethodManifest(previous);
  const nextIdentity = validateMethodManifest(next);
  const changed = previousIdentity.parameterSha256 !== nextIdentity.parameterSha256;

  if (!changed) {
    if (previous.methodVersion !== next.methodVersion) throw new Error("A method version cannot change when its canonical parameters are unchanged.");
    if (marker !== undefined) throw new Error("An unchanged method must not carry a recomputation or release-note marker.");
    return Object.freeze({ changed: false, identity: nextIdentity });
  }

  if (previous.methodVersion === next.methodVersion) throw new Error("Changed parameters require a new method version.");
  if (!marker || marker.schemaVersion !== 1 || marker.productionEligible !== false || marker.recomputationRequired !== true || marker.releaseNoteRequired !== true || !marker.releaseNoteId.trim()) {
    throw new Error("Changed parameters require a non-production recomputation and release-note marker.");
  }
  if (marker.previousMethodVersion !== previous.methodVersion || marker.nextMethodVersion !== next.methodVersion || marker.previousParameterSha256 !== previousIdentity.parameterSha256 || marker.nextParameterSha256 !== nextIdentity.parameterSha256 || !SHA256.test(marker.previousParameterSha256) || !SHA256.test(marker.nextParameterSha256)) {
    throw new Error("The method-change marker must bind both exact versions and canonical parameter hashes.");
  }
  return Object.freeze({ changed: true, identity: nextIdentity });
}
