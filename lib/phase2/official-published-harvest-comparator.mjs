const PROVINCES = Object.freeze(["BC", "AB", "ON", "QC"]);
const COLUMN_BY_PROVINCE = Object.freeze({ QC: "6", ON: "7", AB: "10", BC: "11" });
const STATCAN_ID = "statcan-table-2.10-2018";
const RESTRICTED_ID = "nrcan-forest-statistical-profile-f1e8c437";
const STATCAN_URL = "https://www150.statcan.gc.ca/n1/pub/16-201-x/2018001/sec-2/tbl/tbl-2.10-eng.htm";
const STATCAN_TITLE = "Table 2.10 Forest area harvested by province and territory, 1975 to 2015";
const STATCAN_SCOPE = "provincial, private and federal land";
const ATTRIBUTION = "Adapted from Statistics Canada, Table 2.10 Forest area harvested by province and territory, 1975 to 2015, 2018. This does not constitute an endorsement by Statistics Canada of this product.";
const WITHHOLD_REASON = "The later reference source is restricted to personal use and states all rights reserved. Its numeric value is not included in this public artifact.";
const COMPARISON_LABEL = "Witness Tree observed forest loss and official reported harvest are non-like-for-like quantities. Nominal differences are descriptive only, and the reference is rounded to the nearest whole square kilometre.";
const CLAIMS = Object.freeze({
  likeForLike: false,
  causalAttribution: false,
  productAccuracy: false,
  equivalence: false,
  admitted: false,
  released: false,
  productionEligible: false,
});

function fail(message) {
  throw new Error(message);
}

function targetYears(province) {
  return province === "BC" || province === "AB" ? [1990, 2019] : [1990, 2018];
}

function targetKeys() {
  const keys = [];
  for (const province of PROVINCES) {
    const [start, end] = targetYears(province);
    for (let year = start; year <= end; year += 1) keys.push(`${province}:${year}`);
  }
  return keys;
}

function decimalParts(text, label) {
  if (typeof text !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) fail(`${label} must be a non-negative decimal string`);
  const [whole, fraction = ""] = text.split(".");
  return { coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function decimalString(value) {
  const negative = value.coefficient < 0n;
  const coefficient = negative ? -value.coefficient : value.coefficient;
  const digits = coefficient.toString().padStart(value.scale + 1, "0");
  if (value.scale === 0) return `${negative ? "-" : ""}${digits}`;
  const split = digits.length - value.scale;
  return `${negative ? "-" : ""}${digits.slice(0, split)}.${digits.slice(split)}`.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function subtractExact(leftText, rightInteger) {
  const left = decimalParts(leftText, "Witness Tree exact value");
  const right = BigInt(rightInteger) * 10n ** BigInt(left.scale);
  return decimalString({ coefficient: left.coefficient - right, scale: left.scale });
}

function absoluteExact(value) {
  return value.startsWith("-") ? value.slice(1) : value;
}

function sourceFlagCounts(rows) {
  return {
    preliminary: rows.filter((row) => row.sourceFlags.preliminary).length,
    revised: rows.filter((row) => row.sourceFlags.revised).length,
    agencyEstimated: rows.filter((row) => row.sourceFlags.agencyEstimated).length,
    unflagged: rows.filter((row) => !row.sourceFlags.preliminary && !row.sourceFlags.revised && !row.sourceFlags.agencyEstimated).length,
  };
}

export function parseStatCanTable210(html) {
  if (typeof html !== "string" || html.length < 1000) fail("StatCan Table 2.10 HTML is required");
  if (!/As of 1990, figures include provincial and private lands and federal land\./.test(html)) fail("StatCan scope note is missing");
  if (!/square kilometers/.test(html)) fail("StatCan whole-square-kilometre unit is missing");
  const rows = [];
  const seen = new Set();
  for (const match of html.matchAll(/<tr class="highlight-row">([\s\S]*?)<\/tr>/g)) {
    const block = match[1];
    const yearMatch = block.match(/class="row-stub">(\d{4})<\/th>/);
    if (!yearMatch) continue;
    const year = Number(yearMatch[1]);
    if (year < 1990 || year > 2015) continue;
    for (const province of PROVINCES) {
      const column = COLUMN_BY_PROVINCE[province];
      const cell = block.match(new RegExp(`<td headers="[^"]*h_469_1-${column}[^>]*>([\\s\\S]*?)<\\/td>`));
      if (!cell) fail(`StatCan ${province}:${year} cell is missing`);
      const raw = cell[1];
      const visible = raw
        .replace(/<span class="wb-inv">[\s\S]*?<\/span>/g, "")
        .replace(/<sup[\s\S]*?<\/sup>/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|&#160;/g, " ");
      const number = visible.match(/\d[\d,]*/);
      if (!number) fail(`StatCan ${province}:${year} value is missing`);
      const squareKilometres = Number(number[0].replaceAll(",", ""));
      if (!Number.isSafeInteger(squareKilometres) || squareKilometres < 0) fail(`StatCan ${province}:${year} value is invalid`);
      const key = `${province}:${year}`;
      if (seen.has(key)) fail(`duplicate StatCan row ${key}`);
      seen.add(key);
      rows.push({
        province,
        year,
        sourceId: STATCAN_ID,
        sourceValueSquareKilometres: squareKilometres,
        referenceHectaresNominal: squareKilometres * 100,
        displayPrecisionHectares: 100,
        roundingHalfWidthHectares: 50,
        sourceScope: STATCAN_SCOPE,
        sourceFlags: {
          preliminary: /: preliminary/.test(raw),
          revised: /: revised/.test(raw),
          agencyEstimated: /href="#Table2-10n_1"/.test(raw),
        },
      });
    }
  }
  if (rows.length !== 104 || seen.size !== 104) fail(`StatCan target row count differs: ${rows.length}`);
  const counts = sourceFlagCounts(rows);
  if (JSON.stringify(counts) !== JSON.stringify({ preliminary: 6, revised: 13, agencyEstimated: 7, unflagged: 78 })) {
    fail(`StatCan source flag counts differ: ${JSON.stringify(counts)}`);
  }
  return rows;
}

function assertStrictInput(strictRows) {
  if (!Array.isArray(strictRows) || strictRows.length !== 152) fail("strict comparison input must contain 152 rows");
  const targets = new Map();
  const required = new Set(targetKeys());
  for (const row of strictRows) {
    if (!row || typeof row !== "object" || row.rowType !== "annual-comparison") fail("strict comparison row is invalid");
    const key = `${row.province}:${row.toYear}`;
    if (!required.has(key)) continue;
    if (targets.has(key)) fail(`duplicate strict target row ${key}`);
    if (row.joinKey !== key || row.fromYear !== row.toYear - 1) fail(`${key} strict schedule drifted`);
    if (row.comparisonStatus !== "pending" || row.nfdReportedHarvestHectares !== null || row.nfdReportedHarvestHectaresExact !== null) fail(`${key} strict NFD total must remain pending and null`);
    for (const field of ["signedDifferenceHectares", "signedDifferenceHectaresExact", "absoluteDifferenceHectares", "absoluteDifferenceHectaresExact", "relativeDifference"]) {
      if (row[field] !== null) fail(`${key} strict difference ${field} must remain null`);
    }
    const witness = row.witnessTreeObservedForestLossHectares;
    if (typeof witness !== "number" || !Number.isFinite(witness) || witness < 0) fail(`${key} Witness Tree value is invalid`);
    const witnessExact = row.witnessTreeObservedForestLossHectaresExact;
    if (Number(decimalString(decimalParts(witnessExact, `${key} Witness Tree exact value`))) !== witness) fail(`${key} Witness Tree exact value differs`);
    if (row.witnessTreeCoverageGrade !== "complete" || row.witnessTreeUnknownRequiredInputHectares !== 0) fail(`${key} Witness Tree coverage must be complete`);
    targets.set(key, row);
  }
  if (targets.size !== 118) fail(`strict target row count differs: ${targets.size}`);
  return targets;
}

export function buildOfficialPublishedHarvestComparison(strictRows, statcanRows) {
  const strictByKey = assertStrictInput(strictRows);
  if (!Array.isArray(statcanRows) || statcanRows.length !== 104) fail("StatCan reference must contain 104 rows");
  const statcanByKey = new Map();
  for (const row of statcanRows) {
    const key = `${row.province}:${row.year}`;
    if (statcanByKey.has(key)) fail(`duplicate StatCan reference row ${key}`);
    if (row.sourceId !== STATCAN_ID || row.displayPrecisionHectares !== 100 || row.roundingHalfWidthHectares !== 50 || row.referenceHectaresNominal !== row.sourceValueSquareKilometres * 100) fail(`${key} StatCan reference contract drifted`);
    statcanByKey.set(key, row);
  }
  const result = targetKeys().map((key) => {
    const strict = strictByKey.get(key);
    const reference = statcanByKey.get(key) ?? null;
    const computed = reference !== null;
    const signedExact = computed ? subtractExact(strict.witnessTreeObservedForestLossHectaresExact, reference.referenceHectaresNominal) : null;
    const signed = signedExact === null ? null : Number(signedExact);
    return {
      province: strict.province,
      boundaryId: strict.boundaryId,
      rowType: "official-published-harvest-comparison",
      fromYear: strict.fromYear,
      toYear: strict.toYear,
      joinKey: key,
      witnessTreeObservedForestLossHectares: strict.witnessTreeObservedForestLossHectares,
      witnessTreeObservedForestLossHectaresExact: strict.witnessTreeObservedForestLossHectaresExact,
      witnessTreeCoverageGrade: strict.witnessTreeCoverageGrade,
      witnessTreeUnknownRequiredInputHectares: strict.witnessTreeUnknownRequiredInputHectares,
      strictNfdExactTotalHectares: null,
      strictNfdExactTotalStatus: "unknown-components",
      referenceSourceId: computed ? STATCAN_ID : RESTRICTED_ID,
      referenceSourceUrl: computed ? STATCAN_URL : null,
      referenceSourceTitle: computed ? STATCAN_TITLE : null,
      referenceSourceValueSquareKilometres: computed ? reference.sourceValueSquareKilometres : null,
      referenceHectaresNominal: computed ? reference.referenceHectaresNominal : null,
      referenceDisplayPrecisionHectares: computed ? reference.displayPrecisionHectares : null,
      referenceRoundingHalfWidthHectares: computed ? reference.roundingHalfWidthHectares : null,
      referenceScope: computed ? reference.sourceScope : null,
      referenceSourceFlags: computed ? { ...reference.sourceFlags } : null,
      referencePublicationStatus: computed ? "published-source" : "withheld-restricted-source",
      withholdReason: computed ? null : WITHHOLD_REASON,
      comparisonStatus: computed ? "computed-rounded-reference" : "pending-restricted-source",
      nominalSignedDifferenceHectares: signed,
      nominalSignedDifferenceHectaresExact: signedExact,
      nominalAbsoluteDifferenceHectares: signed === null ? null : Math.abs(signed),
      nominalAbsoluteDifferenceHectaresExact: signedExact === null ? null : absoluteExact(signedExact),
      nominalRelativeDifference: computed && reference.referenceHectaresNominal !== 0 ? signed / reference.referenceHectaresNominal : null,
      uncertaintyLabel: computed ? "Reference published to the nearest whole square kilometre; rounding half-width is 50 hectares." : null,
      comparisonLabel: COMPARISON_LABEL,
      attribution: computed ? ATTRIBUTION : null,
      claims: { ...CLAIMS },
    };
  });
  return validateOfficialPublishedHarvestComparison(result);
}

export function validateOfficialPublishedHarvestComparison(rows) {
  if (!Array.isArray(rows) || rows.length !== 118) fail("official published comparison must contain 118 rows");
  const expected = targetKeys();
  const seen = new Set();
  let computed = 0;
  let pending = 0;
  for (const [index, row] of rows.entries()) {
    const key = expected[index];
    if (!row || typeof row !== "object" || row.joinKey !== key || `${row.province}:${row.toYear}` !== key || row.fromYear !== row.toYear - 1) fail(`row ${index} schedule differs`);
    if (seen.has(key)) fail(`duplicate output row ${key}`);
    seen.add(key);
    if (row.rowType !== "official-published-harvest-comparison") fail(`${key} row type differs`);
    if (row.strictNfdExactTotalHectares !== null || row.strictNfdExactTotalStatus !== "unknown-components") fail(`${key} strict NFD null was not preserved`);
    if (JSON.stringify(row.claims) !== JSON.stringify(CLAIMS)) fail(`${key} claims drifted`);
    if (row.comparisonLabel !== COMPARISON_LABEL) fail(`${key} comparison label drifted`);
    const shouldCompute = row.toYear <= 2015;
    if (shouldCompute) {
      computed += 1;
      if (row.comparisonStatus !== "computed-rounded-reference" || row.referenceSourceId !== STATCAN_ID || row.referencePublicationStatus !== "published-source") fail(`${key} computed classification differs`);
      if (row.referenceDisplayPrecisionHectares !== 100 || row.referenceRoundingHalfWidthHectares !== 50 || row.referenceScope !== STATCAN_SCOPE) fail(`${key} precision or scope differs`);
      const expectedSignedExact = subtractExact(row.witnessTreeObservedForestLossHectaresExact, row.referenceHectaresNominal);
      if (row.nominalSignedDifferenceHectaresExact !== expectedSignedExact || row.nominalSignedDifferenceHectares !== Number(expectedSignedExact)) fail(`${key} nominal signed difference differs`);
      if (row.nominalAbsoluteDifferenceHectaresExact !== absoluteExact(expectedSignedExact) || row.nominalAbsoluteDifferenceHectares !== Math.abs(Number(expectedSignedExact))) fail(`${key} nominal absolute difference differs`);
      if (row.withholdReason !== null || row.attribution !== ATTRIBUTION) fail(`${key} publication fields differ`);
    } else {
      pending += 1;
      if (row.comparisonStatus !== "pending-restricted-source" || row.referenceSourceId !== RESTRICTED_ID || row.referencePublicationStatus !== "withheld-restricted-source") fail(`${key} restricted classification differs`);
      for (const field of ["referenceSourceUrl", "referenceSourceTitle", "referenceSourceValueSquareKilometres", "referenceHectaresNominal", "referenceDisplayPrecisionHectares", "referenceRoundingHalfWidthHectares", "referenceScope", "referenceSourceFlags", "nominalSignedDifferenceHectares", "nominalSignedDifferenceHectaresExact", "nominalAbsoluteDifferenceHectares", "nominalAbsoluteDifferenceHectaresExact", "nominalRelativeDifference", "uncertaintyLabel", "attribution"]) {
        if (row[field] !== null) fail(`${key} restricted field ${field} must remain null`);
      }
      if (typeof row.withholdReason !== "string" || !/personal use.*all rights reserved/i.test(row.withholdReason)) fail(`${key} restricted reason is missing`);
    }
  }
  if (computed !== 104 || pending !== 14) fail(`output class counts differ: ${computed} computed, ${pending} pending`);
  return rows;
}

export const OFFICIAL_PUBLISHED_HARVEST_CLAIMS = CLAIMS;

// Keep the historical comparison intact: its exact bytes have a publication
// receipt. The current NFD source adds only years after each province's last row.
export function extendOfficialPublishedHarvestComparison(historicalRows, strictRows, nfdRows, source) {
  validateOfficialPublishedHarvestComparison(historicalRows);
  if (source?.sourceId !== "nfd-5.2-undeclared" || source.sourceVersion !== "undeclared") fail("NFD Table 5.2 must retain its undeclared edition");
  const strictByKey = new Map();
  for (const row of strictRows) {
    if (strictByKey.has(row.joinKey)) fail(`duplicate strict row ${row.joinKey}`);
    strictByKey.set(row.joinKey, row);
  }
  const references = new Map();
  for (const row of nfdRows) {
    const key = `${row.province}:${row.year}`;
    if (references.has(key)) fail(`duplicate NFD reference ${key}`);
    references.set(key, row);
  }
  const added = [];
  for (const province of PROVINCES) {
    for (let year = targetYears(province)[1] + 1; year <= 2022; year += 1) {
      const key = `${province}:${year}`;
      const strict = strictByKey.get(key);
      const reference = references.get(key);
      if (!reference) fail(`${key} requires an explicit NFD missingness row`);
      if (!["complete", "complete-with-not-applicable", "partial-unknown", "no-source-rows"].includes(reference.missingness?.state)) fail(`${key} ungraded NFD reference`);
      const referenceComplete = ["complete", "complete-with-not-applicable"].includes(reference.missingness?.state);
      if (referenceComplete && (reference.areaHectaresExact === null || Number(decimalString(decimalParts(reference.areaHectaresExact, key))) !== reference.areaHectares)) fail(`${key} NFD exact value differs`);
      if (!referenceComplete && (reference.areaHectares !== null || reference.areaHectaresExact !== null)) fail(`${key} incomplete NFD total must remain null`);
      if (strict && (strict.province !== province || strict.fromYear !== year - 1 || strict.toYear !== year || strict.rowType !== "annual-comparison")) fail(`${key} strict interval differs`);
      if (strict && !Object.hasOwn(strict, "witnessTreeCoverageGrade")) fail(`${key} ungraded Witness Tree input`);
      const grade = strict?.witnessTreeCoverageGrade ?? "unavailable";
      const unknown = strict?.witnessTreeUnknownRequiredInputHectares ?? null;
      if (!["complete", "partial-with-unknown", "unavailable"].includes(grade)) fail(`${key} ungraded Witness Tree input`);
      if (unknown !== null && (typeof unknown !== "number" || !Number.isFinite(unknown) || unknown < 0)) fail(`${key} unknown hectares are invalid`);
      if (grade === "complete" && unknown !== 0) fail(`${key} complete coverage requires measured zero unknown hectares`);
      if (grade !== "complete" && unknown === 0) fail(`${key} incomplete coverage cannot carry zero unknown hectares`);
      const witness = strict?.witnessTreeObservedForestLossHectares ?? null;
      const witnessExact = strict?.witnessTreeObservedForestLossHectaresExact ?? null;
      if ((witness === null) !== (witnessExact === null)) fail(`${key} Witness Tree numeric and exact fields disagree`);
      if (witness !== null && Number(decimalString(decimalParts(witnessExact, key))) !== witness) fail(`${key} Witness Tree exact value differs`);
      if (grade === "complete" && witness === null) fail(`${key} complete coverage requires a measured value`);
      const computed = referenceComplete && grade === "complete" && witness !== null;
      let signedExact = null;
      if (computed) {
        const left = decimalParts(witnessExact, key);
        const right = decimalParts(reference.areaHectaresExact, key);
        const scale = Math.max(left.scale, right.scale);
        signedExact = decimalString({ coefficient: left.coefficient * 10n ** BigInt(scale - left.scale) - right.coefficient * 10n ** BigInt(scale - right.scale), scale });
      }
      added.push({
        province, boundaryId: strict?.boundaryId ?? province,
        rowType: "official-published-harvest-comparison", fromYear: year - 1, toYear: year, joinKey: key,
        witnessTreeObservedForestLossHectares: witness,
        witnessTreeObservedForestLossHectaresExact: witnessExact,
        witnessTreeCoverageGrade: grade, witnessTreeUnknownRequiredInputHectares: unknown,
        strictNfdExactTotalHectares: null, strictNfdExactTotalStatus: "unknown-components",
        referenceSourceId: source.sourceId, referenceSourceUrl: source.sourceUrl,
        referenceHectaresNominal: reference.areaHectares,
        referenceHectaresExact: reference.areaHectaresExact,
        referenceRoundingHalfWidthHectares: null,
        referenceSourceFlags: {
          preliminary: Boolean(reference.qualifierCounts.p), revised: Boolean(reference.qualifierCounts.r),
          agencyEstimated: Boolean(reference.qualifierCounts.E || reference.qualifierCounts.e),
        },
        referenceCoverageGrade: reference.missingness.state,
        referenceUnknownComponentCount: reference.missingness.unknownAreaRowCount,
        referencePublicationStatus: referenceComplete ? "published-source" : "unknown-components",
        comparisonStatus: computed ? "computed-nfd-reference" : "pending-incomplete-input",
        nominalSignedDifferenceHectares: signedExact === null ? null : Number(signedExact),
        nominalSignedDifferenceHectaresExact: signedExact,
        nominalAbsoluteDifferenceHectares: signedExact === null ? null : Math.abs(Number(signedExact)),
        nominalAbsoluteDifferenceHectaresExact: signedExact === null ? null : absoluteExact(signedExact),
        nominalRelativeDifference: computed && reference.areaHectares !== 0 ? Number(signedExact) / reference.areaHectares : null,
        withholdReason: null, claims: { ...CLAIMS },
      });
    }
  }
  return [...historicalRows, ...added];
}
