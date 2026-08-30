// Publishes the boundary-overlay archives to the immutable release prefix.
//
// The release id is derived from the archive digests, so re-running with the
// same inputs targets the same URL with the same bytes. An object that already
// exists with different bytes is a hard failure: release prefixes are immutable
// and a silent overwrite would invalidate every checksum bound to that URL.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const OUT_DIR = path.join(DATA_ROOT, "derived/boundary-overlays-v2");
const BUCKET = "witness-tree-public-delivery-ca-central-1";
const DISTRIBUTION = "https://d3g1406o0uekin.cloudfront.net";
const RELEASE = "boundary-overlays-v2";

const aws = (args) => execFileSync("aws", args, { encoding: "utf8", maxBuffer: 1 << 26 });
const manifest = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "manifest.json"), "utf8"));

const releaseId = createHash("sha256")
  .update(manifest.archives.map((a) => `${a.overlay}:${a.sha256}`).join("\n"))
  .digest("hex");
const prefix = `releases/${RELEASE}/${releaseId}/tiles`;

const published = [];
const readbackDir = fs.mkdtempSync(path.join(os.tmpdir(), "boundary-overlay-readback-"));
for (const archive of manifest.archives) {
  const local = path.join(OUT_DIR, archive.fileName);
  const actual = createHash("sha256").update(fs.readFileSync(local)).digest("hex");
  if (actual !== archive.sha256) throw new Error(`${archive.fileName}: local bytes drifted from the manifest`);

  const key = `${prefix}/${archive.fileName}`;
  let existing = null;
  try {
    existing = JSON.parse(aws(["s3api", "head-object", "--bucket", BUCKET, "--key", key, "--output", "json"]));
  } catch {
    existing = null;
  }
  if (existing) {
    if (existing.ContentLength !== archive.byteLength) {
      throw new Error(`${key} already published with ${existing.ContentLength} bytes, refusing to overwrite`);
    }
    process.stderr.write(`${archive.fileName} already published, unchanged\n`);
  } else {
    // The bucket denies any release write that is not conditional on the object
    // being absent, so create-once is enforced by the policy rather than by this
    // script being careful. Release objects also cannot be deleted.
    aws([
      "s3api", "put-object",
      "--bucket", BUCKET,
      "--key", key,
      "--body", local,
      "--content-type", "application/octet-stream",
      "--if-none-match", "*",
      "--output", "json",
    ]);
    process.stderr.write(`${archive.fileName} uploaded\n`);
  }

  const head = JSON.parse(aws(["s3api", "head-object", "--bucket", BUCKET, "--key", key, "--output", "json"]));
  if (head.ContentLength !== archive.byteLength) {
    throw new Error(`${key}: published length ${head.ContentLength} does not match ${archive.byteLength}`);
  }
  const readback = path.join(readbackDir, archive.fileName);
  aws(["s3api", "get-object", "--bucket", BUCKET, "--key", key, readback, "--output", "json"]);
  const remoteLength = fs.statSync(readback).size;
  const remoteSha256 = createHash("sha256").update(fs.readFileSync(readback)).digest("hex");
  if (remoteLength !== archive.byteLength || remoteSha256 !== archive.sha256) {
    throw new Error(`${key}: exact remote readback does not match the local archive`);
  }
  published.push({ ...archive, url: `${DISTRIBUTION}/${prefix}/${archive.fileName}` });
}
fs.rmSync(readbackDir, { recursive: true, force: true });

const release = {
  schemaVersion: "witness-tree/boundary-overlay-release/1",
  productId: manifest.productId,
  releaseId,
  base: `${DISTRIBUTION}/${prefix}`,
  builtAt: manifest.builtAt,
  sources: manifest.sources,
  archives: published,
};
fs.writeFileSync("data/boundary-overlay-release.json", `${JSON.stringify(release, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(release, null, 2)}\n`);
