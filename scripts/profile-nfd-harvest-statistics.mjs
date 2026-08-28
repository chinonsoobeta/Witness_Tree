import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  END_YEAR,
  START_YEAR,
  TARGET_PROVINCES,
  aggregateNfdRows,
  parseNfdCsv,
} from "../lib/phase2/nfd-harvest-statistics.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_DATA_ROOT = resolve(repoRoot, "../../Witness_Tree-data");
const SNAPSHOT = "2026-08-27";
const RAW_RELATIVE_DIRECTORY = `raw/nfd-harvest-statistics/${SNAPSHOT}`;
const FILES = Object.freeze([
  {
    id: "nfd-area-harvested-csv",
    role: "official-bilingual-data",
    fileName: "nfd-area-harvested-en-fr.csv",
    mediaType: "text/csv",
  },
  {
    id: "nfd-area-harvested-data-dictionary",
    role: "official-data-dictionary",
    fileName: "nfd-area-harvested-data-dictionary-en-fr.xlsx",
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    id: "nfd-terms",
    role: "official-terms-and-conditions",
    fileName: "nfd-terms.html",
    mediaType: "text/html",
  },
]);

function dataRootFromEnvironment(dataRoot = process.env.WITNESS_TREE_DATA_ROOT ?? DEFAULT_DATA_ROOT) {
  if (!isAbsolute(dataRoot)) throw new Error("NFD data root must be an absolute path.");
  return resolve(dataRoot);
}
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fileBinding(dataRoot, file) {
  const relativePath = `${RAW_RELATIVE_DIRECTORY}/${file.fileName}`;
  const path = resolve(dataRoot, relativePath);
  const prefix = `${resolve(dataRoot)}/`;
  if (!path.startsWith(prefix) || relative(dataRoot, path).startsWith("..")) {
    throw new Error(`NFD raw path escapes the approved data root: ${file.fileName}`);
  }
  const bytes = readFileSync(path);
  return {
    id: file.id,
    role: file.role,
    fileName: file.fileName,
    relativePath,
    mediaType: file.mediaType,
    byteLength: statSync(path).size,
    sha256: sha256(bytes),
  };
}

export function canonicalFrameDigest(rows) {
  return sha256(Buffer.from(JSON.stringify(rows), "utf8"));
}

export function buildNfdProfile(dataRoot = dataRootFromEnvironment()) {
  const bindings = FILES.map((file) => fileBinding(dataRoot, file));
  const csvBinding = bindings.find((file) => file.id === "nfd-area-harvested-csv");
  const csvPath = resolve(dataRoot, csvBinding.relativePath);
  const csvText = readFileSync(csvPath, "utf8");
  const parsedRows = parseNfdCsv(csvText);
  const frameRows = aggregateNfdRows(parsedRows);

  return {
    schemaVersion: "witness-tree/nonproduction-nfd-harvest-statistics-profile/1",
    status: "nonproduction-profiled-transform",
    sourceId: "nfd-area-harvested-en-fr",
    profiledAt: SNAPSHOT,
    source: {
      publisher: "National Forestry Database / Canadian Council of Forest Ministers",
      datasetTitle: "Area harvested by jurisdiction, tenure, management and harvesting method",
      dataUrl: "https://cfs.cloud.nrcan.gc.ca/statsprofile/management/harvesting.html",
      termsUrl: "https://nfdp.ccfm.org/en/terms.php",
      licence: "Open Government Licence – Canada version 2.0",
    },
    raw: {
      dataRoot: "Witness_Tree-data",
      snapshot: SNAPSHOT,
      files: bindings,
      csvRowCount: parsedRows.length,
      csvColumnCount: 15,
      dictionary: {
        qualifierCodes: ["U", "a", "u", "E", "e", "n", "p", "s", "r"],
        qualifierDefinitionsBoundToDictionary: true,
      },
    },
    method: {
      unit: "hectares",
      groupBy: ["ISO", "Year"],
      aggregation: "sum nonblank Area (hectares) cells across tenure, management, and harvesting method rows",
      knownArea: "Known numeric cells are retained exactly; decimal addition is performed with integer coefficients, not binary floating-point accumulation.",
      missingness: "n is not applicable and is excluded from the sum; blank u/U/s/r cells remain explicit unknown area and prevent a complete total; no blank is converted to zero.",
      yearSemantics: "The publisher year label is carried verbatim; calendar-versus-fiscal interpretation is not asserted by this profile.",
      bilingualValidation: "English/French paired fields must agree with the controlled mappings in the bound dictionary and source CSV.",
      duplicatePolicy: "A duplicate Year × ISO × Tenure × Management × Harvesting method key fails closed.",
      unknownQualifierPolicy: "Any qualifier outside the bound dictionary codes fails closed.",
    },
    frame: {
      provinces: [...TARGET_PROVINCES],
      startYear: START_YEAR,
      endYear: END_YEAR,
      expectedRowCount: 156,
      rows: frameRows,
      digest: {
        algorithm: "sha256",
        canonicalization: "UTF-8 JSON.stringify(frame.rows)",
        value: canonicalFrameDigest(frameRows),
      },
    },
    comparison: {
      quantity: "reported area of forest land harvested",
      likeForLikeClaim: false,
      causalAttributionClaim: false,
      statement: "This NFD harvest-statistics frame is a separate reported-statistics reference and is not like-for-like with Version 2.1 observed loss; it does not establish wildfire attribution or product accuracy.",
    },
    limitations: [
      "The profile preserves source qualifiers and does not impute unavailable cells.",
      "Partial rows expose knownAreaHectares as a lower-bound-like known sum; areaHectares remains null when any non-not-applicable area is unknown.",
      "The aggregate covers only BC, AB, ON, and QC for 1984–2022, even though the source CSV contains other jurisdictions and years.",
      "No calendar/fiscal-year interpretation, causality, like-for-like agreement, accuracy result, release, or production eligibility is asserted.",
    ],
    localProfileTransform: true,
    immutableArchive: false,
    ingestionAdmitted: false,
    released: false,
    productionEligible: false,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const profile = buildNfdProfile();
  process.stdout.write(`${JSON.stringify(profile, null, 2)}\n`);
}
