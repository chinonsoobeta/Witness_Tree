// Refuses side-effect files that no manifest admits anywhere in the durable archive.
//
// Reading a raster can write to it. GDAL persists computed statistics and histograms into a
// "<raster>.aux.xml" PAM sidecar beside the file it read, unless GDAL_PAM_ENABLED=NO is set, and
// it writes overviews and masks the same way. Nothing in this repository asks for that, so when
// it happens it is a diagnostic command someone typed, and the archive quietly stops matching
// what was admitted.
//
// That is not hypothetical. A single `gdalinfo -hist` run on 2026-08-29 left a 956-byte histogram
// sidecar in derived/phase2-real-national-1984-2022-v1/disturbance/, an owner-admitted output
// directory whose readback asserts its exact contents. The readback failed, correctly, months
// later. All 79 admitted outputs still matched their bound checksums, so nothing was lost, but the
// gate was red for a reason no one had recorded and the cause had to be traced back through a
// session transcript to be named at all.
//
// scripts/check-raster-grid.mjs already guards one record against exactly this, by requiring it to
// state that gdalinfo -stats was never run. That guard protects one record. This one protects the
// archive, and it is cheap: the durable trees hold about 3,200 files and the walk takes under two
// seconds.
//
// The quarantine, staging, work, diagnostics and tools trees are deliberately outside the scope.
// They exist to hold exactly this sort of thing once it has been moved out of a bound location.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDataRoot } from "./data-root.mjs";

export const DURABLE_TREES = Object.freeze(["raw", "extracted", "derived", "evidence"]);

// Each pattern names a file a tool writes as a side effect of reading, never a product this
// project derives on purpose. A name here must be one no admitted manifest can contain.
export const ARTIFACT_PATTERNS = Object.freeze([
  { pattern: /\.aux\.xml$/, wrote: "GDAL persisted statistics or a histogram (set GDAL_PAM_ENABLED=NO)" },
  { pattern: /\.ovr$/, wrote: "GDAL built overviews (gdaladdo, or a viewer that offered to)" },
  { pattern: /\.tif\.msk$/, wrote: "GDAL wrote an external mask band" },
  { pattern: /(?:^|\/)\.DS_Store$/, wrote: "the macOS Finder opened the directory" },
  { pattern: /(?:^|\/)\._[^/]+$/, wrote: "macOS wrote an AppleDouble resource fork" },
]);

export function classify(relativePath) {
  return ARTIFACT_PATTERNS.find(({ pattern }) => pattern.test(relativePath)) ?? null;
}

function walk(absolute, relative, found) {
  let entries;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const childRelative = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) walk(join(absolute, entry.name), childRelative, found);
    else {
      const artifact = classify(childRelative);
      if (artifact) found.push({ path: childRelative, wrote: artifact.wrote });
    }
  }
}

export function scan(root, trees = DURABLE_TREES) {
  const found = [];
  for (const tree of trees) walk(join(root, tree), tree, found);
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

// The one file this guard would otherwise have flagged was moved out rather than deleted, because
// the archive is the only project-data copy. A record says where it went. Checking that the file is
// still there, byte for byte, is what stops "quarantined" from decaying into "quietly removed": a
// reader who finds the empty admitted directory can follow the record to the artifact itself.
export const QUARANTINE_RECORD_PATH = "data/phase2-real-national-tool-artifact-quarantine-2026-08-29.json";

export function validateQuarantineRecord(record, root, { readBytes = (path) => readFileSync(path), exists = existsSync } = {}) {
  assert.ok(record && typeof record === "object" && !Array.isArray(record), "the quarantine record is required");
  assert.equal(record.schemaVersion, "witness-tree/archive-tool-artifact-quarantine/1", "quarantine record schema differs");
  const moved = record.quarantined;
  assert.ok(moved && typeof moved === "object", "the record must say what was moved");
  for (const key of ["from", "to", "sha256", "byteLength", "modifiedAt", "reasonNotDeleted"]) {
    assert.ok(moved[key] !== undefined, `the quarantine record must state ${key}`);
  }
  assert.match(moved.sha256, /^[0-9a-f]{64}$/, "the quarantined file's digest must be a SHA-256");
  assert.ok(DURABLE_TREES.some((tree) => moved.from.startsWith(`${tree}/`)), `${moved.from} is not in a durable tree, so quarantining it explains nothing`);
  assert.ok(moved.to.startsWith("quarantine/"), `${moved.to} is not under quarantine/`);

  assert.equal(exists(join(root, moved.from)), false, `${moved.from} is back in the admitted directory; the archive no longer matches what was admitted`);
  assert.equal(exists(join(root, moved.to)), true, `the quarantined file is missing from ${moved.to}. It was preserved deliberately, so its absence means it was deleted rather than moved.`);
  const bytes = readBytes(join(root, moved.to));
  assert.equal(bytes.length, moved.byteLength, `${moved.to} is ${bytes.length} bytes, but the record binds ${moved.byteLength}`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), moved.sha256, `${moved.to} no longer matches the digest the record binds`);
  return moved;
}

function main() {
  const root = resolveDataRoot();
  // An absent drive is not a pass. A walk of a directory that does not exist finds nothing, which
  // would let this report "clean" having looked at nothing at all.
  let present = false;
  try {
    present = statSync(root).isDirectory();
  } catch {
    present = false;
  }
  assert.equal(present, true, `the data root is not readable at ${root}, so no such file or directory can be scanned for tool artifacts`);

  const found = scan(root);
  const detail = found.map(({ path, wrote }) => `  ${path}\n    written because ${wrote}`).join("\n");
  assert.deepEqual(
    found,
    [],
    `${found.length} tool-written file(s) sit in the durable archive under ${root}. Move each one into quarantine/<slug>/<date>/ rather than deleting it, then record what wrote it:\n${detail}`,
  );
  const record = JSON.parse(readFileSync(new URL(`../${QUARANTINE_RECORD_PATH}`, import.meta.url), "utf8"));
  const moved = validateQuarantineRecord(record, root);
  console.log(`${root}: ${DURABLE_TREES.join(", ")} carry no tool-written side-effect files.`);
  console.log(`${moved.to}: preserved, ${moved.byteLength} bytes, digest matches the record.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
