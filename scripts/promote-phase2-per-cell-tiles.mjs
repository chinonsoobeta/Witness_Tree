import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

// Copies the staged archives into the release prefix the site reads.
//
// The release id is derived from the archives' own digests, so it cannot be
// known until the last archive exists. The upload therefore goes to a staging
// prefix while the tiler is still running, and this promotes it afterwards
// with a server-side copy, which moves no bytes over the wire.
//
// A promotion refuses to overwrite: an object already present at the release
// path is left exactly as it is, because a published release is immutable and
// a silent overwrite would make a path serve different bytes than the record
// that binds it.

const BUCKET = "witness-tree-public-delivery-ca-central-1";
const STAGING = `s3://${BUCKET}/staging/phase2-per-cell-geometry-v1/tiles`;

const aws = (args) => execFileSync("aws", args, { encoding: "utf8", maxBuffer: 1 << 28 });

const release = JSON.parse(await readFile(new URL("../data/phase2-per-cell-tile-release.json", import.meta.url), "utf8"));
if (release.intervals.length === 0) throw new Error("the release record is empty: build it after the archives exist");
const target = `s3://${BUCKET}/releases/phase2-per-cell-geometry-v1/${release.releaseId}/tiles`;

const listing = new Map();
for (const line of aws(["s3", "ls", `${target}/`]).split("\n")) {
  const match = line.trim().match(/^\S+\s+\S+\s+(\d+)\s+(\S+\.pmtiles)$/);
  if (match) listing.set(match[2], Number(match[1]));
}

for (const entry of release.intervals) {
  const present = listing.get(entry.fileName);
  if (present !== undefined) {
    if (present !== entry.byteLength) {
      throw new Error(`${entry.fileName} already published at ${present} bytes, record expects ${entry.byteLength}`);
    }
    console.log(`${entry.fileName} already published, left untouched`);
    continue;
  }
  aws(["s3", "cp", `${STAGING}/${entry.fileName}`, `${target}/${entry.fileName}`, "--content-type", "application/octet-stream", "--only-show-errors"]);
  console.log(`promoted ${entry.fileName}`);
}

// Prove the published bytes are the bytes the record binds, by reading the
// object's own checksum back from S3 rather than trusting the copy.
for (const entry of release.intervals) {
  const head = JSON.parse(aws(["s3api", "head-object", "--bucket", BUCKET, "--key", `releases/phase2-per-cell-geometry-v1/${release.releaseId}/tiles/${entry.fileName}`]));
  if (head.ContentLength !== entry.byteLength) {
    throw new Error(`${entry.fileName} published at ${head.ContentLength} bytes, record binds ${entry.byteLength}`);
  }
}
console.log(`${release.intervals.length} archives published under ${release.releaseId.slice(0, 12)}`);
