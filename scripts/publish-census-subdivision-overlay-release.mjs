// Publishes the census-subdivision layer (tiles and per-province figures) to
// its own immutable release prefix, beside the boundary-overlay releases.
//
// With --plan, it only writes data/census-subdivision-overlay-release.json,
// naming the URLs the upload will create, and uploads nothing. The readback
// record is written only after a real upload has been read back exactly from
// S3 and from CloudFront, and scripts/check-census-subdivision-overlay.mjs
// fails until it exists, so a planned release cannot ship as if it were live.
//
// The release id is derived from the file digests, so re-running with the same
// inputs targets the same URLs with the same bytes. The bucket accepts only
// create-once writes to release prefixes, and release objects cannot be deleted.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const PRODUCT_ID = "census-subdivision-overlay-v1";
const OUT_DIR = path.join(DATA_ROOT, "derived", PRODUCT_ID);
const BUCKET = "witness-tree-public-delivery-ca-central-1";
const DISTRIBUTION = "https://d3g1406o0uekin.cloudfront.net";
const RELEASE_PATH = "data/census-subdivision-overlay-release.json";
const READBACK_PATH = "data/census-subdivision-overlay-release-readback.json";
const plan = process.argv.includes("--plan");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const aws = (args) => execFileSync("aws", args, { encoding: "utf8", maxBuffer: 1 << 26 });

const manifest = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "manifest.json"), "utf8"));
if (manifest.productId !== PRODUCT_ID) {
  throw new Error(`Expected ${PRODUCT_ID} build manifest, found ${manifest.productId ?? "none"}`);
}
const files = [
  { ...manifest.archive, contentType: "application/octet-stream" },
  ...manifest.figures.map((figure) => ({ ...figure, contentType: "application/json" })),
];
for (const file of files) {
  if (sha256(fs.readFileSync(path.join(OUT_DIR, file.fileName))) !== file.sha256) {
    throw new Error(`${file.fileName}: local bytes drifted from the manifest`);
  }
}
const releaseId = sha256(files.map((file) => `${file.fileName}:${file.sha256}`).join("\n"));
const prefix = `releases/${PRODUCT_ID}/${releaseId}`;
const base = `${DISTRIBUTION}/${prefix}`;

const release = {
  schemaVersion: "witness-tree/census-subdivision-overlay-release/1",
  productId: PRODUCT_ID,
  releaseId,
  base,
  source: manifest.source,
  zooms: manifest.zooms,
  note: manifest.note,
  tiles: { ...manifest.archive, url: `${base}/${manifest.archive.fileName}` },
  figures: manifest.figures.map((figure) => ({ ...figure, url: `${base}/${figure.fileName}` })),
};
fs.writeFileSync(RELEASE_PATH, `${JSON.stringify(release, null, 2)}\n`);
if (plan) {
  process.stdout.write(`Planned ${PRODUCT_ID} release ${releaseId.slice(0, 12)}; nothing uploaded.\n`);
  process.exit(0);
}

const readbackDir = fs.mkdtempSync(path.join(os.tmpdir(), "csd-overlay-readback-"));
try {
  for (const file of files) {
    const key = `${prefix}/${file.fileName}`;
    let existing = null;
    try {
      existing = JSON.parse(aws(["s3api", "head-object", "--bucket", BUCKET, "--key", key, "--output", "json"]));
    } catch {
      existing = null;
    }
    if (existing) {
      if (existing.ContentLength !== file.byteLength) {
        throw new Error(`${key} already published with ${existing.ContentLength} bytes, refusing to overwrite`);
      }
      process.stderr.write(`${file.fileName} already published, unchanged\n`);
    } else {
      aws([
        "s3api", "put-object",
        "--bucket", BUCKET,
        "--key", key,
        "--body", path.join(OUT_DIR, file.fileName),
        "--content-type", file.contentType,
        ...(file.contentEncoding ? ["--content-encoding", file.contentEncoding] : []),
        "--cache-control", "public, max-age=31536000, immutable",
        "--if-none-match", "*",
        "--output", "json",
      ]);
      process.stderr.write(`${file.fileName} uploaded\n`);
    }

    const readback = path.join(readbackDir, file.fileName);
    aws(["s3api", "get-object", "--bucket", BUCKET, "--key", key, readback, "--output", "json"]);
    const remote = fs.readFileSync(readback);
    if (remote.length !== file.byteLength || sha256(remote) !== file.sha256) {
      throw new Error(`${key}: exact S3 readback does not match the local file`);
    }

    // fetch decodes Content-Encoding itself, so a gzip-encoded figure file is
    // compared as the JSON a browser will see.
    const response = await fetch(`${base}/${file.fileName}`, {
      cache: "no-store",
      headers: { "cache-control": "no-cache", origin: "https://www.witnesstree.ca" },
    });
    if (!response.ok) throw new Error(`${file.fileName}: CloudFront readback returned HTTP ${response.status}`);
    if (response.headers.get("access-control-allow-origin") === null) {
      throw new Error(`${file.fileName}: CloudFront does not allow the site to read it`);
    }
    const seen = Buffer.from(await response.arrayBuffer());
    const expected = file.contentEncoding ? file.jsonSha256 : file.sha256;
    if (sha256(seen) !== expected) {
      throw new Error(`${file.fileName}: exact CloudFront readback does not match the local file`);
    }
  }
} finally {
  fs.rmSync(readbackDir, { recursive: true, force: true });
}

fs.writeFileSync(READBACK_PATH, `${JSON.stringify({
  schemaVersion: "witness-tree/census-subdivision-overlay-release-readback/1",
  releaseId,
  recordedAt: new Date().toISOString(),
  s3ExactReadback: true,
  cloudFrontExactReadback: true,
  files: files.map(({ fileName, byteLength, sha256: digest }) => ({ fileName, byteLength, sha256: digest })),
}, null, 2)}\n`);
process.stdout.write(`Published ${PRODUCT_ID} release ${releaseId}\n`);
