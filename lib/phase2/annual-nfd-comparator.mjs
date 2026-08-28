/**
 * Pure, nonproduction join for annual zonal output and the profiled NFD
 * harvest-statistics frame.
 *
 * The annual worker emits a 1984 forest-mask snapshot followed by adjacent
 * intervals. This module joins each interval to the NFD row named by
 * `toYear`, and returns only the 1985 through 2022 comparison rows. It does
 * not write an evidence envelope, alter a gate, or make an admission or
 * release decision.
 */

export const COMPARATOR_PROVINCES = Object.freeze(["BC", "AB", "ON", "QC"]);
export const COMPARATOR_BASELINE_YEAR = 1984;
export const COMPARATOR_START_YEAR = 1985;
export const COMPARATOR_END_YEAR = 2022;
export const COMPARATOR_ANNUAL_PAIR_COUNT = COMPARATOR_END_YEAR - COMPARATOR_BASELINE_YEAR;
export const COMPARATOR_ROW_COUNT = COMPARATOR_PROVINCES.length * COMPARATOR_ANNUAL_PAIR_COUNT;
export const COMPARATOR_BASELINE_ROW_COUNT = COMPARATOR_PROVINCES.length;

export const PROVISIONAL_COMPARISON_CLAIMS = Object.freeze({
  causalAttributionClaim: false,
  productAccuracyClaim: false,
  equivalenceClaim: false,
  likeForLikeClaim: false,
  admitted: false,
  released: false,
  productionEligible: false,
});

export const PROVISIONAL_COMPARISON_LABEL =
  "NFD reported harvest and Witness Tree observed forest loss are non-like-for-like quantities; differences are descriptive only.";

const CLAIM_FIELDS = Object.freeze([
  "causalAttributionClaim",
  "productAccuracyClaim",
  "equivalenceClaim",
  "likeForLikeClaim",
  "admitted",
  "released",
  "productionEligible",
]);

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
}

function assertInteger(value, label) {
  if (!Number.isSafeInteger(value)) fail(`${label} must be a safe integer`);
}

function assertFiniteNonNegative(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(`${label} must be a finite non-negative number`);
  }
}

function assertProvince(province, label) {
  if (!COMPARATOR_PROVINCES.includes(province)) fail(`${label} must be BC, AB, ON, or QC`);
}

function decimalParts(value, label) {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) {
    fail(`${label} must be a non-negative decimal`);
  }
  const [whole, fraction = ""] = text.split(".");
  return normalizeDecimal({ coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length });
}

function normalizeDecimal(value) {
  let coefficient = value.coefficient;
  let scale = value.scale;
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }
  return { coefficient, scale };
}

function alignDecimals(left, right) {
  const scale = Math.max(left.scale, right.scale);
  return {
    left: left.coefficient * 10n ** BigInt(scale - left.scale),
    right: right.coefficient * 10n ** BigInt(scale - right.scale),
    scale,
  };
}

function subtractDecimals(left, right) {
  const aligned = alignDecimals(left, right);
  return { coefficient: aligned.left - aligned.right, scale: aligned.scale };
}

function absoluteDecimal(value) {
  return { coefficient: value.coefficient < 0n ? -value.coefficient : value.coefficient, scale: value.scale };
}

function decimalString(value) {
  const normalized = normalizeDecimal({ coefficient: value.coefficient, scale: value.scale });
  const negative = normalized.coefficient < 0n;
  const digits = (negative ? -normalized.coefficient : normalized.coefficient).toString();
  if (normalized.scale === 0) return `${negative ? "-" : ""}${digits}`;
  const padded = digits.padStart(normalized.scale + 1, "0");
  const split = padded.length - normalized.scale;
  return `${negative ? "-" : ""}${padded.slice(0, split)}.${padded.slice(split)}`;
}

function decimalNumber(value, label) {
  const number = Number(decimalString(value));
  if (!Number.isFinite(number)) fail(`${label} is outside the finite numeric range`);
  return number;
}

function canonicalValue(value, label) {
  assertFiniteNonNegative(value, label);
  return decimalParts(value, label);
}

function canonicalExactValue(value, label) {
  if (typeof value !== "string") fail(`${label} exact value must be a decimal string`);
  const decimal = decimalParts(value, label);
  return { decimal, exact: decimalString(decimal) };
}

function assertSameNumberAndExact(value, exact, label) {
  if (exact === null || exact === undefined) return;
  const parsed = canonicalExactValue(exact, `${label} exact value`);
  if (decimalNumber(parsed.decimal, label) !== value) fail(`${label} and exact value disagree`);
  return parsed;
}

function annualLossValue(row, key) {
  if (!Object.hasOwn(row, "lossHectares")) fail(`${key} is missing lossHectares`);
  if (row.lossHectares === null) return null;
  assertFiniteNonNegative(row.lossHectares, `${key} lossHectares`);
  if (row.coverageGrade !== "complete" || row.unknownRequiredInputHectares !== 0) return null;
  const exact = row.lossHectaresExact === undefined
    ? decimalString(canonicalValue(row.lossHectares, `${key} lossHectares`))
    : row.lossHectaresExact;
  const parsed = assertSameNumberAndExact(row.lossHectares, exact, `${key} lossHectares`);
  return { number: row.lossHectares, decimal: parsed?.decimal ?? canonicalValue(row.lossHectares, `${key} lossHectares`), exact: parsed?.exact ?? exact };
}

function nfdTotalValue(row, key) {
  if (!Object.hasOwn(row, "areaHectares")) fail(`${key} is missing areaHectares`);
  const state = row.missingness?.state;
  if (!["complete", "complete-with-not-applicable", "partial-unknown", "no-source-rows"].includes(state)) {
    fail(`${key} has an unsupported missingness state`);
  }
  if (row.likeForLikeClaim !== false) fail(`${key} must retain likeForLikeClaim=false`);
  if (row.areaHectares === null || state === "partial-unknown" || state === "no-source-rows") return null;
  assertFiniteNonNegative(row.areaHectares, `${key} areaHectares`);
  const exact = row.areaHectaresExact === undefined
    ? decimalString(canonicalValue(row.areaHectares, `${key} areaHectares`))
    : row.areaHectaresExact;
  const parsed = assertSameNumberAndExact(row.areaHectares, exact, `${key} areaHectares`);
  return { number: row.areaHectares, decimal: parsed?.decimal ?? canonicalValue(row.areaHectares, `${key} areaHectares`), exact: parsed?.exact ?? exact };
}

function assertBaselineRow(row, index) {
  const key = `annualRows[${index}]`;
  assertPlainObject(row, key);
  if (row.rowType !== "baseline") fail(`${key} must remain an explicit 1984 baseline snapshot`);
  if (row.baselineYear !== COMPARATOR_BASELINE_YEAR || row.fromYear !== null || row.toYear !== null) {
    fail(`${key} baseline must be a 1984 snapshot with no annual interval`);
  }
  if (row.lossHectares !== null) fail(`${key} baseline cannot carry an annual loss value`);
  assertProvince(row.province, `${key} province`);
}

function assertAnnualRow(row, index) {
  const key = `annualRows[${index}]`;
  assertPlainObject(row, key);
  if (row.rowType !== "annual") fail(`${key} must be an annual row or an explicit baseline row`);
  if (row.baselineYear !== null) fail(`${key} cannot label 1984 as annual loss or carry the baseline marker`);
  assertProvince(row.province, `${key} province`);
  assertInteger(row.fromYear, `${key} fromYear`);
  assertInteger(row.toYear, `${key} toYear`);
  if (row.toYear === COMPARATOR_BASELINE_YEAR || row.fromYear === COMPARATOR_END_YEAR) {
    fail(`${key} cannot label 1984 as annual loss`);
  }
  if (row.fromYear < COMPARATOR_BASELINE_YEAR || row.toYear > COMPARATOR_END_YEAR || row.toYear !== row.fromYear + 1) {
    fail(`${key} must be one adjacent interval from 1984-1985 through 2021-2022`);
  }
  if (!Object.hasOwn(row, "coverageGrade")) fail(`${key} is missing coverageGrade`);
  if (!Object.hasOwn(row, "unknownRequiredInputHectares")) fail(`${key} is missing unknownRequiredInputHectares`);
  assertFiniteNonNegative(row.unknownRequiredInputHectares, `${key} unknownRequiredInputHectares`);
  annualLossValue(row, key);
}

function assertNfdFrame(profileOrRows) {
  const rows = Array.isArray(profileOrRows) ? profileOrRows : profileOrRows?.frame?.rows;
  if (!Array.isArray(rows)) fail("NFD profile must provide frame.rows");
  const expected = COMPARATOR_PROVINCES.length * (COMPARATOR_END_YEAR - COMPARATOR_BASELINE_YEAR + 1);
  if (rows.length !== expected) fail(`NFD profile must contain the complete ${expected}-row 1984-2022 frame`);
  const byKey = new Map();
  for (const [index, row] of rows.entries()) {
    const key = `nfdRows[${index}]`;
    assertPlainObject(row, key);
    assertProvince(row.province, `${key} province`);
    assertInteger(row.year, `${key} year`);
    if (row.year < COMPARATOR_BASELINE_YEAR || row.year > COMPARATOR_END_YEAR) fail(`${key} year is outside the 1984-2022 frame`);
    const mapKey = `${row.province}:${row.year}`;
    if (byKey.has(mapKey)) fail(`duplicate NFD frame row ${mapKey}`);
    nfdTotalValue(row, key);
    byKey.set(mapKey, row);
  }
  for (const province of COMPARATOR_PROVINCES) {
    for (let year = COMPARATOR_BASELINE_YEAR; year <= COMPARATOR_END_YEAR; year += 1) {
      if (!byKey.has(`${province}:${year}`)) fail(`NFD frame is missing ${province}:${year}`);
    }
  }
  return byKey;
}

function assertAnnualSchedule(annualRows) {
  if (!Array.isArray(annualRows)) fail("annual zonal output must be an array");
  const baselines = [];
  const annual = [];
  annualRows.forEach((row, index) => {
    if (row?.rowType === "baseline") {
      assertBaselineRow(row, index);
      baselines.push(row);
    } else {
      assertAnnualRow(row, index);
      annual.push(row);
    }
  });
  if (baselines.length !== COMPARATOR_BASELINE_ROW_COUNT) {
    fail(`annual zonal output must contain exactly ${COMPARATOR_BASELINE_ROW_COUNT} explicit 1984 baseline snapshots before comparison`);
  }
  if (new Set(baselines.map((row) => row.province)).size !== COMPARATOR_BASELINE_ROW_COUNT) {
    fail("the four explicit 1984 baseline snapshots must cover BC, AB, ON, and QC once each");
  }
  if (annual.length !== COMPARATOR_ROW_COUNT) {
    fail(`annual zonal output must contain exactly ${COMPARATOR_ROW_COUNT} adjacent rows after excluding the four 1984 baseline snapshots`);
  }
  const seen = new Set();
  for (const row of annual) {
    const key = `${row.province}:${row.toYear}`;
    if (seen.has(key)) fail(`duplicate annual comparison row ${key}`);
    seen.add(key);
  }
  for (const province of COMPARATOR_PROVINCES) {
    for (let toYear = COMPARATOR_START_YEAR; toYear <= COMPARATOR_END_YEAR; toYear += 1) {
      if (!seen.has(`${province}:${toYear}`)) fail(`annual zonal output is missing ${province}:${toYear}`);
    }
  }
  return annual;
}

function rowClaims() {
  return { ...PROVISIONAL_COMPARISON_CLAIMS };
}

function makeComparisonRow(annual, nfd) {
  const province = annual.province;
  const fromYear = annual.fromYear;
  const toYear = annual.toYear;
  const annualValue = annualLossValue(annual, `${province}:${fromYear}-${toYear}`);
  const nfdValue = nfdTotalValue(nfd, `${province}:${toYear}`);
  const bothKnown = annualValue !== null && nfdValue !== null;
  let signedDifference = null;
  let absoluteDifference = null;
  let relativeDifference = null;
  if (bothKnown) {
    signedDifference = subtractDecimals(annualValue.decimal, nfdValue.decimal);
    absoluteDifference = absoluteDecimal(signedDifference);
    relativeDifference = nfdValue.number === 0 ? null : (annualValue.number - nfdValue.number) / nfdValue.number;
    if (relativeDifference !== null && !Number.isFinite(relativeDifference)) fail(`${province}:${toYear} relative difference is not finite`);
  }
  return {
    province,
    boundaryId: annual.boundaryId ?? null,
    rowType: "annual-comparison",
    fromYear,
    toYear,
    joinKey: `${province}:${toYear}`,
    temporalSemantics: `${fromYear}-${toYear} adjacent annual interval joined to the NFD row for toYear ${toYear}`,
    witnessTreeObservedForestLossHectares: annualValue?.number ?? null,
    witnessTreeObservedForestLossHectaresExact: annualValue?.exact ?? null,
    nfdReportedHarvestHectares: nfdValue?.number ?? null,
    nfdReportedHarvestHectaresExact: nfdValue?.exact ?? null,
    witnessTreeCoverageGrade: annual.coverageGrade,
    witnessTreeUnknownRequiredInputHectares: annual.unknownRequiredInputHectares,
    nfdMissingnessState: nfd.missingness?.state ?? null,
    comparisonStatus: bothKnown ? "computed" : "pending",
    signedDifferenceHectares: signedDifference === null ? null : decimalNumber(signedDifference, `${province}:${toYear} signed difference`),
    signedDifferenceHectaresExact: signedDifference === null ? null : decimalString(signedDifference),
    absoluteDifferenceHectares: absoluteDifference === null ? null : decimalNumber(absoluteDifference, `${province}:${toYear} absolute difference`),
    absoluteDifferenceHectaresExact: absoluteDifference === null ? null : decimalString(absoluteDifference),
    relativeDifference,
    comparisonLabel: PROVISIONAL_COMPARISON_LABEL,
    likeForLikeClaim: false,
    claims: rowClaims(),
  };
}

/**
 * Join direct annual worker rows to the NFD profile frame.
 *
 * The return value is deliberately an array of 152 provisional rows, not a
 * completion record. NFD `areaHectares` and worker `lossHectares` are the
 * complete totals. Their known subtotals are never substituted for unknown
 * values.
 */
export function compareAnnualZonalToNfd(annualRows, nfdProfileOrRows) {
  const annual = assertAnnualSchedule(annualRows);
  const nfdByKey = assertNfdFrame(nfdProfileOrRows);
  const result = [];
  for (const province of COMPARATOR_PROVINCES) {
    for (let toYear = COMPARATOR_START_YEAR; toYear <= COMPARATOR_END_YEAR; toYear += 1) {
      const annualRow = annual.find((row) => row.province === province && row.toYear === toYear);
      if (!annualRow) fail(`annual zonal output is missing ${province}:${toYear}`);
      result.push(makeComparisonRow(annualRow, nfdByKey.get(`${province}:${toYear}`)));
    }
  }
  assertProvisionalAnnualNfdComparison(result);
  return result;
}

/** Alias spelling for callers that describe the operation as a join. */
export const joinAnnualZonalToNfd = compareAnnualZonalToNfd;

/**
 * Validate provisional rows before a later consumer joins or publishes them.
 * A 156-row matrix, baseline annual row, or affirmative claim is rejected.
 */
export function assertProvisionalAnnualNfdComparison(rows) {
  if (!Array.isArray(rows)) fail("provisional comparison rows must be an array");
  if (rows.length === COMPARATOR_BASELINE_ROW_COUNT * (COMPARATOR_ANNUAL_PAIR_COUNT + 1)) {
    fail("the formal 156-row gate cannot be closed by this provisional comparator");
  }
  if (rows.length !== COMPARATOR_ROW_COUNT) fail(`provisional comparison must contain exactly ${COMPARATOR_ROW_COUNT} rows`);
  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    const key = `comparisonRows[${index}]`;
    assertPlainObject(row, key);
    if (row.rowType !== "annual-comparison") fail(`${key} cannot include a baseline snapshot`);
    assertProvince(row.province, `${key} province`);
    assertInteger(row.fromYear, `${key} fromYear`);
    assertInteger(row.toYear, `${key} toYear`);
    if (row.toYear < COMPARATOR_START_YEAR || row.toYear > COMPARATOR_END_YEAR || row.fromYear !== row.toYear - 1) {
      fail(`${key} must use toYear 1985 through 2022 and an adjacent fromYear`);
    }
    if (row.joinKey !== `${row.province}:${row.toYear}`) fail(`${key} join key must use province and toYear`);
    if (seen.has(row.joinKey)) fail(`duplicate provisional comparison row ${row.joinKey}`);
    seen.add(row.joinKey);
    if (row.likeForLikeClaim !== false || row.comparisonLabel !== PROVISIONAL_COMPARISON_LABEL) {
      fail(`${key} must label the quantities non-like-for-like and descriptive only`);
    }
    for (const claim of CLAIM_FIELDS) {
      if (row[claim] !== undefined && row[claim] !== false) fail(`${key} cannot make a ${claim} claim`);
      if (row.claims?.[claim] !== false) fail(`${key} claims.${claim} must be false`);
    }
    const witness = row.witnessTreeObservedForestLossHectares;
    const nfd = row.nfdReportedHarvestHectares;
    const valuesKnown = witness !== null && nfd !== null;
    if (!valuesKnown) {
      for (const field of ["signedDifferenceHectares", "signedDifferenceHectaresExact", "absoluteDifferenceHectares", "absoluteDifferenceHectaresExact", "relativeDifference"]) {
        if (row[field] !== null) fail(`${key} must preserve null differences when either total is unknown`);
      }
      if (row.comparisonStatus !== "pending") fail(`${key} with an unknown total must be pending`);
      continue;
    }
    assertFiniteNonNegative(witness, `${key} Witness Tree loss`);
    assertFiniteNonNegative(nfd, `${key} NFD harvest`);
    const witnessExact = canonicalExactValue(row.witnessTreeObservedForestLossHectaresExact, `${key} Witness Tree loss exact`);
    const nfdExact = canonicalExactValue(row.nfdReportedHarvestHectaresExact, `${key} NFD harvest exact`);
    if (decimalNumber(witnessExact.decimal, `${key} Witness Tree loss`) !== witness) fail(`${key} Witness Tree number and exact value disagree`);
    if (decimalNumber(nfdExact.decimal, `${key} NFD harvest`) !== nfd) fail(`${key} NFD number and exact value disagree`);
    const witnessDecimal = witnessExact.decimal;
    const nfdDecimal = nfdExact.decimal;
    const expectedSigned = subtractDecimals(witnessDecimal, nfdDecimal);
    const expectedAbsolute = absoluteDecimal(expectedSigned);
    if (row.signedDifferenceHectaresExact !== decimalString(expectedSigned)) fail(`${key} signed exact difference is not derived from both totals`);
    if (row.absoluteDifferenceHectaresExact !== decimalString(expectedAbsolute)) fail(`${key} absolute exact difference is not derived from both totals`);
    if (row.signedDifferenceHectares !== decimalNumber(expectedSigned, `${key} signed difference`)) fail(`${key} signed difference drifted`);
    if (row.absoluteDifferenceHectares !== decimalNumber(expectedAbsolute, `${key} absolute difference`)) fail(`${key} absolute difference drifted`);
    if (nfd === 0) {
      if (row.relativeDifference !== null) fail(`${key} relative difference must remain null when NFD harvest is zero`);
    } else if (typeof row.relativeDifference !== "number" || !Number.isFinite(row.relativeDifference)) {
      fail(`${key} relative difference must be finite`);
    }
    if (row.comparisonStatus !== "computed") fail(`${key} with two known totals must be computed`);
  }
  for (const province of COMPARATOR_PROVINCES) {
    for (let year = COMPARATOR_START_YEAR; year <= COMPARATOR_END_YEAR; year += 1) {
      if (!seen.has(`${province}:${year}`)) fail(`provisional comparison is missing ${province}:${year}`);
    }
  }
  return rows;
}

/** Alias for consumers that call the result a comparison rather than a join. */
export const validateProvisionalComparison = assertProvisionalAnnualNfdComparison;
