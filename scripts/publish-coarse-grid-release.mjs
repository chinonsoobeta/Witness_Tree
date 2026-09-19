// Publishes the 960 m coarse grid that draw-and-measure reads to the immutable
// release prefix, and proves every tile came back byte for byte.
//
// Owner approval: item F of data/phase2-1984-2022-admission-record-2026-09-18.json
// ("admit and release"). The release id is the grid's own completion marker, so
// the URL names the exact bytes the admission bound.
//
// Nothing is copied off the data root: tiles upload straight from the drive, the
// S3 check compares each object's MD5 ETag with the local bytes (every tile is a
// single-part upload, so its ETag is its MD5), and the CloudFront readback hashes
// each response in memory.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const PRODUCT_ID = "phase6-coarse-grid-v1";
const GRID = path.join(DATA_ROOT, "derived", "phase6-coarse-grid-tiles-v1");
const BUCKET = "witness-tree-public-delivery-ca-central-1";
const DISTRIBUTION = "https://d3g1406o0uekin.cloudfront.net";
const RECORD = "data/phase6-coarse-grid-release.json";
const READBACK = "data/phase6-coarse-grid-release-readback.json";
const CONCURRENCY = 24;

const aws = (args) => execFileSync("aws", args, { encoding: "utf8", maxBuffer: 1 << 28 });
const committed = JSON.parse(fs.readFileSync("data/phase6-coarse-grid-tiles.json", "utf8"));
const marker = fs.readFileSync(path.join(GRID, "tiles.complete.sha256"), "utf8").trim().split(/\s+/)[0];
if (marker !== committed.completionMarker.value) {
  throw new Error(`the grid's completion marker is ${marker}, the admitted record binds ${committed.completionMarker.value}`);
}
const index = JSON.parse(fs.readFileSync(path.join(GRID, "tiles.index.json"), "utf8"));
const releaseId = marker;
const prefix = `releases/${PRODUCT_ID}/${releaseId}/tiles`;

// 1. Local bytes must still be the admitted bytes.
const local = new Map();
for (const tile of index.tiles) {
  const bytes = fs.readFileSync(path.join(GRID, "tiles", tile.file));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== tile.sha256 || bytes.length !== tile.bytes) throw new Error(`${tile.file} drifted from tiles.index.json`);
  local.set(tile.file, { byteLength: bytes.length, sha256, md5: createHash("md5").update(bytes).digest("hex") });
}
const onDisk = fs.readdirSync(path.join(GRID, "tiles")).filter((name) => name.endsWith(".bin.gz"));
if (onDisk.length !== local.size) throw new Error(`${onDisk.length} tiles on disk, ${local.size} in the index`);
process.stderr.write(`${local.size} tiles match the index\n`);

// 2. Create-once upload. --no-overwrite sends If-None-Match, which the bucket
// policy requires for every release write; an object already there is skipped,
// and step 3 then proves it holds the same bytes.
aws([
  "s3", "cp", path.join(GRID, "tiles"), `s3://${BUCKET}/${prefix}/`,
  "--recursive", "--no-overwrite", "--only-show-errors",
  "--exclude", "*", "--include", "*.bin.gz",
  "--content-type", "application/octet-stream",
]);

// 3. S3 readback: every object present, same length, MD5 ETag equal to the local MD5.
const remote = new Map();
let token;
do {
  const page = JSON.parse(aws([
    "s3api", "list-objects-v2", "--bucket", BUCKET, "--prefix", `${prefix}/`, "--output", "json",
    ...(token ? ["--continuation-token", token] : []),
  ]));
  for (const object of page.Contents ?? []) remote.set(object.Key.slice(prefix.length + 1), object);
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);
if (remote.size !== local.size) throw new Error(`${remote.size} objects under the release prefix, ${local.size} expected`);
for (const [file, expected] of local) {
  const object = remote.get(file);
  if (!object) throw new Error(`${file} is missing from S3`);
  if (object.Size !== expected.byteLength) throw new Error(`${file}: S3 holds ${object.Size} bytes, expected ${expected.byteLength}`);
  if (object.ETag.replaceAll('"', "") !== expected.md5) throw new Error(`${file}: S3 ETag does not match the local MD5`);
}
process.stderr.write(`S3 readback exact for ${remote.size} tiles\n`);

// 4. CloudFront readback: every tile fetched and hashed, in memory.
const files = [...local.keys()];
let cursor = 0;
let cloudFrontBytes = 0;
const worker = async () => {
  while (cursor < files.length) {
    const file = files[cursor++];
    const response = await fetch(`${DISTRIBUTION}/${prefix}/${file}`, {
      cache: "no-store",
      headers: { "accept-encoding": "identity" },
    });
    if (!response.ok) throw new Error(`${file}: CloudFront answered HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const expected = local.get(file);
    if (bytes.length !== expected.byteLength || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) {
      throw new Error(`${file}: CloudFront bytes do not match the local tile`);
    }
    cloudFrontBytes += bytes.length;
  }
};
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
process.stderr.write(`CloudFront readback exact for ${files.length} tiles, ${cloudFrontBytes} bytes\n`);

const totalBytes = [...local.values()].reduce((sum, tile) => sum + tile.byteLength, 0);
const recordedAt = new Date().toISOString();
const release = {
  schemaVersion: "witness-tree/coarse-grid-release/1",
  productId: PRODUCT_ID,
  releaseId,
  releaseIdMeaning: "the grid's completion marker (tiles.complete.sha256), which data/phase6-coarse-grid-tiles.json binds",
  base: `${DISTRIBUTION}/${prefix}`,
  siteBinding: { name: "COARSE_GRID_BASE", value: `${DISTRIBUTION}/${prefix}/`, setBy: "the owner, on the live site, through the ChatGPT Sites control plane" },
  gridRecord: { path: "data/phase6-coarse-grid-tiles.json", sha256: createHash("sha256").update(fs.readFileSync("data/phase6-coarse-grid-tiles.json")).digest("hex") },
  admission: {
    path: "data/phase2-1984-2022-admission-record-2026-09-18.json",
    sha256: createHash("sha256").update(fs.readFileSync("data/phase2-1984-2022-admission-record-2026-09-18.json")).digest("hex"),
    item: "F-coarse-grid",
  },
  tileCount: local.size,
  totalBytes,
  claims: {
    admitted: true,
    released: true,
    releasedMeaning: "Uploaded create-once to the release prefix and read back byte for byte from S3 and CloudFront. The draw-and-measure route reads it once the live site's COARSE_GRID_BASE names this base.",
    expertReviewed: false,
    complete: false,
    formalGatesChanged: false,
  },
  limits: [
    "Loss is counted once per place against the forest known at the start year; the yearly sum is hectares only, never a share.",
    "Edge blocks of a drawn shape are bracketed, not measured; the route reports the bracket.",
    "Every province is partially mapped, so every figure is a minimum. Nodata is Unknown, never zero.",
    "Nothing has been expert reviewed.",
  ],
  recordedAt,
};
const readback = {
  schemaVersion: "witness-tree/coarse-grid-release-readback/1",
  releaseId,
  recordedAt,
  s3ExactReadback: { method: "list-objects-v2 length and single-part MD5 ETag against the local bytes", tiles: remote.size },
  cloudFrontExactReadback: { method: "every tile fetched without caching and hashed with SHA-256", tiles: files.length, bytes: cloudFrontBytes },
  tilesIndexSha256: createHash("sha256").update(fs.readFileSync(path.join(GRID, "tiles.index.json"))).digest("hex"),
};
fs.writeFileSync(RECORD, `${JSON.stringify(release, null, 2)}\n`, { flag: "wx" });
fs.writeFileSync(READBACK, `${JSON.stringify(readback, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`Published ${local.size} coarse-grid tiles (${totalBytes} bytes) at ${release.base}\n`);
