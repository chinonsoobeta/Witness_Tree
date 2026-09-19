// Builds and publishes the 1984-2022 province span bulk download: every span
// for BC, AB, ON and QC, as a CSV and a JSON file, plus a manifest.
//
// Owner approval: item C of data/phase2-1984-2022-admission-record-2026-09-18.json
// ("admit and release"), whose permitted claims allow the admitted items to be
// published "in a bulk download, with the limits above shown next to them". The
// limits travel inside the manifest, the JSON file and the README line of the CSV
// record, word for word from the admission.
//
// Every figure is read through lib/explore/province-spans.ts, the reader the
// Explore page uses, so a number in the download and the same span on the page
// cannot disagree. Nothing is recomputed.
//
//   tsx scripts/publish-province-span-downloads.mts --build-only   writes the bytes and stops
//   tsx scripts/publish-province-span-downloads.mts                also uploads, reads back, records
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { intervalAtWindowIndex, EXPLORE_INTERVAL_COUNT } from "../lib/explore/interval";
import { provinceSpanMeasurements, PROVINCE_SPANS } from "../lib/explore/province-spans";

const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const PRODUCT_ID = "phase3-province-span-downloads-v1";
const BUCKET = "witness-tree-public-delivery-ca-central-1";
const DISTRIBUTION = "https://d3g1406o0uekin.cloudfront.net";
const ADMISSION = "data/phase2-1984-2022-admission-record-2026-09-18.json";
const RELEASE_SOURCE = "data/phase3-province-span-release.json";
const RECORD = "data/phase3-province-span-downloads-release.json";
const READBACK = "data/phase3-province-span-downloads-release-readback.json";
const CSV_NAME = "province-spans-1984-2022.csv";
const JSON_NAME = "province-spans-1984-2022.json";

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const admissionBytes = fs.readFileSync(ADMISSION);
const admission = JSON.parse(admissionBytes.toString("utf8"));
const sourceBytes = fs.readFileSync(RELEASE_SOURCE);
if (admission.ownerDecision.decision !== "approve-admission-and-release" || !admission.ownerDecision.items.includes("C")) {
  throw new Error("the admission does not release item C");
}

// Cells are exact integers; hectares are cells x 0.09, written from the integer
// so the decimal is exact rather than a float product.
const hectares = (value: number | null) => (value === null ? "" : (Math.round(value / 0.09) * 9 / 100).toFixed(2));
const percent = (value: number | null) => (value === null ? "" : value.toFixed(6));
const cells = (value: number | null) => (value === null ? "" : String(Math.round(value / 0.09)));

const COLUMNS = [
  "province_id", "province_code", "province_name_en", "province_name_fr",
  "from_year", "to_year",
  "known_forest_at_start_hectares", "known_forest_at_start_cells",
  "lost_at_least_once_hectares", "lost_at_least_once_cells", "lost_at_least_once_percent_of_known",
  "yearly_losses_added_hectares", "yearly_losses_added_cells",
  "unknown_at_start_hectares", "unknown_at_start_cells", "unknown_share_of_province_percent",
] as const;
const escape = (text: string) => (/[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text);

const rows: string[][] = [];
const records: unknown[] = [];
for (let index = 0; index < EXPLORE_INTERVAL_COUNT; index += 1) {
  const span = intervalAtWindowIndex(index);
  if (!span) throw new Error(`span ${index} has no years`);
  const measured = provinceSpanMeasurements(span);
  if (measured.length !== 4) throw new Error(`${span.fromYear}-${span.toYear} lacks a province`);
  for (const row of measured) {
    const line = [
      row.id, row.code, row.name.en, row.name.fr,
      String(row.fromYear), String(row.toYear),
      hectares(row.knownForestedHectares), cells(row.knownForestedHectares),
      hectares(row.unionLossHectares), cells(row.unionLossHectares), percent(row.unionLossPercent),
      hectares(row.summedLossHectares), cells(row.summedLossHectares),
      hectares(row.unknownHectares), cells(row.unknownHectares), row.unknownSharePercent.toFixed(6),
    ];
    rows.push(line);
    records.push(Object.fromEntries(COLUMNS.map((column, i) => [column, line[i] === "" ? null : column.startsWith("province_") ? line[i] : Number(line[i])])));
  }
}
const csv = Buffer.from(`${[COLUMNS.join(","), ...rows.map((line) => line.map(escape).join(","))].join("\r\n")}\r\n`, "utf8");

const attributions = [
  "Contains information licensed under the Open Government Licence - Canada. Adapted from Natural Resources Canada, Annual High-resolution forest land cover for Canada (1984-2022). This does not constitute an endorsement by Natural Resources Canada.",
  "Adapted from Statistics Canada, 2021 Census Province/Territory Cartographic Boundary File, reference date January 1, 2021. This does not constitute an endorsement by Statistics Canada of this product.",
];
const terms = {
  lost_at_least_once: "Forest lost at least once: each place counted once over the span, against the forest known in the start year.",
  yearly_losses_added: "Yearly losses added together: hectares only. A place lost twice counts twice, so this carries no percentage.",
  unknown_at_start: "Unmapped or nodata in the start year. Kept as Unknown and never counted as no loss.",
  four_provinces: "The four-province figure is the sum of the four provinces, exact because the provinces are disjoint by the same cell-centre rule. It is not a national figure.",
};
const json = Buffer.from(`${JSON.stringify({
  schema: "witness-tree/province-span-download/1",
  firstYear: 1984,
  lastYear: 2022,
  spanCount: EXPLORE_INTERVAL_COUNT,
  cellHectares: 0.09,
  columns: COLUMNS,
  terms,
  limits: admission.limits,
  prohibitedClaims: admission.prohibitedClaims,
  attributions,
  rows: records,
})}\n`, "utf8");

if (rows.length !== EXPLORE_INTERVAL_COUNT * PROVINCE_SPANS.length) throw new Error(`${rows.length} rows`);

const artifacts = [
  { name: CSV_NAME, bytes: csv, contentType: "text/csv; charset=utf-8" },
  { name: JSON_NAME, bytes: json, contentType: "application/json; charset=utf-8" },
].map((artifact) => ({ ...artifact, sha256: sha256(artifact.bytes), md5: createHash("md5").update(artifact.bytes).digest("hex") }));

// The release id is the checksum of the two data files together, so the URL
// names the exact bytes it serves and a rebuild of the same inputs lands on it.
const releaseId = sha256(artifacts.map((artifact) => `${artifact.sha256}  ${artifact.name}\n`).join(""));
const manifest = Buffer.from(`${JSON.stringify({
  schema: "witness-tree/province-span-download-manifest/1",
  productId: PRODUCT_ID,
  releaseId,
  releaseIdMeaning: "SHA-256 of the sha256sum lines of the CSV and JSON files, in that order",
  scope: { provinceIds: ["59", "48", "35", "24"], firstYear: 1984, lastYear: 2022, spanCount: EXPLORE_INTERVAL_COUNT, rowCount: rows.length },
  files: artifacts.map(({ name, bytes, sha256: digest, contentType }) => ({ name, byteLength: bytes.length, sha256: digest, contentType })),
  source: { path: RELEASE_SOURCE, sha256: sha256(sourceBytes) },
  admission: { path: ADMISSION, sha256: sha256(admissionBytes), item: "C-province-span-aggregate", decisionId: admission.ownerDecision.decisionId },
  licence: "Open Government Licence - Canada 2.0; Statistics Canada Open Licence",
  attributions,
  terms,
  limits: admission.limits,
  prohibitedClaims: admission.prohibitedClaims,
  claims: { admitted: true, released: true, expertReviewed: false, complete: false, formalGatesChanged: false },
}, null, 2)}\n`, "utf8");

const localDir = path.join(DATA_ROOT, "derived", PRODUCT_ID, releaseId);
fs.mkdirSync(localDir, { recursive: true });
const files = [...artifacts, { name: "manifest.json", bytes: manifest, contentType: "application/json; charset=utf-8", sha256: sha256(manifest), md5: createHash("md5").update(manifest).digest("hex") }];
for (const file of files) {
  const target = path.join(localDir, file.name);
  if (fs.existsSync(target)) {
    if (sha256(fs.readFileSync(target)) !== file.sha256) throw new Error(`${target} exists with different bytes`);
  } else {
    fs.writeFileSync(target, file.bytes, { flag: "wx" });
  }
}
process.stdout.write(`Built ${rows.length} rows in ${localDir}\n${files.map((file) => `${file.sha256}  ${file.name}  ${file.bytes.length}`).join("\n")}\n`);
if (process.argv.includes("--build-only")) process.exit(0);

const prefix = `releases/${PRODUCT_ID}/${releaseId}`;
const aws = (args: string[]) => execFileSync("aws", args, { encoding: "utf8" });
for (const file of files) {
  // --no-overwrite sends If-None-Match, which the bucket requires for release writes.
  aws(["s3", "cp", path.join(localDir, file.name), `s3://${BUCKET}/${prefix}/${file.name}`, "--no-overwrite", "--only-show-errors", "--content-type", file.contentType]);
}
const s3 = [];
for (const file of files) {
  const head = JSON.parse(aws(["s3api", "head-object", "--bucket", BUCKET, "--key", `${prefix}/${file.name}`, "--output", "json"]));
  if (head.ContentLength !== file.bytes.length || String(head.ETag).replaceAll('"', "") !== file.md5) {
    throw new Error(`${file.name}: S3 does not hold the local bytes`);
  }
  s3.push({ name: file.name, byteLength: head.ContentLength, md5ETagMatches: true, contentType: head.ContentType });
}
const cloudFront = [];
for (const file of files) {
  const response = await fetch(`${DISTRIBUTION}/${prefix}/${file.name}`, { cache: "no-store", headers: { "accept-encoding": "identity" } });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok || sha256(bytes) !== file.sha256) throw new Error(`${file.name}: CloudFront answered ${response.status} with other bytes`);
  cloudFront.push({ name: file.name, status: response.status, byteLength: bytes.length, sha256: sha256(bytes) });
}

const recordedAt = new Date().toISOString();
fs.writeFileSync(RECORD, `${JSON.stringify({
  schemaVersion: "witness-tree/province-span-download-release/1",
  productId: PRODUCT_ID,
  releaseId,
  base: `${DISTRIBUTION}/${prefix}`,
  manifest: { url: `${DISTRIBUTION}/${prefix}/manifest.json`, sha256: sha256(manifest), byteLength: manifest.length },
  files: artifacts.map(({ name, bytes, sha256: digest, contentType }) => ({ name, url: `${DISTRIBUTION}/${prefix}/${name}`, byteLength: bytes.length, sha256: digest, contentType })),
  rowCount: rows.length,
  source: { path: RELEASE_SOURCE, sha256: sha256(sourceBytes) },
  admission: { path: ADMISSION, sha256: sha256(admissionBytes), item: "C-province-span-aggregate", permittedClaimUsed: admission.permittedClaims[1] },
  claims: {
    admitted: true,
    released: true,
    releasedMeaning: "Uploaded create-once to the release prefix and read back byte for byte from S3 and CloudFront. The Data page links it once the owner deploys the commit that carries this record.",
    expertReviewed: false,
    complete: false,
    formalGatesChanged: false,
  },
  recordedAt,
}, null, 2)}\n`, { flag: "wx" });
fs.writeFileSync(READBACK, `${JSON.stringify({
  schemaVersion: "witness-tree/province-span-download-readback/1",
  releaseId,
  recordedAt,
  s3ExactReadback: { method: "head-object length and single-part MD5 ETag against the local bytes", files: s3 },
  cloudFrontExactReadback: { method: "every file fetched without caching and hashed with SHA-256", files: cloudFront },
}, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`Published ${files.length} files at ${DISTRIBUTION}/${prefix}\n`);
