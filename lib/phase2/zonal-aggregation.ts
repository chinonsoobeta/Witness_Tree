/**
 * Contract helpers for Phase 2 raster-first boundary summaries.
 *
 * The GDAL worker is deliberately separate: it reads one bounded feature at a
 * time and only rasterizes that feature into finite windows.  These helpers
 * validate the evidence it writes; they never convert a national raster to
 * polygons or turn Unknown coverage into a numeric claim.
 */
export const ZONAL_NODATA = 255 as const;

export type CoverageGrade = "complete" | "partial-with-unknown";
export type BoundaryClassification = "authoritative-boundary" | "illustrative";
export type AdmissionStatus = "admitted" | "not-admitted";

export interface ZonalAggregationInputEvidence {
  readonly boundaryEdition: string;
  readonly boundaryIdField: string;
  readonly forestMaskVersion: string;
  readonly changeRasterVersion: string;
  readonly timeVersion: string;
  readonly sourceVersion: string;
  readonly forestMaskSha256: string;
  readonly changeRasterSha256: string;
  readonly boundarySha256: string;
  readonly gridCrs: string;
  readonly gridCrsSha256: string;
  readonly boundarySourceCrs: string;
  readonly boundaryWorkingCrs: string;
  readonly boundaryGeometryReadPolicy: "shapefile-ring-orientation-only-ccw" | "driver-default";
  readonly reprojection: "identical-crs" | "reprojected";
  readonly reprojectionEvidence: string | null;
  readonly boundaryClassification: BoundaryClassification;
  readonly admissionStatus: AdmissionStatus;
  readonly admissionRecord: string | null;
}

export interface ZonalAggregationRow {
  readonly boundaryId: string;
  readonly knownForestedHectares: number;
  readonly lossHectares: number;
  /** Area where either required input is Unknown; never folded into the denominator. */
  readonly unknownRequiredInputHectares: number;
  /** Observed interval loss outside the first-year forest denominator; disclosed, never folded into the rate. */
  readonly observedLossOutsideFirstYearForestHectares: number;
  readonly coverageGrade: CoverageGrade;
  /** Null is deliberate: no denominator means no rate. */
  readonly observedLossPercent: number | null;
}

export interface ZonalAggregationSidecar {
  readonly schemaVersion: "phase2-zonal-aggregation-v1";
  readonly algorithm: "windowed-bounded-feature-rasterization";
  readonly nationalPerCellGeometryMaterialized: false;
  readonly input: ZonalAggregationInputEvidence;
  readonly outputSha256: string;
  readonly outputByteLength: number;
  readonly execution: {
    readonly codeVersion: string;
    readonly workerSha256: string;
    readonly startedAt: string;
    readonly completedAt: string;
    readonly elapsedSeconds: number;
    readonly peakRssBytes: number;
    readonly maximumScratchAllocatedBytes: number;
    readonly featureCount: number;
    readonly parameters: {
      readonly rowWindow: number;
      readonly columnWindow: number;
      readonly gdalCacheBytes: number;
      readonly nodata: typeof ZONAL_NODATA;
      readonly cellHectares: number;
    };
    readonly environment: {
      readonly pythonVersion: string;
      readonly gdalVersion: string;
      readonly numpyVersion: string;
    };
  };
  readonly rows: readonly ZonalAggregationRow[];
  /** A local/illustrative run may exist, but is not a production claim. */
  readonly productionClaim: boolean;
}

function requireText(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required.`);
}

function requireSha256(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be a lower-case SHA-256 digest.`);
}

function requireNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite non-negative number.`);
}

/**
 * Rejects weak provenance before an aggregation can be described as
 * production.  In particular, a synthetic/illustrative boundary may be used
 * in a local fixture but can never support a production claim.
 */
export function assertZonalAggregationSidecar(sidecar: ZonalAggregationSidecar): ZonalAggregationSidecar {
  if (sidecar.schemaVersion !== "phase2-zonal-aggregation-v1") throw new Error("Unsupported zonal sidecar schema.");
  if (sidecar.algorithm !== "windowed-bounded-feature-rasterization") throw new Error("The aggregation must be windowed and feature-bounded.");
  if (sidecar.nationalPerCellGeometryMaterialized !== false) throw new Error("National per-cell geometry materialization is prohibited.");
  const input = sidecar.input;
  [
    [input.boundaryEdition, "Boundary edition"], [input.boundaryIdField, "Boundary ID field"], [input.forestMaskVersion, "Forest-mask version"],
    [input.changeRasterVersion, "Change-raster version"],
    [input.timeVersion, "Time version"], [input.sourceVersion, "Source version"],
    [input.gridCrs, "Grid CRS"], [input.gridCrsSha256, "Grid CRS SHA-256"],
    [input.boundarySourceCrs, "Boundary source CRS"], [input.boundaryWorkingCrs, "Boundary working CRS"],
    [input.boundaryGeometryReadPolicy, "Boundary geometry read policy"],
  ].forEach(([value, label]) => requireText(value, label));
  requireSha256(input.forestMaskSha256, "Forest-mask SHA-256");
  requireSha256(input.changeRasterSha256, "Change-raster SHA-256");
  requireSha256(input.boundarySha256, "Boundary SHA-256");
  requireSha256(input.gridCrsSha256, "Grid CRS SHA-256");
  if (input.reprojection === "identical-crs" && input.reprojectionEvidence !== null) {
    throw new Error("Identical CRS evidence must not invent a reprojection record.");
  }
  if (input.reprojection === "reprojected" && !input.reprojectionEvidence?.trim()) {
    throw new Error("A reprojected boundary requires reprojection evidence.");
  }
  requireSha256(sidecar.outputSha256, "Output SHA-256");
  if (!Number.isSafeInteger(sidecar.outputByteLength) || sidecar.outputByteLength <= 0) {
    throw new Error("Output byte length must be a positive safe integer.");
  }
  if (!sidecar.rows.length) throw new Error("A zonal aggregation requires at least one boundary row.");
  const execution = sidecar.execution;
  requireText(execution.codeVersion, "Code version");
  requireSha256(execution.workerSha256, "Worker SHA-256");
  for (const [value, label] of [[execution.startedAt, "Execution start"], [execution.completedAt, "Execution completion"], [execution.environment.pythonVersion, "Python version"], [execution.environment.gdalVersion, "GDAL version"], [execution.environment.numpyVersion, "NumPy version"]] as const) requireText(value, label);
  if (!Number.isFinite(Date.parse(execution.startedAt)) || !Number.isFinite(Date.parse(execution.completedAt)) || Date.parse(execution.completedAt) < Date.parse(execution.startedAt)) throw new Error("Execution timestamps must be ordered ISO dates.");
  if (!Number.isFinite(execution.elapsedSeconds) || execution.elapsedSeconds <= 0) throw new Error("Execution elapsed seconds must be positive.");
  for (const [value, label] of [[execution.peakRssBytes, "Peak RSS bytes"], [execution.parameters.gdalCacheBytes, "GDAL cache bytes"]] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer.`);
  }
  if (!Number.isSafeInteger(execution.maximumScratchAllocatedBytes) || execution.maximumScratchAllocatedBytes < 0) throw new Error("Maximum scratch allocated bytes must be a non-negative safe integer.");
  for (const [value, label] of [[execution.parameters.rowWindow, "Row window"], [execution.parameters.columnWindow, "Column window"]] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer.`);
  }
  if (execution.parameters.nodata !== ZONAL_NODATA) throw new Error("Execution nodata must remain 255.");
  requireNonNegative(execution.parameters.cellHectares, "Cell hectares");
  if (execution.parameters.cellHectares === 0) throw new Error("Cell hectares must be positive.");
  if (execution.featureCount !== sidecar.rows.length) throw new Error("Execution feature count must equal the output row count.");
  const ids = new Set<string>();
  for (const row of sidecar.rows) {
    requireText(row.boundaryId, "Boundary identifier");
    if (ids.has(row.boundaryId)) throw new Error(`Duplicate boundary identifier: ${row.boundaryId}.`);
    ids.add(row.boundaryId);
    requireNonNegative(row.knownForestedHectares, "Known forested hectares");
    requireNonNegative(row.lossHectares, "Loss hectares");
    requireNonNegative(row.unknownRequiredInputHectares, "Unknown required-input hectares");
    requireNonNegative(row.observedLossOutsideFirstYearForestHectares, "Observed loss outside first-year forest hectares");
    if (row.lossHectares > row.knownForestedHectares) throw new Error("Loss hectares cannot exceed known forested hectares.");
    const expectedCoverage = row.unknownRequiredInputHectares === 0 ? "complete" : "partial-with-unknown";
    if (row.coverageGrade !== expectedCoverage) throw new Error("Coverage grade must preserve Unknown required-input area.");
    if (row.knownForestedHectares === 0 && row.observedLossPercent !== null) throw new Error("A zero denominator requires a null loss percentage.");
    if (row.knownForestedHectares > 0) {
      const expected = (row.lossHectares / row.knownForestedHectares) * 100;
      if (typeof row.observedLossPercent !== "number" || !Number.isFinite(row.observedLossPercent) || Math.abs(row.observedLossPercent - expected) > 1e-9) {
        throw new Error("Observed loss percentage must be calculated only from known forested hectares.");
      }
    }
  }
  if (sidecar.productionClaim) {
    if (input.boundaryClassification !== "authoritative-boundary") throw new Error("Illustrative geometry cannot support a production claim.");
    if (input.admissionStatus !== "admitted" || !input.admissionRecord?.trim()) throw new Error("A production claim requires an admitted input record.");
  }
  return sidecar;
}
