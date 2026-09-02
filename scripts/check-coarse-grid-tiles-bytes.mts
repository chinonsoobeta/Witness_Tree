/**
 * The committed record for the coarse grid says what is on the drive. This is
 * the check that goes and looks.
 *
 * It needs the approved data root, so it cannot run in CI, and it is listed in
 * data/data-root-bound-checks.json for that reason. Evidence unavailable is not
 * evidence contradicted: when the drive is absent this refuses to answer rather
 * than reporting a pass.
 *
 * It reads every tile with the same decoder the page uses, so what it proves is
 * not "the files are present" but "the reader can read them, and what they add
 * up to is what the record and the identity proof both claim".
 */

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { approvedDataRootRealPathSync, resolveDataRoot } from "./data-root.mjs";
import { decodeTile } from "../lib/shapes/tiles";
import { readSources, type GridRecord } from "./check-coarse-grid-tiles.mjs";

const MARKER = "Witness_Tree-data";
const SOURCE_FILES = ["pair-identity.json", "tiles.index.json", "tiles.manifest.json"] as const;

const fail = (message: string): never => {
  throw new Error(message);
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Refuse a path that reaches its bytes through a link we did not approve. */
function realFile(path: string): string {
  if (!existsSync(path)) fail(`${path} is not there.`);
  if (lstatSync(path).isSymbolicLink()) fail(`${path} is a symlink, so the bytes it names are not the bytes bound here.`);
  return path;
}

function artifactRoot(record: GridRecord & { artifactRoot: string; tileDirectory: string }): string {
  const at = record.artifactRoot.indexOf(MARKER);
  if (at < 0) fail(`The record's artifact root ${record.artifactRoot} is not under ${MARKER}.`);
  const root = approvedDataRootRealPathSync(resolveDataRoot());
  return join(root, record.artifactRoot.slice(at + MARKER.length + 1));
}

export function verifyBytes(): string {
  const record = readSources().record as GridRecord & {
    artifactRoot: string;
    tileDirectory: string;
    completionMarker: { file: string; value: string };
    sourceArtifacts: { file: string; bytes: number; sha256: string }[];
  };
  const root = artifactRoot(record);
  if (!existsSync(root)) {
    fail(`The coarse grid tiles are not readable at ${root}. Attach the approved data root and run this again; an absent drive is not a pass.`);
  }

  // 1. The three artifacts the record was composed from are still those bytes,
  //    and all three are still named. A record that quietly dropped one would
  //    verify fewer files while reporting the same pass.
  const named = record.sourceArtifacts.map((artifact) => artifact.file).sort();
  if (named.join(",") !== [...SOURCE_FILES].sort().join(",")) {
    fail(`The record names ${named.join(", ")} as its source artifacts rather than ${SOURCE_FILES.join(", ")}.`);
  }
  for (const artifact of record.sourceArtifacts) {
    const path = realFile(join(root, artifact.file));
    const bytes = readFileSync(path);
    if (bytes.length !== artifact.bytes) {
      fail(`${artifact.file} is ${bytes.length} bytes on the drive and ${artifact.bytes} in the record.`);
    }
    if (sha256(bytes) !== artifact.sha256) fail(`${artifact.file} no longer hashes to what the record bound.`);
  }

  // 2. The completion marker is the digest the runner wrote, recomputed the
  //    way the runner computes it, so a hand-edited marker is caught.
  const markerPath = realFile(join(root, record.completionMarker.file));
  const onDrive = readFileSync(markerPath, "utf8").trim();
  if (onDrive !== record.completionMarker.value) {
    fail(`The completion marker on the drive is ${onDrive} and the record binds ${record.completionMarker.value}.`);
  }
  const lines = ["tiles.manifest.json", "tiles.index.json", "pair-identity.json"]
    .map((file) => `${sha256(readFileSync(join(root, file)))}  ${join(root, file)}\n`)
    .join("");
  if (sha256(Buffer.from(lines, "utf8")) !== onDrive) {
    fail("The marker is not the digest of the manifest, tile index and identity report as the runner writes it.");
  }

  // 3. Every tile is present, is the size and digest recorded, decodes with
  //    the reader the page uses, and holds the blocks the index claims.
  const tiles = join(root, record.tileDirectory);
  let blocks = 0;
  let countable = 0;
  let compressed = 0;
  for (const tile of record.tiles) {
    const path = realFile(join(tiles, tile.file));
    const size = statSync(path).size;
    if (size !== tile.bytes) fail(`${tile.file} is ${size} bytes and the record says ${tile.bytes}.`);
    const packed = readFileSync(path);
    if (sha256(packed) !== tile.sha256) fail(`${tile.file} no longer hashes to what the record bound.`);
    const raw = gunzipSync(packed);
    if (raw.length !== tile.rawBytes) fail(`${tile.file} unpacks to ${raw.length} bytes and the record says ${tile.rawBytes}.`);
    const decoded = decodeTile(new Uint8Array(raw));
    if (decoded.tileX !== tile.tileX || decoded.tileY !== tile.tileY) {
      fail(`${tile.file} says it is tile ${decoded.tileX},${decoded.tileY}, which is not where it is filed.`);
    }
    if (decoded.blocks.length !== tile.blocks) {
      fail(`${tile.file} holds ${decoded.blocks.length} blocks and the record says ${tile.blocks}.`);
    }
    blocks += decoded.blocks.length;
    for (const block of decoded.blocks) countable += block.countableCells;
    compressed += size;
  }

  // 4. What the bytes add up to is what the record and the proof both claim.
  //    This is the one that would catch a tile set quietly rebuilt from a
  //    different extraction than the one the identity was proven over.
  if (blocks !== record.blocksPacked) fail(`The tiles hold ${blocks} blocks; the record says ${record.blocksPacked}.`);
  if (countable !== record.countableCells) {
    fail(`The tiles hold ${countable} countable cells; the record and the identity proof say ${record.countableCells}.`);
  }
  if (compressed !== record.totalBytes) fail(`The tiles are ${compressed} bytes; the record says ${record.totalBytes}.`);

  return (
    `coarse grid tiles on the drive: ${record.tiles.length} tiles at ${root}, every digest matched, ` +
    `every tile decoded with the page's own reader, ${blocks} blocks and ${countable} countable cells, ` +
    `which is what the record and the identity proof both claim.`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(verifyBytes());
}
