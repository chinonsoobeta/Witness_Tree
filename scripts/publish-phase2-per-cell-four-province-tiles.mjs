// Publishes the four-province per-cell archives: the national per-cell patches
// cut at the BC, AB, ON and QC boundary, one PMTiles archive per interval.
//
//   node scripts/publish-phase2-per-cell-four-province-tiles.mjs stage
//     uploads every finished archive not yet staged. Safe to run while the tiler
//     is still working: an archive counts as finished only once the runner has
//     logged it, because pmtiles writes its output in place.
//   node scripts/publish-phase2-per-cell-four-province-tiles.mjs release
//     once all 38 exist: binds them, copies them create-once from staging to the
//     release prefix, reads every object back exactly from S3 and CloudFront, and
//     writes the release record and its readback.
//
// The clipped archives are new bytes. They are not the archives item E of
// data/phase2-1984-2022-admission-record-2026-09-18.json admitted, so this does
// not claim E's admission; data/phase2-per-cell-four-province-admission-record-2026-09-19.json
// is their own record.
//
// Nothing is copied off the data root: uploads stream from the drive and every
// readback is hashed in memory.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const STORE = path.join(DATA_ROOT, "derived", "phase2-per-cell-geometry-1984-2022-four-province-v1");
const TILES = path.join(STORE, "tiles");
const TILE_LOG = process.env.FOUR_PROVINCE_TILE_LOG;
const RELEASE = "phase2-per-cell-geometry-four-province-v1";
const BUCKET = "witness-tree-public-delivery-ca-central-1";
const DISTRIBUTION = "https://d3g1406o0uekin.cloudfront.net";
const STAGING = `staging/${RELEASE}/tiles`;
const RECORD = "data/phase2-per-cell-four-province-tile-release.json";
const READBACK = "data/phase2-per-cell-four-province-tile-readback.json";
const ADMISSION = "data/phase2-per-cell-four-province-admission-record-2026-09-19.json";
const CONCURRENCY = 8;

const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const aws = (args) => execFileSync("aws", args, { encoding: "utf8", maxBuffer: 1 << 28 });
const manifest = JSON.parse(fs.readFileSync(path.join(STORE, "manifest.json"), "utf8"));
const attribution = JSON.parse(fs.readFileSync(path.join(STORE, "attribution-manifest.json"), "utf8"));
if (manifest.clip?.allIntervalsMatchAnchor !== true) throw new Error("the clipped store does not reconcile with the span aggregate");
if (manifest.intervals.length !== 38) throw new Error(`${manifest.intervals.length} intervals in the clipped store`);

function digests(file) {
  const bytes = fs.readFileSync(file);
  return { byteLength: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function finished() {
  if (!TILE_LOG) throw new Error("FOUR_PROVINCE_TILE_LOG must name the runner's log");
  // Only a completion line with a size counts: "<interval>  <size>  <secs>s".
  const logged = new Set(fs.readFileSync(TILE_LOG, "utf8").split("\n").map((line) => /^(\d{4}-\d{4})\s+\S+\s+\d+s$/.exec(line.trim())?.[1]).filter(Boolean));
  return manifest.intervals.map((entry) => entry.interval).filter((interval) => logged.has(interval) && fs.existsSync(path.join(TILES, `${interval}.pmtiles`)));
}

function listing(prefix) {
  const found = new Map();
  let token;
  do {
    const page = JSON.parse(aws(["s3api", "list-objects-v2", "--bucket", BUCKET, "--prefix", `${prefix}/`, "--output", "json", ...(token ? ["--continuation-token", token] : [])]));
    for (const object of page.Contents ?? []) found.set(object.Key.slice(prefix.length + 1), object.Size);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return found;
}

const mode = process.argv[2];
if (mode === "stage") {
  const staged = listing(STAGING);
  for (const interval of finished()) {
    const name = `${interval}.pmtiles`;
    const size = fs.statSync(path.join(TILES, name)).size;
    if (staged.get(name) === size) continue;
    aws(["s3", "cp", path.join(TILES, name), `s3://${BUCKET}/${STAGING}/${name}`, "--content-type", "application/octet-stream", "--checksum-algorithm", "SHA256", "--only-show-errors"]);
    process.stdout.write(`staged ${name}\n`);
  }
  process.exit(0);
}
if (mode !== "release") throw new Error("usage: stage | release");

// 1. Every archive exists and is bound.
const ready = finished();
if (ready.length !== 38) throw new Error(`${ready.length} of 38 archives are finished`);
const byInterval = new Map(attribution.intervals.map((entry) => [entry.interval, entry]));
const intervals = manifest.intervals.map((entry) => {
  const fileName = `${entry.interval}.pmtiles`;
  const counts = byInterval.get(entry.interval);
  if (!counts || counts.patchCount !== entry.patchCount) throw new Error(`${entry.interval}: attribution does not match the clipped store`);
  // A cell is attributed to harvest or to fire, never both, so the two counts
  // and the unattributed rest partition the interval's cells.
  if (counts.harvestCells + counts.fireCells > entry.cellCount) throw new Error(`${entry.interval}: more attributed cells than loss cells`);
  return {
    interval: entry.interval,
    fileName,
    ...digests(path.join(TILES, fileName)),
    patchCount: entry.patchCount,
    cellCount: entry.cellCount,
    harvestCells: counts.harvestCells,
    fireCells: counts.fireCells,
    patchesWithBothCauses: counts.patchesWithBoth,
    disturbanceYearsMissing: counts.disturbanceYearsMissing,
  };
});
const releaseId = createHash("sha256").update(intervals.map((entry) => `${entry.interval}:${entry.sha256}`).join("\n")).digest("hex");
const prefix = `releases/${RELEASE}/${releaseId}/tiles`;
const base = `${DISTRIBUTION}/${prefix}`;
process.stderr.write(`release ${releaseId}\n`);

// The clipped archives' own admission record, written once the bytes it binds
// exist. The owner's approval came first, on 2026-09-18, before any of these
// bytes did; the record says so rather than presenting it as a review of them.
if (!fs.existsSync(ADMISSION)) {
  fs.writeFileSync(ADMISSION, `${JSON.stringify(admissionRecord(releaseId, intervals), null, 2)}\n`, { flag: "wx" });
}
const admitted = JSON.parse(fs.readFileSync(ADMISSION, "utf8"));
if (admitted.bound.releaseId !== releaseId) throw new Error(`${ADMISSION} binds release ${admitted.bound.releaseId}, not ${releaseId}`);

// 2. Create-once promotion. The staged object must already be the local bytes;
// a release object already present is left alone and proven in step 3.
const staged = listing(STAGING);
const released = listing(prefix);
for (const entry of intervals) {
  if (released.has(entry.fileName)) continue;
  if (staged.get(entry.fileName) !== entry.byteLength) throw new Error(`${entry.fileName} is not staged at its local size`);
  aws(["s3", "cp", `s3://${BUCKET}/${STAGING}/${entry.fileName}`, `s3://${BUCKET}/${prefix}/${entry.fileName}`, "--no-overwrite", "--content-type", "application/octet-stream", "--checksum-algorithm", "SHA256", "--only-show-errors"]);
}

// 3. S3 readback: length, and S3's own SHA-256 against the same digest of the
// local bytes cut at the same part boundaries.
//
// head-object rather than get-object-attributes, because this account's policy
// does not grant s3:GetObjectAttributes, so the part list cannot be read. It
// loses nothing: a multipart object's stored checksum ends in its part count,
// and the uploader cuts every part but the last at one chunk size, so the
// boundaries follow from the length and that count. If they did not, the
// composite digest below would differ and this would fail rather than pass.
const s3 = [];
for (const entry of intervals) {
  const head = JSON.parse(aws(["s3api", "head-object", "--bucket", BUCKET, "--key", `${prefix}/${entry.fileName}`, "--checksum-mode", "ENABLED", "--output", "json"]));
  if (head.ContentLength !== entry.byteLength) throw new Error(`${entry.fileName}: S3 holds ${head.ContentLength} bytes`);
  const stored = head.ChecksumSHA256;
  const parts = Number(stored?.split("-")[1] ?? "1");
  const expected = s3DigestAt(entry.fileName, partBoundaries(entry.byteLength, parts, entry.fileName));
  if (!stored || stored !== expected) throw new Error(`${entry.fileName}: S3 SHA-256 ${stored} does not match the local bytes (${expected})`);
  s3.push({ fileName: entry.fileName, byteLength: head.ContentLength, s3ChecksumSha256: stored, parts });
}
/** The part sizes that give `parts` parts over `total` bytes, at the uploader's chunk size. */
function partBoundaries(total, parts, fileName) {
  if (!Number.isInteger(parts) || parts <= 1) return [];
  for (let chunk = 8 << 20; chunk <= (8 << 20) * 1024; chunk *= 2) {
    if (Math.ceil(total / chunk) !== parts) continue;
    const sizes = Array.from({ length: parts }, () => chunk);
    sizes[parts - 1] = total - chunk * (parts - 1);
    return sizes;
  }
  throw new Error(`${fileName}: no chunk size cuts ${total} bytes into ${parts} parts`);
}
function s3DigestAt(fileName, partSizes) {
  const bytes = fs.readFileSync(path.join(TILES, fileName));
  if (partSizes.length === 0) return createHash("sha256").update(bytes).digest("base64");
  const digestsOfParts = [];
  let offset = 0;
  for (const size of partSizes) {
    digestsOfParts.push(createHash("sha256").update(bytes.subarray(offset, offset + size)).digest());
    offset += size;
  }
  if (offset !== bytes.length) throw new Error(`${fileName}: S3 parts cover ${offset} of ${bytes.length} bytes`);
  return `${createHash("sha256").update(Buffer.concat(digestsOfParts)).digest("base64")}-${partSizes.length}`;
}

// 4. CloudFront readback: every archive fetched whole and hashed in memory.
let cursor = 0;
const cloudFront = [];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (cursor < intervals.length) {
    const entry = intervals[cursor++];
    const response = await fetch(`${base}/${entry.fileName}`, { cache: "no-store", headers: { "accept-encoding": "identity" } });
    if (!response.ok) throw new Error(`${entry.fileName}: CloudFront answered HTTP ${response.status}`);
    const hash = createHash("sha256");
    let length = 0;
    for await (const chunk of response.body) {
      hash.update(chunk);
      length += chunk.length;
    }
    const sha256 = hash.digest("hex");
    if (length !== entry.byteLength || sha256 !== entry.sha256) throw new Error(`${entry.fileName}: CloudFront bytes differ`);
    cloudFront.push({ fileName: entry.fileName, byteLength: length, sha256 });
  }
}));
cloudFront.sort((a, b) => a.fileName.localeCompare(b.fileName));

function admissionRecord(id, entries) {
  const parent = JSON.parse(fs.readFileSync("data/phase2-1984-2022-admission-record-2026-09-18.json", "utf8"));
  return {
    schemaVersion: "witness-tree/phase2-per-cell-four-province-admission/1",
    status: "admitted-and-released-under-prior-owner-authorization",
    ownerDecision: {
      decidedOn: parent.ownerDecision.itemEHandling.decidedOn,
      ownerWords: parent.ownerDecision.itemEHandling.ownerWords,
      meaning: parent.ownerDecision.itemEHandling.meaning[1],
      recordedFrom: "the owner's message in the Claude Code session of 2026-09-18, answering the item E handling question",
      timing: "The owner authorized admission and release of the clipped archives before they were built. The owner has not seen these bytes, their digests or this record; nothing here is a review of them by the owner or anyone else. The approval is what this record rests on, and the checks below are engineering checks.",
      parentRecord: { path: "data/phase2-1984-2022-admission-record-2026-09-18.json", item: "E-per-cell-patch-archives", sha256: sha("data/phase2-1984-2022-admission-record-2026-09-18.json") },
    },
    admittedProduct: {
      productId: manifest.product,
      derivedFrom: manifest.derivedFrom,
      what: "38 annual per-cell loss patch archives, zoom 8-14, holding only the loss cells inside BC, AB, ON and QC. A patch that crosses a provincial boundary keeps its inside cells; a patch with none inside is dropped.",
    },
    engineeringChecks: {
      reconciliation: manifest.clip.anchor,
      allIntervalsMatchAnchor: manifest.clip.allIntervalsMatchAnchor,
      keptCells: manifest.intervals.reduce((sum, entry) => sum + entry.cellCount, 0),
      patchesCutAtABorder: manifest.intervals.reduce((sum, entry) => sum + entry.patchesCutAtABorder, 0),
      patchesDropped: manifest.intervals.reduce((sum, entry) => sum + entry.patchesDropped, 0),
      provinceCellRuns: manifest.clip.provinceCellRuns,
    },
    bound: {
      releaseId: id,
      storeManifestSha256: sha(path.join(STORE, "manifest.json")),
      attributionManifestSha256: sha(path.join(STORE, "attribution-manifest.json")),
      archives: entries.map(({ interval, fileName, byteLength, sha256 }) => ({ interval, fileName, byteLength, sha256 })),
    },
    limits: parent.limits,
    prohibitedClaims: parent.prohibitedClaims,
    formalGates: { phase2FormalExit: parent.formalGates.phase2FormalExit, phase8LaunchReadiness: parent.formalGates.phase8LaunchReadiness, honestConclusion: parent.formalGates.honestConclusion },
    claims: { admitted: true, releaseApproved: true, ownerReviewedTheseBytes: false, expertReviewed: false, complete: false, countable: false, productionEligible: false, formalGatesChanged: false },
  };
}

const recordedAt = new Date().toISOString();
fs.writeFileSync(RECORD, `${JSON.stringify({
  schemaVersion: "witness-tree/phase2-per-cell-tile-release/1",
  releaseId,
  base,
  productId: manifest.product,
  derivedFrom: manifest.derivedFrom,
  readback: READBACK,
  admission: { path: ADMISSION, sha256: sha(ADMISSION), meaning: "the clipped archives' own record; item E of the 2026-09-18 record admitted the national archives, not these" },
  clip: {
    rule: manifest.clip.rule,
    anchor: manifest.clip.anchor,
    allIntervalsMatchAnchor: true,
    provinceCellRunsSha256: manifest.clip.provinceCellRuns.sha256,
    storeManifestSha256: sha(path.join(STORE, "manifest.json")),
    attributionManifestSha256: sha(path.join(STORE, "attribution-manifest.json")),
  },
  minZoom: 8,
  maxZoom: 14,
  generalizedBelowZoom: 14,
  countable: false,
  expertReviewed: false,
  productionEligible: false,
  coverageEvidence: JSON.parse(fs.readFileSync("data/phase2-per-cell-tile-release.json", "utf8")).coverageEvidence,
  intervals: intervals.map((entry) => ({ ...entry, url: `${base}/${entry.fileName}` })),
  totals: { intervalCount: intervals.length, byteLength: intervals.reduce((sum, entry) => sum + entry.byteLength, 0) },
  recordedAt,
}, null, 2)}\n`, { flag: "wx" });
fs.writeFileSync(READBACK, `${JSON.stringify({
  schemaVersion: "witness-tree/phase2-per-cell-four-province-tile-readback/1",
  releaseId,
  recordedAt,
  s3ExactReadback: { method: "head-object length and S3's stored SHA-256 (per-part composite for multipart objects) against the same digest of the local bytes, cut at the part boundaries the length and part count give", archives: s3 },
  cloudFrontExactReadback: { method: "every archive fetched whole without caching and hashed with SHA-256 in memory", archives: cloudFront },
}, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`Released ${intervals.length} four-province archives at ${base}\n`);
