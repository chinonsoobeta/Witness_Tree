// Publishes the span archive built by build-phase2-per-cell-span-tiles.sh: one
// PMTiles archive holding all 38 four-province annual intervals in one layer,
// each patch tagged with the year it was lost, so the Explore map can show any
// span from 1984 to 2022 by filter.
//
//   node scripts/publish-phase2-per-cell-span-archive.mjs
//
// Writes the archive's own admission record (the owner approved the span
// archive on 2026-09-19, before it was built), uploads it create-once to its
// release prefix, reads it back exactly from S3 and CloudFront, and writes the
// release record and readback. The archive is too large to hold in memory, so
// every digest is taken from a stream; nothing is copied off the data root.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const OUT = path.join(DATA_ROOT, "derived", "phase2-per-cell-span-archive-four-province-v1");
const ARCHIVE = path.join(OUT, "spans.pmtiles");
const STORE = path.join(DATA_ROOT, "derived", "phase2-per-cell-geometry-1984-2022-four-province-v1");
const SPAN_WORK = path.join(DATA_ROOT, "work", "per-cell-four-province-span-geojson");
const RELEASE = "phase2-per-cell-span-archive-four-province-v1";
const BUCKET = "witness-tree-public-delivery-ca-central-1";
const DISTRIBUTION = "https://d3g1406o0uekin.cloudfront.net";
const RECORD = "data/phase2-per-cell-span-archive-release.json";
const READBACK = "data/phase2-per-cell-span-archive-readback.json";
const ADMISSION = "data/phase2-per-cell-span-archive-admission-record-2026-09-19.json";
const PARENT = "data/phase2-1984-2022-admission-record-2026-09-18.json";
const ANNUAL = "data/phase2-per-cell-four-province-tile-release.json";

const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const aws = (args) => execFileSync("aws", args, { encoding: "utf8", maxBuffer: 1 << 26 });

/** SHA-256 of the whole file and, when partBytes is given, S3's composite over parts of that size. */
async function streamDigests(file, partBytes) {
  const whole = createHash("sha256");
  const partDigests = [];
  let part = partBytes ? createHash("sha256") : null;
  let inPart = 0;
  let length = 0;
  for await (const chunk of fs.createReadStream(file, { highWaterMark: 8 << 20 })) {
    whole.update(chunk);
    length += chunk.length;
    if (!part) continue;
    let offset = 0;
    while (offset < chunk.length) {
      const take = Math.min(partBytes - inPart, chunk.length - offset);
      part.update(chunk.subarray(offset, offset + take));
      inPart += take;
      offset += take;
      if (inPart === partBytes) {
        partDigests.push(part.digest());
        part = createHash("sha256");
        inPart = 0;
      }
    }
  }
  if (part && inPart > 0) partDigests.push(part.digest());
  const composite = partBytes
    ? `${createHash("sha256").update(Buffer.concat(partDigests)).digest("base64")}-${partDigests.length}`
    : null;
  return { byteLength: length, sha256: whole.digest("hex"), composite };
}

const header = fs.readFileSync(path.join(OUT, "spans.header.txt"), "utf8");
const zoom = (name) => Number(new RegExp(`${name}[^\\d]*(\\d+)`, "i").exec(header)?.[1]);
const minZoom = zoom("min zoom");
const maxZoom = zoom("max zoom");
if (!(minZoom === 8 && maxZoom >= 14)) throw new Error(`unexpected zoom range ${minZoom}-${maxZoom}`);

const manifest = JSON.parse(fs.readFileSync(path.join(STORE, "manifest.json"), "utf8"));
const annual = JSON.parse(fs.readFileSync(ANNUAL, "utf8"));
if (annual.intervals.length !== 38) throw new Error("the annual four-province release is not complete");

// Every interval was emitted in full: the emitter's own count per interval
// must equal the clipped store's patch and cell counts.
const emitted = manifest.intervals.map((entry) => {
  const line = fs.readFileSync(path.join(SPAN_WORK, `${entry.interval}.geojsonl.done`), "utf8");
  const match = /^(\d{4}-\d{4})\s+([\d,]+) features\s+([\d,]+) cells/.exec(line.trim());
  const features = Number(match?.[2].replaceAll(",", ""));
  const cells = Number(match?.[3].replaceAll(",", ""));
  if (match?.[1] !== entry.interval || features !== entry.patchCount || cells !== entry.cellCount) {
    throw new Error(`${entry.interval}: emitted ${line.trim()} against ${entry.patchCount} patches, ${entry.cellCount} cells`);
  }
  return { interval: entry.interval, year: Number(entry.interval.slice(5)), patchCount: features, cellCount: cells };
});

const local = await streamDigests(ARCHIVE, null);
const releaseId = local.sha256;
const key = `releases/${RELEASE}/${releaseId}/spans.pmtiles`;
const url = `${DISTRIBUTION}/${key}`;
process.stderr.write(`release ${releaseId} (${local.byteLength} bytes, z${minZoom}-${maxZoom})\n`);

if (!fs.existsSync(ADMISSION)) {
  const parent = JSON.parse(fs.readFileSync(PARENT, "utf8"));
  fs.writeFileSync(ADMISSION, `${JSON.stringify({
    schemaVersion: "witness-tree/phase2-per-cell-span-archive-admission/1",
    status: "admitted-and-released-under-prior-owner-authorization",
    ownerDecision: {
      decidedOn: "2026-09-19",
      ownerWords: "I approve the span-ready archive.",
      recordedFrom: "the owner's message in the Claude Code session of 2026-09-19, answering the report that P0-C had not been started because it was not approved",
      standingAuthorization: "The owner's standing authorization covers ingestion, release, upload and deployment steps; it does not make a formal evidence gate pass.",
      scope: "The approval is the owner decision the preview audit plan asked for: the 2026-08-29 amendment scoped the per-cell product to 38 annual intervals, and this archive serves those same 38 intervals in one layer so the map can show any span of them.",
      timing: "The owner approved the archive before it was built. The owner has not seen these bytes, their digest or this record; nothing here is a review of them by the owner or anyone else.",
      parentRecord: { path: PARENT, sha256: sha(PARENT) },
    },
    admittedProduct: {
      productId: RELEASE,
      what: "One PMTiles archive, layer `spans`, holding every patch of the 38 four-province annual intervals, each with a `year` property naming the closing year of its interval. A span from A to B is every patch with A < year <= B.",
      design: "The plan described a 38-bit loss-year mask per patch. This archive keeps the admitted annual patches as they are and tags each with its year instead, which gives the same filter-not-source behaviour and the same drawn union at the maximum zoom without tracing new geometry. A place lost in two years is drawn twice.",
    },
    engineeringChecks: {
      emittedIntervals: emitted,
      patchCount: emitted.reduce((sum, entry) => sum + entry.patchCount, 0),
      cellCount: emitted.reduce((sum, entry) => sum + entry.cellCount, 0),
      clippedStoreMatchesAnchor: manifest.clip.allIntervalsMatchAnchor,
      zoomRange: { minZoom, maxZoom, extendedBeyond14: maxZoom > 14 },
    },
    bound: {
      archive: { fileName: "spans.pmtiles", byteLength: local.byteLength, sha256: local.sha256 },
      storeManifestSha256: sha(path.join(STORE, "manifest.json")),
      annualRelease: { path: ANNUAL, sha256: sha(ANNUAL), releaseId: annual.releaseId },
    },
    limits: parent.limits,
    prohibitedClaims: parent.prohibitedClaims,
    formalGates: { phase2FormalExit: parent.formalGates.phase2FormalExit, phase8LaunchReadiness: parent.formalGates.phase8LaunchReadiness, honestConclusion: parent.formalGates.honestConclusion },
    claims: { admitted: true, releaseApproved: true, ownerReviewedTheseBytes: false, expertReviewed: false, complete: false, countable: false, productionEligible: false, formalGatesChanged: false },
  }, null, 2)}\n`, { flag: "wx" });
}
const admitted = JSON.parse(fs.readFileSync(ADMISSION, "utf8"));
if (admitted.bound.archive.sha256 !== local.sha256) throw new Error(`${ADMISSION} binds other bytes`);

// Create-once upload. --no-overwrite sends If-None-Match, which the bucket
// requires for release writes; an object already there is proven below.
const present = JSON.parse(aws(["s3api", "list-objects-v2", "--bucket", BUCKET, "--prefix", key, "--output", "json"])).Contents ?? [];
if (present.length === 0) {
  aws(["s3", "cp", ARCHIVE, `s3://${BUCKET}/${key}`, "--no-overwrite", "--content-type", "application/octet-stream", "--checksum-algorithm", "SHA256", "--only-show-errors"]);
}

// S3 readback through head-object, because this account's policy does not
// grant s3:GetObjectAttributes. Every part but the last carries the uploader's
// chunk size, so the length and the part count at the end of the stored
// checksum give the size to cut the local file at; a wrong cut would fail the
// comparison rather than pass it.
const head = JSON.parse(aws(["s3api", "head-object", "--bucket", BUCKET, "--key", key, "--checksum-mode", "ENABLED", "--output", "json"]));
if (head.ContentLength !== local.byteLength) throw new Error(`S3 holds ${head.ContentLength} bytes`);
const stored = head.ChecksumSHA256;
const partCount = Number(stored?.split("-")[1] ?? "1");
let partBytes = null;
if (partCount > 1) {
  for (let chunk = 8 << 20; chunk <= (8 << 20) * 1024; chunk *= 2) {
    if (Math.ceil(local.byteLength / chunk) === partCount) { partBytes = chunk; break; }
  }
  if (partBytes === null) throw new Error(`no chunk size cuts ${local.byteLength} bytes into ${partCount} parts`);
}
const expected = partBytes ? (await streamDigests(ARCHIVE, partBytes)).composite : Buffer.from(local.sha256, "hex").toString("base64");
if (!stored || stored !== expected) throw new Error(`S3 SHA-256 ${stored} does not match the local bytes (${expected})`);

// CloudFront readback: the whole archive, hashed in memory as it streams.
const response = await fetch(url, { cache: "no-store", headers: { "accept-encoding": "identity" } });
if (!response.ok) throw new Error(`CloudFront answered HTTP ${response.status}`);
const hash = createHash("sha256");
let fetched = 0;
for await (const chunk of response.body) {
  hash.update(chunk);
  fetched += chunk.length;
}
const cloudFrontSha = hash.digest("hex");
if (fetched !== local.byteLength || cloudFrontSha !== local.sha256) throw new Error("CloudFront bytes differ");

const recordedAt = new Date().toISOString();
fs.writeFileSync(RECORD, `${JSON.stringify({
  schemaVersion: "witness-tree/phase2-per-cell-span-archive-release/1",
  releaseId,
  releaseIdMeaning: "SHA-256 of the archive",
  productId: RELEASE,
  url,
  sourceLayer: "spans",
  yearProperty: "year",
  firstYear: 1985,
  lastYear: 2022,
  byteLength: local.byteLength,
  sha256: local.sha256,
  minZoom,
  maxZoom,
  generalizedBelowZoom: 14,
  countable: false,
  expertReviewed: false,
  productionEligible: false,
  admission: { path: ADMISSION, sha256: sha(ADMISSION) },
  annualRelease: { path: ANNUAL, releaseId: annual.releaseId },
  readback: READBACK,
  recordedAt,
}, null, 2)}\n`, { flag: "wx" });
fs.writeFileSync(READBACK, `${JSON.stringify({
  schemaVersion: "witness-tree/phase2-per-cell-span-archive-readback/1",
  releaseId,
  recordedAt,
  s3ExactReadback: { method: "head-object length and S3's stored SHA-256 (per-part composite for multipart objects) against the same digest of the local bytes, cut at the part boundaries the length and part count give", byteLength: head.ContentLength, s3ChecksumSha256: stored, parts: partCount },
  cloudFrontExactReadback: { method: "the archive fetched whole without caching and hashed with SHA-256 as it streamed", byteLength: fetched, sha256: cloudFrontSha },
}, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`Released the span archive at ${url}\n`);
