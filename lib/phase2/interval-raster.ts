/**
 * Local, non-production rules for a Version 2.1 whole-interval change raster.
 *
 * A cell value of 1 means a loss was observed in at least one annual loss
 * layer. A cell value of 0 means every supplied annual layer explicitly found
 * no loss. 255 remains Unknown: it must never be collapsed to 0.
 */
export const INTERVAL_NODATA = 255 as const;

export type IntervalCell = 0 | 1 | typeof INTERVAL_NODATA;

export interface IntervalRasterInput {
  readonly fromYear: number;
  readonly toYear: number;
  readonly width: number;
  readonly height: number;
  readonly gridId: string;
  readonly cells: readonly IntervalCell[];
}

export interface IntervalRasterOutput {
  readonly fromYear: number;
  readonly toYear: number;
  readonly width: number;
  readonly height: number;
  readonly gridId: string;
  readonly cells: readonly IntervalCell[];
  readonly semantics: "observed-loss-anywhere-in-whole-interval";
  readonly productionEligible: false;
}

/** The minimum sidecar that a future checksum-bound interval output must carry. */
export interface IntervalRasterSidecar {
  readonly fromYear: number;
  readonly toYear: number;
  readonly annualInputSha256: readonly { readonly fromYear: number; readonly toYear: number; readonly sha256: string }[];
  readonly outputSha256: string;
  readonly outputByteLength: number;
  readonly methodVersion: string;
  readonly codeVersion: string;
  readonly gridId: string;
  readonly crs: string;
  readonly geotransform: readonly number[];
  readonly noDataValue: typeof INTERVAL_NODATA;
  readonly coverage: "complete" | "partial-with-unknown";
  readonly elapsedSeconds: number;
  readonly peakRssBytes: number;
  readonly productionEligible: false;
}

function assertYear(year: number, name: string): void {
  if (!Number.isInteger(year)) throw new Error(`${name} must be an integer year.`);
}

function assertCell(value: number, inputLabel: string, index: number): asserts value is IntervalCell {
  if (value !== 0 && value !== 1 && value !== INTERVAL_NODATA) {
    throw new Error(`${inputLabel} cell ${index} must be 0, 1, or ${INTERVAL_NODATA}.`);
  }
}

function assertInput(input: IntervalRasterInput, index: number): void {
  const label = `Interval input ${index}`;
  assertYear(input.fromYear, `${label} fromYear`);
  assertYear(input.toYear, `${label} toYear`);
  if (input.toYear !== input.fromYear + 1) throw new Error(`${label} must describe one adjacent annual pair.`);
  if (!Number.isSafeInteger(input.width) || input.width <= 0 || !Number.isSafeInteger(input.height) || input.height <= 0) {
    throw new Error(`${label} must have a positive integer grid size.`);
  }
  if (!input.gridId.trim()) throw new Error(`${label} requires a grid identity.`);
  if (input.cells.length !== input.width * input.height) throw new Error(`${label} cell count does not match its grid size.`);
  input.cells.forEach((value, cellIndex) => assertCell(value, label, cellIndex));
}

function assertSha256(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be a lower-case SHA-256 digest.`);
}

/**
 * Rejects an interval sidecar unless it binds every annual pair, grid rule,
 * output hash, and basic run measurement. This validates metadata only; it
 * never upgrades an output from non-production to admitted or released.
 */
export function assertIntervalRasterSidecar(sidecar: IntervalRasterSidecar): IntervalRasterSidecar {
  assertYear(sidecar.fromYear, "Sidecar fromYear");
  assertYear(sidecar.toYear, "Sidecar toYear");
  if (sidecar.toYear <= sidecar.fromYear) throw new Error("A sidecar interval must end after it starts.");
  if (!sidecar.gridId.trim() || !sidecar.crs.trim()) throw new Error("A sidecar requires a grid identity and CRS.");
  if (sidecar.noDataValue !== INTERVAL_NODATA) throw new Error("A sidecar must preserve nodata as 255.");
  if (sidecar.geotransform.length !== 6 || sidecar.geotransform.some((value) => !Number.isFinite(value))) {
    throw new Error("A sidecar requires a six-number geotransform.");
  }
  if (!Number.isSafeInteger(sidecar.outputByteLength) || sidecar.outputByteLength <= 0) {
    throw new Error("A sidecar requires a positive integer output byte length.");
  }
  assertSha256(sidecar.outputSha256, "Output SHA-256");
  if (!sidecar.methodVersion.trim() || !sidecar.codeVersion.trim()) throw new Error("A sidecar requires method and code versions.");
  if (sidecar.coverage !== "complete" && sidecar.coverage !== "partial-with-unknown") throw new Error("A sidecar coverage state is invalid.");
  if (!Number.isFinite(sidecar.elapsedSeconds) || sidecar.elapsedSeconds < 0) throw new Error("A sidecar requires a non-negative elapsed time.");
  if (!Number.isSafeInteger(sidecar.peakRssBytes) || sidecar.peakRssBytes <= 0) {
    throw new Error("A sidecar requires a measured positive-integer peak RSS.");
  }
  if (sidecar.productionEligible !== false) throw new Error("A local interval sidecar cannot claim production eligibility.");
  if (sidecar.annualInputSha256.length !== sidecar.toYear - sidecar.fromYear) {
    throw new Error("A sidecar must bind every annual pair in its whole interval.");
  }
  sidecar.annualInputSha256.forEach((input, index) => {
    if (input.fromYear !== sidecar.fromYear + index || input.toYear !== input.fromYear + 1) {
      throw new Error("Sidecar annual inputs must be chronological adjacent pairs without gaps.");
    }
    assertSha256(input.sha256, `Annual input ${input.fromYear}-${input.toYear} SHA-256`);
  });
  return sidecar;
}

/**
 * Aggregates adjacent annual loss rasters into one selected-snapshot interval.
 * The input must cover every annual pair in chronological order. It is pure,
 * deterministic, and deliberately cannot label an output production eligible.
 */
export function aggregateWholeIntervalChange(
  fromYear: number,
  toYear: number,
  annualLossRasters: readonly IntervalRasterInput[],
): IntervalRasterOutput {
  assertYear(fromYear, "Interval fromYear");
  assertYear(toYear, "Interval toYear");
  if (toYear <= fromYear) throw new Error("An interval must end after it starts.");
  if (annualLossRasters.length !== toYear - fromYear) {
    throw new Error("An interval must provide exactly one annual loss raster for every adjacent year pair.");
  }

  annualLossRasters.forEach(assertInput);
  const first = annualLossRasters[0];
  if (!first) throw new Error("An interval needs annual loss rasters.");

  annualLossRasters.forEach((input, index) => {
    if (input.fromYear !== fromYear + index || input.toYear !== fromYear + index + 1) {
      throw new Error("Annual loss rasters must be chronological and cover the whole selected interval without gaps.");
    }
    if (input.width !== first.width || input.height !== first.height || input.gridId !== first.gridId) {
      throw new Error("Annual loss rasters must share one exact raster grid identity and dimensions.");
    }
  });

  const cells: IntervalCell[] = [];
  for (let index = 0; index < first.cells.length; index += 1) {
    const values = annualLossRasters.map((input) => input.cells[index]);
    // A positively observed loss remains a Figure even if another annual pair
    // is Unknown; the product never claims that it knows the complete history.
    if (values.includes(1)) cells.push(1);
    else if (values.includes(INTERVAL_NODATA)) cells.push(INTERVAL_NODATA);
    else cells.push(0);
  }

  return Object.freeze({
    fromYear,
    toYear,
    width: first.width,
    height: first.height,
    gridId: first.gridId,
    cells: Object.freeze(cells),
    semantics: "observed-loss-anywhere-in-whole-interval",
    productionEligible: false,
  });
}
