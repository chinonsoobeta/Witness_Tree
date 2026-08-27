import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { approvedDataRootRealPathSync, resolveDataRoot } from "./data-root.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const recordPath = resolve(root, "data/phase2-real-comparison-availability.json");
const canonicalDataRoot = resolve(root, "../../Witness_Tree-data");
const SHA256 = /^[a-f0-9]{64}$/;

function assertNoSymlinkAncestors(absolutePath, label, approvedRoot) {
  let current = absolutePath;
  while (true) {
    let info;
    try {
      info = lstatSync(current);
    } catch {
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
      continue;
    }
    // /tmp and /var are macOS aliases for /private/tmp and /private/var. The
    // configured root itself is allowed only after the shared helper has
    // proved that it is the one approved SSD compatibility link.
    const approved = current === "/tmp" || current === "/var" || current === approvedRoot;
    assert(!info.isSymbolicLink() || approved, `${label} must not traverse a symlink parent`);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function comparisonDataRoot() {
  const configured = resolveDataRoot();
  assert(typeof configured === "string" && configured.trim().length > 0, "WITNESS_TREE_DATA_ROOT must not be empty");
  assert(!configured.includes("\0"), "WITNESS_TREE_DATA_ROOT must not contain NUL");
  assert(isAbsolute(configured), "WITNESS_TREE_DATA_ROOT must be an absolute path");

  // A root may be the post-cutover compatibility symlink, but only the
  // helper-approved link may be followed. A missing path is not an accepted
  // override: this check must fail before an artifact read is attempted.
  const approved = approvedDataRootRealPathSync(configured);
  assertNoSymlinkAncestors(configured, "WITNESS_TREE_DATA_ROOT", configured);
  let info;
  try {
    info = lstatSync(approved);
  } catch (error) {
    throw new Error(`WITNESS_TREE_DATA_ROOT is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(!info.isSymbolicLink() && info.isDirectory(), "WITNESS_TREE_DATA_ROOT must resolve to a directory");
  return resolve(approved);
}

function sourcePath(localPath, dataRoot) {
  assert(typeof localPath === "string" && localPath.trim().length > 0, "localPath is required for a staged source");
  assert(!localPath.includes("\0"), "localPath must not contain NUL");
  const recorded = resolve(root, localPath);
  const canonicalPrefix = `${canonicalDataRoot}/`;
  assert(recorded.startsWith(canonicalPrefix), `source localPath must remain under ${canonicalDataRoot}`);
  const relativePath = relative(canonicalDataRoot, recorded);
  assert(relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath), "source localPath escapes the canonical data root");
  const physical = resolve(dataRoot, relativePath);
  const physicalPrefix = `${dataRoot}/`;
  assert(physical.startsWith(physicalPrefix), "source localPath escapes the configured data root");
  assertNoSymlinkAncestors(physical, "source artifact", dataRoot);
  const info = lstatSync(physical);
  assert(!info.isSymbolicLink(), "source artifact must not be a symlink");
  assert(info.isFile(), "source artifact must be a regular file");
  return physical;
}

function validateAvailability(record, dataRoot = comparisonDataRoot()) {
  assert(record && typeof record === "object" && !Array.isArray(record), "Phase 2 comparison availability record is required");
  assert.equal(record.schemaVersion, "witness-tree/phase2-real-comparison-availability/1");
  assert.equal(record.status, "local-nbac-and-hansen-inputs-staged-no-comparison-results");
  assert.equal(record.productionEligible, false);
  assert.equal(record.formalPhase2ComparisonGateComplete, false);

  for (const source of record.sources) {
    assert(source && typeof source === "object" && !Array.isArray(source), "each comparison source must be an object");
    if (source.localPath) {
      assert(Number.isSafeInteger(source.byteLength) && source.byteLength > 0, `${source.id} byte length is invalid`);
      assert.match(source.sha256, SHA256, `${source.id} SHA-256 is invalid`);
      const file = sourcePath(source.localPath, dataRoot);
      const bytes = readFileSync(file);
      assert.equal(bytes.length, source.byteLength, `${source.id} byte length differs`);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256, `${source.id} SHA-256 differs`);
    } else {
      assert.deepEqual([source.byteLength, source.sha256], [null, null]);
    }
  }
  for (const row of record.publishedComparisons) {
    for (const key of ["witnessTreeHectares", "referenceHectares", "absoluteDifferenceHectares", "relativeDifference"]) {
      assert.equal(row[key], null);
    }
  }

  const hansen = record.sources.find((source) => source.id === "hansen-global-forest-change");
  assert.equal(hansen.comparisonStatus, "sample-input-staged-not-like-for-like");
  assert.equal(hansen.evidence, "data/phase2-hansen-gfc-v1.12-sample-profile.json");
  const nbac = record.sources.find((source) => source.id === "nbac-1972-2025");
  assert.equal(nbac.comparisonStatus, "input-staged-not-admitted");
  assert.equal(nbac.evidence, "data/phase1-nbac-profile-2026-08-27.json");
  assert.match(nbac.missing, /Immutable archive.*production admission.*49 invalid NBAC geometries/i);
  assert.deepEqual(record.claims, { comparisonResultsExist: false, causalAttributionClaim: false, likeForLikeClaim: false, productAccuracyClaim: false, released: false });
  return record;
}

export { comparisonDataRoot, validateAvailability };

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const record = JSON.parse(readFileSync(recordPath, "utf8"));
  validateAvailability(record);
  console.log("Phase 2 real comparison availability passes; all unavailable results remain published nulls.");
}
