/**
 * Nonproduction parser and province/year transformer for the National
 * Forestry Database area-harvested CSV.
 *
 * This module deliberately keeps the source's qualifier and missing-value
 * semantics. A blank value with qualifier `u`, `U`, `s`, or `r` is not
 * converted to zero. The aggregate's complete area is null while the sum of
 * the known cells is retained as an explicit lower-bound/provisional figure.
 */

export const TARGET_PROVINCES = Object.freeze(["BC", "AB", "ON", "QC"]);
export const START_YEAR = 1984;
export const END_YEAR = 2022;

export const NFD_HEADERS = Object.freeze([
  "Year",
  "Année",
  "ISO",
  "Jurisdiction",
  "Juridiction",
  "Tenure (En)",
  "Tenure (Fr)",
  "Management",
  "Aménagement",
  "Harvesting method",
  "Méthode de récolte",
  "Area (hectares)",
  "Data qualifier",
  "Superficie (en hectare)",
  "Qualificatifs de données",
]);

export const NFD_QUALIFIER_ORDER = Object.freeze(["U", "a", "u", "E", "e", "n", "p", "s", "r"]);
export const NFD_QUALIFIERS = Object.freeze({
  U: "figures not available and known to be large relative to the total for the province",
  a: "actual figures",
  u: "figures not available and known to be very small relative to the total for the province",
  E: "estimated by Statistics Canada or the Canadian Forest Service",
  e: "estimated by provincial or territorial forestry agency",
  n: "figures not appropriate or not applicable",
  p: "preliminary figures",
  s: "amount too small to be expressed",
  r: "revised figures",
});

const JURISDICTION_BY_ISO = Object.freeze({
  AB: "Alberta",
  BC: "British Columbia",
  GC: "Canada",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
});

const JURISDICTION_FR_BY_EN = Object.freeze({
  Alberta: "Alberta",
  "British Columbia": "Colombie-Britannique",
  Canada: "Canada",
  Manitoba: "Manitoba",
  "New Brunswick": "Nouveau-Brunswick",
  "Newfoundland and Labrador": "Terre-Neuve-et-Labrador",
  "Northwest Territories": "Territoires du Nord-Ouest",
  "Nova Scotia": "Nouvelle-Écosse",
  Nunavut: "Nunavut",
  Ontario: "Ontario",
  "Prince Edward Island": "Île-du-Prince-Édouard",
  Quebec: "Québec",
  Saskatchewan: "Saskatchewan",
  Yukon: "Yukon",
});

const TENURE_FR_BY_EN = Object.freeze({
  "Federal land": "Terres fédérales",
  "Private land": "Terres privées",
  "Provincial land": "Terres provinciales",
  Unspecified: "Indéterminée",
});

const MANAGEMENT_FR_BY_EN = Object.freeze({
  "Even-aged management": "Aménagement équienne",
  "Uneven-aged management": "Aménagement inéquienne",
  Unspecified: "Indéterminée",
});

const HARVEST_METHOD_FR_BY_EN = Object.freeze({
  "Clearcut - 1-stage and 2-stage": "Coupe à blanc - 1-étape et 2-étape",
  "Commercial thinning": "Éclaircie commerciale",
  "Seed tree": "Avec réserve de semenciers",
  Selection: "Coupe de jardinage",
  Shelterwood: "Progressive",
  Other: "Autre",
  Unspecified: "Indéterminée",
});

const KNOWN_NUMERIC_QUALIFIERS = new Set(["a", "E", "e", "p", "r"]);
const NONNUMERIC_QUALIFIERS = new Set(["U", "u", "n", "s"]);

function fail(message, line) {
  throw new Error(line === undefined ? message : `${message} (CSV record ${line})`);
}

function trimCell(value) {
  return value.trim();
}

/**
 * Parse RFC 4180-style CSV without a dependency. Quoted delimiters, escaped
 * quotes, CRLF, LF, and a UTF-8 BOM are supported. Malformed records fail
 * closed rather than being repaired heuristically.
 */
export function parseCsv(text) {
  if (typeof text !== "string") throw new TypeError("NFD CSV input must be a string.");
  let source = text;
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);

  const records = [];
  let record = [];
  let field = "";
  let inQuotes = false;
  let afterClosingQuote = false;
  let hasFieldToken = false;
  let recordNumber = 1;

  const finishRecord = () => {
    if (!hasFieldToken && record.length === 0 && field.length === 0) {
      fail("blank CSV record", recordNumber);
    }
    record.push(field);
    records.push(record);
    record = [];
    field = "";
    afterClosingQuote = false;
    hasFieldToken = false;
    recordNumber += 1;
  };

  for (let i = 0; i < source.length; i += 1) {
    const character = source[i];
    if (inQuotes) {
      if (character === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
          afterClosingQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (afterClosingQuote) {
      if (character === ",") {
        record.push(field);
        field = "";
        afterClosingQuote = false;
        hasFieldToken = true;
      } else if (character === "\r" || character === "\n") {
        if (character === "\r" && source[i + 1] === "\n") i += 1;
        finishRecord();
      } else {
        fail("characters after a closing quote are not allowed", recordNumber);
      }
      continue;
    }

    if (character === '"') {
      if (field.length !== 0) fail("a quote may only start a field", recordNumber);
      inQuotes = true;
      hasFieldToken = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
      hasFieldToken = true;
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && source[i + 1] === "\n") i += 1;
      finishRecord();
    } else {
      field += character;
      hasFieldToken = true;
    }
  }

  if (inQuotes) fail("unterminated quoted field", recordNumber);
  if (record.length > 0 || field.length > 0 || hasFieldToken) {
    record.push(field);
    records.push(record);
  }
  return records;
}

function parseYear(value, line) {
  const normalized = trimCell(value);
  if (!/^\d{4}$/.test(normalized)) fail(`year must be a four-digit integer, got ${JSON.stringify(value)}`, line);
  const year = Number(normalized);
  if (!Number.isSafeInteger(year)) fail("year is outside the safe integer range", line);
  return year;
}

function parseDecimal(value, line) {
  const normalized = trimCell(value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) {
    fail(`area must be a non-negative decimal or blank, got ${JSON.stringify(value)}`, line);
  }
  const [whole, fraction = ""] = normalized.split(".");
  return { coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function normalizeDecimal(decimal) {
  let coefficient = decimal.coefficient;
  let scale = decimal.scale;
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }
  return { coefficient, scale };
}

function addDecimals(left, right) {
  const scale = Math.max(left.scale, right.scale);
  const leftCoefficient = left.coefficient * 10n ** BigInt(scale - left.scale);
  const rightCoefficient = right.coefficient * 10n ** BigInt(scale - right.scale);
  return normalizeDecimal({ coefficient: leftCoefficient + rightCoefficient, scale });
}

function decimalToExactString(decimal) {
  const normalized = normalizeDecimal(decimal);
  const digits = normalized.coefficient.toString();
  if (normalized.scale === 0) return digits;
  const padded = digits.padStart(normalized.scale + 1, "0");
  const split = padded.length - normalized.scale;
  return `${padded.slice(0, split)}.${padded.slice(split)}`;
}

function decimalToNumber(decimal, label) {
  const value = Number(decimalToExactString(decimal));
  if (!Number.isFinite(value)) fail(`${label} is outside the finite numeric range`);
  return value;
}

function parseArea(value, qualifier, line) {
  const normalized = trimCell(value);
  if (normalized === "") {
    if (KNOWN_NUMERIC_QUALIFIERS.has(qualifier) && qualifier !== "r") {
      fail(`blank area is semantically incompatible with qualifier ${qualifier}`, line);
    }
    return null;
  }
  if (NONNUMERIC_QUALIFIERS.has(qualifier)) {
    fail(`numeric area is semantically incompatible with qualifier ${qualifier}`, line);
  }
  return parseDecimal(normalized, line);
}

function requireMapped(value, map, label, line) {
  const normalized = trimCell(value);
  if (!(normalized in map)) fail(`unknown ${label} value ${JSON.stringify(value)}`, line);
  return normalized;
}

function assertBilingual(value, expected, label, line) {
  if (trimCell(value) !== expected) fail(`${label} does not match the controlled English value`, line);
}

/**
 * Parse and validate every source row. Non-target provinces are retained and
 * validated so a source-wide qualifier, dictionary, or duplicate drift cannot
 * be hidden by a target-only filter.
 */
export function parseNfdCsv(text) {
  const records = parseCsv(text);
  if (records.length === 0) throw new Error("NFD CSV is empty.");
  const header = records[0].map(trimCell);
  if (header.length !== NFD_HEADERS.length || header.some((value, index) => value !== NFD_HEADERS[index])) {
    throw new Error(`NFD CSV header drifted; expected ${NFD_HEADERS.join(",")}.`);
  }

  const rows = [];
  const seen = new Set();
  records.slice(1).forEach((record, index) => {
    const line = index + 2;
    if (record.length !== NFD_HEADERS.length) fail(`expected ${NFD_HEADERS.length} columns, got ${record.length}`, line);
    const values = Object.fromEntries(NFD_HEADERS.map((headerName, valueIndex) => [headerName, trimCell(record[valueIndex])]));
    const year = parseYear(values.Year, line);
    if (parseYear(values["Année"], line) !== year) fail("Year and Année disagree", line);
    const iso = requireMapped(values.ISO, JURISDICTION_BY_ISO, "ISO", line);
    const jurisdiction = JURISDICTION_BY_ISO[iso];
    if (values.Jurisdiction !== jurisdiction) fail(`Jurisdiction does not match ISO ${iso}`, line);
    assertBilingual(values.Juridiction, JURISDICTION_FR_BY_EN[jurisdiction], "Juridiction", line);

    const tenure = requireMapped(values["Tenure (En)"], TENURE_FR_BY_EN, "Tenure (En)", line);
    assertBilingual(values["Tenure (Fr)"], TENURE_FR_BY_EN[tenure], "Tenure (Fr)", line);
    const management = requireMapped(values.Management, MANAGEMENT_FR_BY_EN, "Management", line);
    assertBilingual(values.Aménagement, MANAGEMENT_FR_BY_EN[management], "Aménagement", line);
    const harvestingMethod = requireMapped(values["Harvesting method"], HARVEST_METHOD_FR_BY_EN, "Harvesting method", line);
    assertBilingual(values["Méthode de récolte"], HARVEST_METHOD_FR_BY_EN[harvestingMethod], "Méthode de récolte", line);

    const qualifier = values["Data qualifier"];
    if (!Object.hasOwn(NFD_QUALIFIERS, qualifier)) fail(`unknown data qualifier ${JSON.stringify(qualifier)}`, line);
    assertBilingual(values["Qualificatifs de données"], qualifier, "Qualificatifs de données", line);
    if (values["Area (hectares)"] !== values["Superficie (en hectare)"]) {
      fail("English and French area values disagree", line);
    }
    const area = parseArea(values["Area (hectares)"], qualifier, line);

    const key = [year, iso, tenure, management, harvestingMethod].join("\u001f");
    if (seen.has(key)) fail(`duplicate semantic row key ${key}`, line);
    seen.add(key);
    rows.push({
      line,
      year,
      iso,
      jurisdiction,
      tenure,
      management,
      harvestingMethod,
      area,
      areaExact: area === null ? null : decimalToExactString(area),
      qualifier,
    });
  });
  return rows;
}

function validateFrameOptions(options = {}) {
  const provinces = options.provinces ?? TARGET_PROVINCES;
  const startYear = options.startYear ?? START_YEAR;
  const endYear = options.endYear ?? END_YEAR;
  if (!Array.isArray(provinces) || provinces.length === 0 || new Set(provinces).size !== provinces.length) {
    throw new Error("target provinces must be a non-empty unique array");
  }
  if (!Number.isSafeInteger(startYear) || !Number.isSafeInteger(endYear) || startYear > endYear) {
    throw new Error("target year bounds are invalid");
  }
  return { provinces, startYear, endYear };
}

function countQualifiers(rows) {
  const counts = {};
  for (const qualifier of NFD_QUALIFIER_ORDER) {
    const count = rows.filter((row) => row.qualifier === qualifier).length;
    if (count > 0) counts[qualifier] = count;
  }
  return counts;
}

function makeAggregate(province, year, rows) {
  const knownRows = rows.filter((row) => row.area !== null);
  const notApplicableRows = rows.filter((row) => row.area === null && row.qualifier === "n");
  const unknownRows = rows.filter((row) => row.area === null && row.qualifier !== "n");
  let knownArea = { coefficient: 0n, scale: 0 };
  for (const row of knownRows) knownArea = addDecimals(knownArea, row.area);
  const knownAreaExact = decimalToExactString(knownArea);
  const unknownQualifierSet = [...new Set(unknownRows.map((row) => row.qualifier))].sort(
    (left, right) => NFD_QUALIFIER_ORDER.indexOf(left) - NFD_QUALIFIER_ORDER.indexOf(right),
  );
  let state;
  if (rows.length === 0) state = "no-source-rows";
  else if (unknownRows.length > 0) state = "partial-unknown";
  else if (notApplicableRows.length > 0) state = "complete-with-not-applicable";
  else state = "complete";
  const complete = unknownRows.length === 0 && rows.length > 0;
  const areaExact = complete ? knownAreaExact : null;
  return {
    province,
    year,
    areaHectares: areaExact === null ? null : decimalToNumber(knownArea, `${province}:${year} aggregate`),
    areaHectaresExact: areaExact,
    knownAreaHectares: decimalToNumber(knownArea, `${province}:${year} known-area aggregate`),
    knownAreaHectaresExact: knownAreaExact,
    sourceRowCount: rows.length,
    knownAreaRowCount: knownRows.length,
    blankAreaRowCount: rows.length - knownRows.length,
    qualifierCounts: countQualifiers(rows),
    missingness: {
      state,
      unknownAreaRowCount: unknownRows.length,
      notApplicableRowCount: notApplicableRows.length,
      unknownQualifiers: unknownQualifierSet,
    },
    likeForLikeClaim: false,
  };
}

/**
 * Produce the fixed target frame. Missing source groups remain present as
 * `no-source-rows`; they are never silently dropped or represented as zero.
 */
export function aggregateNfdRows(rows, options = {}) {
  if (!Array.isArray(rows)) throw new TypeError("NFD parsed rows must be an array.");
  const { provinces, startYear, endYear } = validateFrameOptions(options);
  const groups = new Map();
  const seenSourceKeys = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object" || !Number.isSafeInteger(row.year) || typeof row.iso !== "string") {
      throw new Error("NFD aggregate received an invalid parsed row.");
    }
    const sourceKey = [row.year, row.iso, row.tenure, row.management, row.harvestingMethod].join("\u001f");
    if (seenSourceKeys.has(sourceKey)) throw new Error(`NFD aggregate received duplicate semantic row key ${sourceKey}`);
    seenSourceKeys.add(sourceKey);
    if (!provinces.includes(row.iso) || row.year < startYear || row.year > endYear) continue;
    const key = `${row.iso}:${row.year}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const frame = [];
  for (const province of provinces) {
    for (let year = startYear; year <= endYear; year += 1) {
      frame.push(makeAggregate(province, year, groups.get(`${province}:${year}`) ?? []));
    }
  }
  const expectedRowCount = provinces.length * (endYear - startYear + 1);
  if (frame.length !== expectedRowCount) throw new Error("NFD aggregate frame arithmetic drifted.");
  return frame;
}

export function transformNfdCsv(text, options = {}) {
  return aggregateNfdRows(parseNfdCsv(text), options);
}

export function expectedFrameKeys(options = {}) {
  const { provinces, startYear, endYear } = validateFrameOptions(options);
  const keys = [];
  for (const province of provinces) {
    for (let year = startYear; year <= endYear; year += 1) keys.push(`${province}:${year}`);
  }
  return keys;
}

export function exactDecimal(value) {
  if (typeof value === "string") return decimalToExactString(parseDecimal(value));
  if (value && typeof value === "object" && typeof value.coefficient === "bigint") return decimalToExactString(value);
  throw new TypeError("exactDecimal expects a decimal string or internal decimal value");
}
