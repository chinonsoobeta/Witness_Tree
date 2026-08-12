import { readFile } from "node:fs/promises";

/** The verified VLCE2 grid identity. Any drift from these values fails the gate. */
const EXPECTED_YEAR_COUNT = 39;
const EXPECTED_FIRST_YEAR = 1984;
const EXPECTED_LAST_YEAR = 2022;
const EXPECTED_WIDTH = 193936;
const EXPECTED_HEIGHT = 128340;
const EXPECTED_CELL_COUNT = 24889746240;
const EXPECTED_GEOTRANSFORM = [-2660910.524, 30.0, 0.0, 2998848.1105, 0.0, -30.0];
const EXPECTED_PIXEL_SIZE = 30;
const EXPECTED_BAND_COUNT = 1;
const EXPECTED_DATA_TYPE = "Byte";
const EXPECTED_NODATA = 255;

const EXPECTED_RASTER_PROJ4 =
  "+proj=lcc +lat_0=49 +lon_0=-95 +lat_1=49 +lat_2=77 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs";
const EXPECTED_BOUNDARY_PROJ4 =
  "+proj=lcc +lat_0=63.390675 +lon_0=-91.8666666666667 +lat_1=49 +lat_2=77 +x_0=6200000 +y_0=3000000 +datum=NAD83 +units=m +no_defs";

const EXPECTED_TOOLCHAIN = { gdal: "3.13.2", proj: "9.8.1", geos: "3.14.1" };

const EXPECTED_CLASSES = [
  [0, "unclassified"],
  [20, "water"],
  [31, "snow_ice"],
  [32, "rock_rubble"],
  [33, "exposed_barren_land"],
  [40, "bryoids"],
  [50, "shrubs"],
  [80, "wetland"],
  [81, "wetland_treed"],
  [100, "herbs"],
  [210, "coniferous"],
  [220, "broadleaf"],
  [230, "mixedwood"],
];

const EXPECTED_BOUNDARY_COUNTS = new Map([
  ["FED_CA_2023_EN-SHP.zip", 343],
  ["lfed000b21a_e.zip", 338],
  ["lpr_000b21a_e.zip", 13],
  ["lcd_000b21a_e.zip", 293],
  ["lcsd000b21a_e.zip", 5161],
]);

const EXPECTED_DEFECTIVE_YEARS = [1991, 2005];
const EXPECTED_EMPTY_VAT_BYTES = 98;
const EXPECTED_POPULATED_VAT_BYTES = 488;
const EXPECTED_POPULATED_VAT_RECORDS = 13;

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
}

function requireBilingual(value, field) {
  if (!value || typeof value !== "object") throw new Error(`${field} must be a bilingual {en, fr} string.`);
  required(value.en, `${field} English text`);
  required(value.fr, `${field} French text`);
  if (Object.keys(value).length !== 2) throw new Error(`${field} must carry exactly the en and fr keys.`);
}

function requireUtcTimestamp(value, field) {
  if (!UTC_TIMESTAMP.test(value ?? "") || Number.isNaN(new Date(value).getTime())) {
    throw new Error(`${field} must be a UTC timestamp.`);
  }
}

function requireNumber(value, expected, field) {
  if (value !== expected) throw new Error(`${field} is ${value}; the verified value is ${expected}.`);
}

function forbidPresentTenseCoverage(text, field) {
  if (/1984\s*[–—-]\s*present/i.test(text) || /1984\s+to\s+present/i.test(text)) {
    throw new Error(`${field} claims coverage to the present. The staged VLCE2 series ends in ${EXPECTED_LAST_YEAR}.`);
  }
}

function validateTemporalCoverage(record) {
  const coverage = record.temporalCoverage;
  if (!coverage || typeof coverage !== "object") throw new Error("Temporal coverage is required.");
  requireNumber(coverage.firstYear, EXPECTED_FIRST_YEAR, "First covered year");
  requireNumber(coverage.lastYear, EXPECTED_LAST_YEAR, "Last covered year");
  requireNumber(coverage.yearCount, EXPECTED_YEAR_COUNT, "Covered year count");
  requireBilingual(coverage.label, "Temporal coverage label");
  requireBilingual(coverage.note, "Temporal coverage note");
  forbidPresentTenseCoverage(coverage.label.en, "Temporal coverage label");
  forbidPresentTenseCoverage(coverage.label.fr, "Temporal coverage label");
  if (!coverage.label.en.includes(String(EXPECTED_LAST_YEAR))) {
    throw new Error(`The temporal coverage label must name the last covered year, ${EXPECTED_LAST_YEAR}.`);
  }
  if (!/Unknown/.test(coverage.note.en) || !/[Ii]nconnue?/.test(coverage.note.fr)) {
    throw new Error("Coverage after the last staged year must be recorded as Unknown in both languages.");
  }
}

function validateGrid(record) {
  const grid = record.grid;
  if (!grid || typeof grid !== "object") throw new Error("The grid identity is required.");

  const crs = grid.crs;
  if (!crs || typeof crs !== "object") throw new Error("The grid CRS is required.");
  required(crs.id, "Grid CRS id");
  required(crs.name, "Grid CRS name");
  if (crs.proj4 !== EXPECTED_RASTER_PROJ4) throw new Error("The raster grid proj4 string changed.");
  required(crs.wkt, "Grid CRS WKT");
  if (!crs.wkt.startsWith("PROJCRS[")) throw new Error("The grid CRS WKT must be the full PROJCRS definition.");
  if (!crs.wkt.includes('METHOD["Lambert Conic Conformal (2SP)"')) {
    throw new Error("The grid CRS WKT must retain its Lambert Conic Conformal (2SP) method.");
  }
  if (crs.authorityCode !== null) {
    throw new Error("The projected CRS carries no authority code; none may be supplied.");
  }
  required(crs.authorityCodeNote, "Grid CRS authority-code note");

  if (!Array.isArray(grid.geotransform) || grid.geotransform.length !== 6) {
    throw new Error("The geotransform must have six terms.");
  }
  grid.geotransform.forEach((term, index) => {
    if (!Object.is(term, EXPECTED_GEOTRANSFORM[index])) {
      throw new Error(`Geotransform term ${index} is ${term}; the verified value is ${EXPECTED_GEOTRANSFORM[index]}.`);
    }
  });

  requireNumber(grid.width, EXPECTED_WIDTH, "Raster width");
  requireNumber(grid.height, EXPECTED_HEIGHT, "Raster height");
  requireNumber(grid.cellCount, EXPECTED_CELL_COUNT, "Cell count");
  if (grid.width * grid.height !== grid.cellCount) {
    throw new Error(`Recorded cell count ${grid.cellCount} does not equal the recomputed ${grid.width * grid.height}.`);
  }
  requireNumber(grid.pixelSize?.x, EXPECTED_PIXEL_SIZE, "Pixel width");
  requireNumber(grid.pixelSize?.y, -EXPECTED_PIXEL_SIZE, "Pixel height");
  if (grid.pixelSize?.unit !== "metre") throw new Error("Pixel size must be recorded in metres.");
  requireNumber(grid.bandCount, EXPECTED_BAND_COUNT, "Band count");
  if (grid.dataType !== EXPECTED_DATA_TYPE) throw new Error(`Data type is ${grid.dataType}; the verified type is ${EXPECTED_DATA_TYPE}.`);
  requireNumber(grid.noDataValue, EXPECTED_NODATA, "NoData value");
  requireNumber(grid.origin?.x, EXPECTED_GEOTRANSFORM[0], "Origin easting");
  requireNumber(grid.origin?.y, EXPECTED_GEOTRANSFORM[3], "Origin northing");
  if (grid.identicalAcrossYears !== true) throw new Error("The record must state that the grid is identical across all years.");
  required(grid.identicalAcrossYearsEvidence, "Cross-year evidence");
}

function validateClassScheme(record) {
  const scheme = record.classScheme;
  if (!scheme || typeof scheme !== "object") throw new Error("The class scheme is required.");
  requireNumber(scheme.classCount, EXPECTED_CLASSES.length, "Class count");
  if (!Array.isArray(scheme.classes) || scheme.classes.length !== EXPECTED_CLASSES.length) {
    throw new Error(`The class scheme must carry exactly ${EXPECTED_CLASSES.length} classes.`);
  }
  scheme.classes.forEach((entry, index) => {
    const [value, code] = EXPECTED_CLASSES[index];
    if (entry.value !== value) throw new Error(`Class ${index} value is ${entry.value}; the documented value is ${value}.`);
    if (entry.code !== code) throw new Error(`Class ${value} code is ${entry.code}; the documented code is ${code}.`);
    requireBilingual(entry.label, `Class ${value} label`);
  });
  required(scheme.source, "Class scheme source");
}

function validateYears(record) {
  if (!Array.isArray(record.years) || record.years.length !== EXPECTED_YEAR_COUNT) {
    throw new Error(`The record must cover exactly ${EXPECTED_YEAR_COUNT} years.`);
  }
  const seen = new Set();
  record.years.forEach((year, index) => {
    if (!Number.isInteger(year)) throw new Error(`Year ${year} is not an integer.`);
    if (seen.has(year)) throw new Error(`Year ${year} is recorded twice.`);
    seen.add(year);
    if (year !== EXPECTED_FIRST_YEAR + index) {
      throw new Error(`The year series has a gap at index ${index}: expected ${EXPECTED_FIRST_YEAR + index}, found ${year}.`);
    }
  });
  if (record.years[0] !== EXPECTED_FIRST_YEAR || record.years[record.years.length - 1] !== EXPECTED_LAST_YEAR) {
    throw new Error(`The year series must run ${EXPECTED_FIRST_YEAR}–${EXPECTED_LAST_YEAR}.`);
  }
}

function validateReprojection(record) {
  const policy = record.resamplingPolicy;
  if (policy?.policy !== "never-resample-the-raster") {
    throw new Error("The record must keep the never-resample-the-raster policy for the categorical grid.");
  }
  requireBilingual(policy.statement, "Resampling policy statement");

  const reprojection = record.reprojection;
  if (reprojection?.direction !== "vector-to-raster-grid") {
    throw new Error("The only admitted reprojection direction is vector-to-raster-grid.");
  }
  if (reprojection.rasterCrsProj4 !== EXPECTED_RASTER_PROJ4) throw new Error("The recorded raster CRS changed.");
  if (reprojection.boundaryCrsProj4 !== EXPECTED_BOUNDARY_PROJ4) throw new Error("The recorded boundary CRS changed.");
  if (reprojection.crsMatch !== false) {
    throw new Error("The raster and boundary coordinate reference systems differ; the record must not claim they match.");
  }
  requireBilingual(reprojection.statement, "Reprojection statement");

  const agreement = record.boundaryCrsAgreement;
  if (agreement?.statCanEqualsElectionsCanada !== true) {
    throw new Error("The two boundary publishers' CRSs were verified identical; the record must say so.");
  }
  required(agreement.method, "Boundary CRS comparison method");
  requireBilingual(agreement.statement, "Boundary CRS agreement statement");
}

function validateBoundaryFeatureCounts(record) {
  const block = record.boundaryFeatureCounts;
  if (!block || !Array.isArray(block.layers) || block.layers.length !== EXPECTED_BOUNDARY_COUNTS.size) {
    throw new Error(`The record must carry all ${EXPECTED_BOUNDARY_COUNTS.size} confirmed boundary feature counts.`);
  }
  required(block.method, "Boundary feature-count method");
  if (!/OGR|ogrinfo/.test(block.method)) throw new Error("The feature-count method must state that the counts come from real OGR reads.");
  const seen = new Set();
  for (const layer of block.layers) {
    const expected = EXPECTED_BOUNDARY_COUNTS.get(layer.archive);
    if (expected === undefined) throw new Error(`Unexpected boundary archive ${layer.archive}.`);
    if (seen.has(layer.archive)) throw new Error("Boundary archives must be unique.");
    seen.add(layer.archive);
    required(layer.layer, `${layer.archive} layer name`);
    if (layer.featureCount !== expected) {
      throw new Error(`${layer.archive} feature count is ${layer.featureCount}; the confirmed count is ${expected}.`);
    }
    if (layer.geometryType !== "Polygon") throw new Error(`${layer.archive} geometry type changed.`);
  }
}

export function validateRasterGrid(record) {
  if (record?.status !== "local-validation-record") throw new Error("The raster grid record must remain a local-validation-record.");
  required(record.notice, "Notice");
  if (!/not been ingested|Nothing here has been ingested/i.test(record.notice)) {
    throw new Error("The notice must keep the not-ingested limitation.");
  }
  if (!/promoted to object storage/i.test(record.notice)) {
    throw new Error("The notice must keep the not-promoted-to-object-storage limitation.");
  }
  requireUtcTimestamp(record.validatedAt, "Validation time");
  required(record.validationReport, "Validation report path");
  required(record.productName, "Product name");
  required(record.publisher, "Publisher");

  const toolchain = record.toolchain;
  if (!toolchain || typeof toolchain !== "object") throw new Error("The toolchain is required.");
  for (const [tool, version] of Object.entries(EXPECTED_TOOLCHAIN)) {
    if (toolchain[tool] !== version) throw new Error(`Recorded ${tool} version is ${toolchain[tool]}; the version used was ${version}.`);
  }
  required(toolchain.readMethod, "Toolchain read method");
  if (toolchain.statsRun !== false) throw new Error("gdalinfo -stats was never run; the record must not claim it was.");
  required(toolchain.statsNote, "Toolchain statistics note");

  validateTemporalCoverage(record);
  validateGrid(record);
  validateClassScheme(record);
  validateYears(record);
  validateReprojection(record);
  validateBoundaryFeatureCounts(record);

  if (!Array.isArray(record.limitations) || record.limitations.length === 0) throw new Error("Limitations are required.");
  const limitations = record.limitations.join("\n");
  forbidPresentTenseCoverage(limitations, "Limitations");
  if (!/-stats was never run/.test(limitations)) throw new Error("The record must state that gdalinfo -stats was never run.");
  if (!/ogrinfo -so reads headers only/.test(limitations)) {
    throw new Error("The record must state that no geometry validity check has been run on any vector.");
  }
  if (!/No reprojection and no raster-to-vector intersection has actually been executed/.test(limitations)) {
    throw new Error("The record must state that no reprojection or intersection has been executed.");
  }
  if (!/Unknown/.test(limitations)) throw new Error("Unvalidated properties must be recorded as Unknown.");
  if (record.productionEligible !== false) throw new Error("A validation record cannot grant production eligibility.");
  return record;
}

export function validateRasterDefects(record, grid) {
  if (record?.status !== "local-validation-record") throw new Error("The raster defects record must remain a local-validation-record.");
  required(record.notice, "Defect notice");
  if (!/not been ingested|Nothing here has been ingested/i.test(record.notice)) {
    throw new Error("The defect notice must keep the not-ingested limitation.");
  }
  requireUtcTimestamp(record.observedAt, "Observation time");
  if (record.defectType !== "empty-raster-attribute-table") throw new Error("The recorded defect type changed.");
  if (record.sidecarSuffix !== ".tif.vat.dbf") throw new Error("The recorded sidecar suffix changed.");
  requireNumber(record.seriesYearCount, EXPECTED_YEAR_COUNT, "Series year count");
  requireNumber(record.defectiveYearCount, EXPECTED_DEFECTIVE_YEARS.length, "Defective year count");
  requireNumber(record.populatedYearCount, EXPECTED_YEAR_COUNT - EXPECTED_DEFECTIVE_YEARS.length, "Populated year count");
  if (record.populatedYearCount + record.defectiveYearCount !== record.seriesYearCount) {
    throw new Error("Populated and defective year counts must account for every year in the series.");
  }
  requireNumber(record.control?.byteLength, EXPECTED_POPULATED_VAT_BYTES, "Control sidecar byte length");
  requireNumber(record.control?.recordCount, EXPECTED_POPULATED_VAT_RECORDS, "Control sidecar record count");
  requireBilingual(record.control.statement, "Control statement");
  requireBilingual(record.origin, "Defect origin");
  requireBilingual(record.rule, "Missing-evidence rule");
  requireBilingual(record.consequence, "Defect consequence");

  const rule = record.rule.en;
  if (rule !== "Render insufficient evidence as `Unknown` with an em dash and a reason. Do not substitute `0`, including in summaries, exports, tables, or tests.") {
    throw new Error("The missing-evidence rule is quoted verbatim and must not be reworded.");
  }

  if (!Array.isArray(record.defects) || record.defects.length !== EXPECTED_DEFECTIVE_YEARS.length) {
    throw new Error(`Exactly ${EXPECTED_DEFECTIVE_YEARS.length} years are recorded as VAT-defective.`);
  }
  const seen = new Set();
  record.defects.forEach((defect, index) => {
    const year = EXPECTED_DEFECTIVE_YEARS[index];
    if (defect.year !== year) throw new Error(`Defective year ${index} is ${defect.year}; the observed year is ${year}.`);
    if (seen.has(defect.year)) throw new Error("Defective years must be unique.");
    seen.add(defect.year);
    required(defect.archive, `${year} archive`);
    required(defect.sidecarFileName, `${year} sidecar file name`);
    if (!defect.sidecarFileName.endsWith(".tif.vat.dbf")) throw new Error(`${year} sidecar file name is not a raster attribute table.`);
    requireNumber(defect.observedByteLength, EXPECTED_EMPTY_VAT_BYTES, `${year} observed sidecar byte length`);
    requireNumber(defect.observedRecordCount, 0, `${year} observed record count`);
    requireNumber(defect.expectedRecordCount, EXPECTED_POPULATED_VAT_RECORDS, `${year} expected record count`);
    requireNumber(defect.controlByteLength, EXPECTED_POPULATED_VAT_BYTES, `${year} control byte length`);
    requireNumber(defect.controlRecordCount, EXPECTED_POPULATED_VAT_RECORDS, `${year} control record count`);
    if (!Array.isArray(defect.controlYears) || defect.controlYears.length === 0) {
      throw new Error(`${year} must record the control years it was compared against.`);
    }
    for (const control of defect.controlYears) {
      if (!Number.isInteger(control)) throw new Error(`${year} control year ${control} is not a year.`);
      if (EXPECTED_DEFECTIVE_YEARS.includes(control)) throw new Error(`${year} cannot use another defective year as a control.`);
      if (grid && !grid.years.includes(control)) throw new Error(`${year} control year ${control} is outside the staged series.`);
    }
    if (!Array.isArray(defect.confirmedBy) || defect.confirmedBy.length < 2) {
      throw new Error(`${year} must record how the empty sidecar was confirmed.`);
    }
    if (defect.fieldDefinitionsPresent !== true) throw new Error(`${year} sidecar carries its field definitions; the record must say so.`);
    if (defect.severity !== "metadata-only") throw new Error(`${year} severity changed.`);
    if (defect.pixelsVerifiedSound !== true) throw new Error(`${year} pixels were verified sound; the record must say so.`);
    required(defect.pixelEvidence, `${year} pixel evidence`);
    requireBilingual(defect.statement, `${year} statement`);
    if (!/Unknown, never 0/.test(defect.statement.en)) {
      throw new Error(`${year} must state that a sidecar-derived class statistic is Unknown, never 0.`);
    }
    if (!/inconnue?, jamais 0/i.test(defect.statement.fr)) {
      throw new Error(`${year} French statement must carry the same never-zero rule.`);
    }
    if (grid && !grid.years.includes(defect.year)) throw new Error(`Defective year ${defect.year} is outside the staged series.`);
  });

  if (!Array.isArray(record.limitations) || record.limitations.length === 0) throw new Error("Defect limitations are required.");
  if (!/Unknown/.test(record.limitations.join("\n"))) throw new Error("The unresolved full-resolution distribution must be recorded as Unknown.");
  if (record.productionEligible !== false) throw new Error("A validation record cannot grant production eligibility.");
  return record;
}

export async function checkRasterGrid(
  gridFile = new URL("../data/raster-grid.json", import.meta.url),
  defectsFile = new URL("../data/raster-defects.json", import.meta.url),
) {
  const grid = validateRasterGrid(JSON.parse(await readFile(gridFile, "utf8")));
  const defects = validateRasterDefects(JSON.parse(await readFile(defectsFile, "utf8")), grid);
  return { grid, defects };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { grid, defects } = await checkRasterGrid();
  console.log(
    `Raster grid passed for ${grid.years.length} years on one ${grid.grid.width} x ${grid.grid.height} grid, ` +
      `${grid.classScheme.classCount} classes, ${defects.defects.length} years recorded as VAT-defective.`,
  );
}
