import { readFile } from "node:fs/promises";

/** The verified staging record. Any drift from these values fails the gate. */
const EXPECTED_TOTAL_BYTES = 578421880;

const EXPECTED_LICENCES = new Map([
  ["statcan-open-licence", {
    publisher: "Statistics Canada",
    versionKind: "unknown",
    attribution: "Adapted from Statistics Canada, name of product, reference date. This does not constitute an endorsement by Statistics Canada of this product.",
  }],
  ["ogl-canada-2.0", {
    publisher: "Elections Canada",
    versionKind: "known",
    versionValue: "2.0",
    attribution: "Contains information licensed under the Open Government Licence – Canada.",
  }],
]);

const EXPECTED_EDITIONS = new Map([
  ["statcan-2021-provinces-territories-cbf", {
    publisher: "Statistics Canada",
    licenceId: "statcan-open-licence",
    fileName: "lpr_000b21a_e.zip",
    byteLength: 133730024,
    sha256: "d28bbb15d7b49e3d1828755a5f1b4ebcee699ad70efe8b0f1b902d29ebffd20b",
    featureCount: 13,
    representationOrder: null,
  }],
  ["statcan-2021-census-divisions-cbf", {
    publisher: "Statistics Canada",
    licenceId: "statcan-open-licence",
    fileName: "lcd_000b21a_e.zip",
    byteLength: 139871865,
    sha256: "1b638cea73fbf8349ba908d86be678272b2abcc74240fb0dfd9daf7a28457ad0",
    featureCount: 293,
    representationOrder: null,
  }],
  ["statcan-2021-census-subdivisions-cbf", {
    publisher: "Statistics Canada",
    licenceId: "statcan-open-licence",
    fileName: "lcsd000b21a_e.zip",
    byteLength: 155981521,
    sha256: "f98d955bff9a8151d002bb07c5fc50775b624d4f2f4052dbe05fe54d58f3bbe8",
    featureCount: 5161,
    representationOrder: null,
  }],
  ["elections-canada-fed-2023", {
    publisher: "Elections Canada",
    licenceId: "ogl-canada-2.0",
    fileName: "FED_CA_2023_EN-SHP.zip",
    byteLength: 9388965,
    sha256: "eab55b952164ba7e8bf569f00c1fe4b6480b532411e1436de427772d9cebae59",
    featureCount: 343,
    representationOrder: "2023",
  }],
  ["statcan-2021-fed-2013-order-cbf", {
    publisher: "Statistics Canada",
    licenceId: "statcan-open-licence",
    fileName: "lfed000b21a_e.zip",
    byteLength: 139449505,
    sha256: "0f0154fd43e3bee3f4145f32b983d9e5ec06ebb7b16cc7d6c7d94a39f2c2791b",
    featureCount: 338,
    representationOrder: "2013",
  }],
]);

/** The geospatial toolchain actually installed on the staging machine. */
const EXPECTED_TOOLCHAIN = { gdal: "3.13.2", proj: "9.8.1", geos: "3.14.1" };

/**
 * Wording this record used to carry. It was false: GDAL is installed. The gate keeps the
 * retired claim out so the record cannot drift back to it.
 */
const RETIRED_MISSING_GDAL_CLAIM = /gdalinfo is not installed|GDAL is not installed/i;

/**
 * The second retired claim. GDAL was not merely installed, it was run: `ogrinfo -so` header
 * reads against these archives confirmed the feature counts and the CRS identity.
 * Understating a verified read is as much a defect as overstating one.
 */
const RETIRED_UNREAD_ARCHIVES_CLAIM =
  /(?:it |GDAL |OGR |ogrinfo )?was not run against these archives|were not opened with GDAL|no vector content was (?:read|opened)|the \.shp vector content was NOT opened/i;

/**
 * `ogrinfo -so` reads headers only. Geometry validity, topology, the full attribute schema,
 * reprojection, and intersection were all never performed, and the record may not say they
 * were. These patterns are the overclaims the gate refuses.
 */
const NOT_NEGATED = "(?<!\\bno )(?<!\\bnot )(?<!\\bnever )";
/** A short span of the same sentence, so "X ... were checked" is caught as well as "X was checked". */
const SPAN = "[^.;—]{0,48}?\\s";
const WAS = "(?:was|were|has been|have been|is|are)\\b";
const OVERCLAIMED_VALIDATION = [
  new RegExp(`${NOT_NEGATED}\\bgeometr(?:y|ies)\\b${SPAN}${WAS} (?:checked|validated|verified|confirmed|sound|valid)\\b`, "i"),
  new RegExp(`\\b(?:validated|verified|checked) (?:the )?geometr(?:y|ies)\\b`, "i"),
  new RegExp(`${NOT_NEGATED}\\btopolog(?:y|ical)\\b${SPAN}${WAS} (?:checked|validated|verified|confirmed|clean|sound)\\b`, "i"),
  new RegExp(`${NOT_NEGATED}\\b(?:self-intersections|ring order|duplicate identifiers|null or empty geometries)\\b${SPAN}${WAS} (?:checked|validated|verified|ruled out)\\b`, "i"),
  new RegExp(`${NOT_NEGATED}\\b(?:reprojection|intersection)s?\\b${SPAN}(?:was|were|has|have)\\b\\s(?:been )?(?:run|executed|performed|completed)\\b`, "i"),
  new RegExp(`${NOT_NEGATED}\\b(?:full )?attribute schema\\b${SPAN}${WAS} (?:validated|verified|read|checked|confirmed|known)\\b`, "i"),
];

/** Any prose field of the record that must not overclaim what the header reads established. */
function refuseOverclaims(text, where) {
  for (const pattern of OVERCLAIMED_VALIDATION) {
    const match = pattern.exec(text);
    if (match) {
      throw new Error(
        `${where} claims validation that was never performed: "${match[0]}". ogrinfo -so reads headers only; geometry validity, topology, and the full attribute schema are Unknown, and no reprojection or intersection has been executed.`,
      );
    }
  }
}

const DISTRICT_COUNT_BY_ORDER = { "2013": 338, "2023": 343 };
const SHA_256 = /^[a-f0-9]{64}$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
}

function requireHttpsUrl(value, field) {
  required(value, field);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} must be an absolute URL.`);
  }
  if (parsed.protocol !== "https:") throw new Error(`${field} must be an https URL.`);
}

function requireUtcTimestamp(value, field) {
  if (!UTC_TIMESTAMP.test(value ?? "") || Number.isNaN(new Date(value).getTime())) {
    throw new Error(`${field} must be a UTC timestamp.`);
  }
}

function validateLicences(record) {
  if (!Array.isArray(record.licences) || record.licences.length !== EXPECTED_LICENCES.size) {
    throw new Error("The record must carry both licences, from both publishers.");
  }
  const seen = new Set();
  for (const licence of record.licences) {
    const expected = EXPECTED_LICENCES.get(licence.id);
    if (!expected) throw new Error(`Unexpected licence ${licence.id}.`);
    if (seen.has(licence.id)) throw new Error("Licence ids must be unique.");
    seen.add(licence.id);
    required(licence.name, `${licence.id} name`);
    if (licence.publisher !== expected.publisher) throw new Error(`${licence.id} publisher changed.`);
    requireHttpsUrl(licence.url, `${licence.id} url`);
    const version = licence.version;
    if (!version || typeof version !== "object") throw new Error(`${licence.id} licence version is required.`);
    if (version.kind !== expected.versionKind) throw new Error(`${licence.id} licence version kind changed.`);
    if (version.kind === "unknown") {
      required(version.reason, `${licence.id} unknown-version reason`);
      if ("value" in version) throw new Error(`${licence.id} carries no version number; none may be supplied.`);
    } else {
      if (version.value !== expected.versionValue) throw new Error(`${licence.id} version value changed.`);
      if ("reason" in version) throw new Error(`${licence.id} has a known version and needs no unknown reason.`);
    }
    if (licence.requiredAttributionTemplate !== expected.attribution) {
      throw new Error(`${licence.id} required attribution wording changed; it is quoted verbatim from the licence.`);
    }
  }
}

/**
 * The toolchain claim must match the machine in both directions: it may not understate the
 * installed versions, and it may not overstate what was read with them.
 */
function validateToolchain(record) {
  const toolchain = record.toolchain;
  if (!toolchain || typeof toolchain !== "object") throw new Error("The installed geospatial toolchain must be recorded.");
  for (const [tool, version] of Object.entries(EXPECTED_TOOLCHAIN)) {
    if (toolchain[tool] !== version) {
      throw new Error(`Recorded ${tool} version is ${toolchain[tool]}; the installed version is ${version}.`);
    }
  }
  required(toolchain.versionSource, "Toolchain version source");
  required(toolchain.readNote, "Toolchain read note");
  if (toolchain.vectorContentRead !== true) {
    throw new Error("ogrinfo -so was run against these archives; the record must not understate that read.");
  }
  if (toolchain.vectorReadDepth !== "headers-only") {
    throw new Error("The read was ogrinfo -so, which is headers-only; the record must record that depth.");
  }
  if (toolchain.geometryValidated !== false) {
    throw new Error("No geometry validity check has been run; the record must not claim one.");
  }
  if (!/ogrinfo -so/.test(toolchain.readNote)) {
    throw new Error("The read note must name the read that was actually performed, ogrinfo -so.");
  }
  if (RETIRED_MISSING_GDAL_CLAIM.test(toolchain.readNote) || RETIRED_UNREAD_ARCHIVES_CLAIM.test(toolchain.readNote)) {
    throw new Error("GDAL is installed and was run against these archives; the read note must not deny either.");
  }
  refuseOverclaims(toolchain.readNote, "The toolchain read note");
}

function validateEditions(record) {
  if (!Array.isArray(record.editions) || record.editions.length !== EXPECTED_EDITIONS.size) {
    throw new Error("The record must contain the exact staged boundary editions.");
  }
  const seen = new Set();
  let total = 0;
  for (const edition of record.editions) {
    const expected = EXPECTED_EDITIONS.get(edition.id);
    if (!expected) throw new Error(`Unexpected boundary edition ${edition.id}.`);
    if (seen.has(edition.id)) throw new Error("Boundary edition ids must be unique.");
    seen.add(edition.id);

    if (edition.publisher !== expected.publisher) throw new Error(`${edition.id} publisher changed.`);
    if (edition.licenceId !== expected.licenceId) throw new Error(`${edition.id} licence changed.`);
    if (!record.licences.some((licence) => licence.id === edition.licenceId)) {
      throw new Error(`${edition.id} references a licence that is not recorded.`);
    }
    if (edition.fileName !== expected.fileName) throw new Error(`${edition.id} file name changed.`);
    requireHttpsUrl(edition.catalogueUrl, `${edition.id} catalogue URL`);
    requireHttpsUrl(edition.fileUrl, `${edition.id} file URL`);
    if (!edition.fileUrl.endsWith(expected.fileName)) throw new Error(`${edition.id} file URL does not resolve to its recorded file.`);
    required(edition.productName, `${edition.id} product name`);
    required(edition.edition, `${edition.id} edition`);
    required(edition.referenceDate, `${edition.id} reference date`);
    requireUtcTimestamp(edition.retrievedAt, `${edition.id} retrieval timestamp`);

    if (edition.byteLength !== expected.byteLength) throw new Error(`${edition.id} byte length changed.`);
    if (edition.contentLengthMatched !== true) throw new Error(`${edition.id} byte length must match the preflight Content-Length.`);
    if (edition.sha256 !== expected.sha256 || !SHA_256.test(edition.sha256)) throw new Error(`${edition.id} checksum changed.`);
    if (edition.featureCount !== expected.featureCount) throw new Error(`${edition.id} feature count changed.`);
    if (edition.unzipTest !== "ok") throw new Error(`${edition.id} archive integrity is not recorded as ok.`);
    if (!Number.isSafeInteger(edition.unzipEntryCount) || edition.unzipEntryCount <= 0) throw new Error(`${edition.id} unzip entry count is required.`);
    if (edition.productionEligible !== false) throw new Error("A staging record cannot grant production eligibility.");

    const order = edition.representationOrder;
    if (order !== expected.representationOrder) throw new Error(`${edition.id} representation order changed.`);
    required(edition.representationOrderNote, `${edition.id} representation order note`);
    if (order !== null) {
      if (edition.featureCount !== DISTRICT_COUNT_BY_ORDER[order]) {
        throw new Error(`${edition.id} feature count does not match the ${order} Representation Order district count.`);
      }
      if (order === "2013" && edition.supersededBy !== "elections-canada-fed-2023") {
        throw new Error("The 2013 Representation Order edition must record what supersedes it.");
      }
      if (order === "2013" && edition.currentForRankings !== false) {
        throw new Error("The 2013 Representation Order edition must not be marked current for rankings.");
      }
      if (order === "2023" && edition.currentForRankings !== true) {
        throw new Error("The 2023 Representation Order edition must be marked current for rankings.");
      }
    }
    required(edition.requiredAttribution, `${edition.id} required attribution`);
    if (edition.licenceId === "ogl-canada-2.0" && !/Open Government Licence/.test(edition.requiredAttribution)) {
      throw new Error(`${edition.id} must carry the Open Government Licence attribution.`);
    }
    if (edition.licenceId === "statcan-open-licence") {
      if (!edition.requiredAttribution.startsWith("Adapted from Statistics Canada,")) {
        throw new Error(`${edition.id} must use the value-added "Adapted from" attribution form.`);
      }
      if (!edition.requiredAttribution.includes("does not constitute an endorsement by Statistics Canada")) {
        throw new Error(`${edition.id} must retain the Statistics Canada non-endorsement sentence.`);
      }
      if (/name of product|reference date\./.test(edition.requiredAttribution)) {
        throw new Error(`${edition.id} attribution still contains unfilled licence placeholders.`);
      }
    }
    total += edition.byteLength;
  }
  return total;
}

export function validateBoundaryEditions(record) {
  if (record?.status !== "local-staging-record") throw new Error("Boundary editions must remain a local-staging-record.");
  required(record.notice, "Notice");
  if (RETIRED_MISSING_GDAL_CLAIM.test(record.notice)) {
    throw new Error("GDAL is installed; the notice must not claim it is missing.");
  }
  if (!record.notice.includes(`GDAL ${EXPECTED_TOOLCHAIN.gdal}`)) {
    throw new Error("The notice must record the installed GDAL version.");
  }
  if (RETIRED_UNREAD_ARCHIVES_CLAIM.test(record.notice)) {
    throw new Error("ogrinfo -so was run against these archives; the notice must not claim otherwise.");
  }
  if (!/ogrinfo -so/.test(record.notice)) {
    throw new Error("The notice must record the read that was performed, ogrinfo -so.");
  }
  if (!/reads headers only/.test(record.notice)) {
    throw new Error("The notice must keep the headers-only limitation on that read.");
  }
  if (!/geometry validity and the full attribute schema remain Unknown/.test(record.notice)) {
    throw new Error("The notice must keep geometry validity and the full attribute schema as Unknown.");
  }
  if (!/no reprojection and no intersection has been executed/.test(record.notice)) {
    throw new Error("The notice must keep the no-reprojection, no-intersection limitation.");
  }
  refuseOverclaims(record.notice, "The notice");
  if (!/not been ingested|Nothing here has been ingested/i.test(record.notice)) throw new Error("The notice must keep the not-ingested limitation.");
  requireUtcTimestamp(record.stagedAt, "Staging time");
  required(record.featureCountMethod, "Feature-count method");
  if (!/\.shx/.test(record.featureCountMethod)) throw new Error("The feature-count method must state that counts come from the .shx index.");
  if (!/OGR|ogrinfo/.test(record.featureCountMethod)) {
    throw new Error("The feature-count method must record that the .shx arithmetic was confirmed by real OGR reads.");
  }
  refuseOverclaims(record.featureCountMethod, "The feature-count method");
  required(record.licenceNotice, "Licence notice");

  if (!Array.isArray(record.limitations) || record.limitations.length === 0) throw new Error("Limitations are required.");
  const limitations = record.limitations.join("\n");
  if (!/French-language editions of the Statistics Canada files are NOT staged/.test(limitations)) {
    throw new Error("The record must state that French-language editions are not staged.");
  }
  if (RETIRED_MISSING_GDAL_CLAIM.test(limitations)) {
    throw new Error("GDAL is installed; the limitations must not claim it is missing.");
  }
  if (RETIRED_UNREAD_ARCHIVES_CLAIM.test(limitations)) {
    throw new Error("ogrinfo -so was run against these archives; the limitations must not claim otherwise.");
  }
  if (!/opened with ogrinfo -so, which reads headers only/.test(limitations)) {
    throw new Error("The record must state that the archives were read with ogrinfo -so, headers only.");
  }
  if (!/no geometry was examined/.test(limitations)) {
    throw new Error("The record must state that no geometry was examined.");
  }
  if (!/No reprojection and no intersection has been executed/.test(limitations)) {
    throw new Error("The record must state that no reprojection and no intersection has been executed.");
  }
  refuseOverclaims(limitations, "The limitations");
  if (!/Unknown/.test(limitations)) throw new Error("Unvalidated geometry must be recorded as Unknown.");
  if (!/publishes no 2023 Representation Order boundary file/.test(limitations)) {
    throw new Error("The record must state why the current-order geometry comes from Elections Canada.");
  }

  validateToolchain(record);
  validateLicences(record);
  const total = validateEditions(record);
  if (total !== EXPECTED_TOTAL_BYTES) {
    throw new Error(`Boundary byte total is ${total}; the verified staging total is ${EXPECTED_TOTAL_BYTES}.`);
  }
  if (record.totalByteLength !== total) {
    throw new Error(`Recorded total ${record.totalByteLength} does not equal the recomputed total ${total}.`);
  }
  return record;
}

export async function checkBoundaryEditions(file = new URL("../data/boundary-editions.json", import.meta.url)) {
  return validateBoundaryEditions(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = await checkBoundaryEditions();
  console.log(`Boundary editions passed for ${record.editions.length} editions under ${record.licences.length} licences, ${record.totalByteLength} verified bytes.`);
}
