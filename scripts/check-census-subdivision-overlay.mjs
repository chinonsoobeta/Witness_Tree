#!/usr/bin/env node
/**
 * Fails closed on the census-subdivision layer's release record.
 *
 * The map fetches the layer's tiles and figures from the URLs this record
 * names, so it must be one the publish script wrote, pinned by the loader, and
 * read back exactly from S3 and from CloudFront. A record written with --plan
 * has no readback, and this check fails until the upload has happened.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_PATH = "data/census-subdivision-overlay-release.json";
const READBACK_PATH = "data/census-subdivision-overlay-release-readback.json";
const PLACE_INDEX_PATH = "data/place-name-index.json";
const LOADER_PATH = "lib/explore/census-subdivisions.ts";
const PRODUCT_ID = "census-subdivision-overlay-v1";
const PROVINCES = ["BC", "AB", "ON", "QC"];
const digest = (value) => /^[a-f0-9]{64}$/.test(value ?? "");

/** @param {string | null} [loaderSource] the browser loader, to confirm it pins this release */
export function validateCensusSubdivisionRelease(release, readback, placeIndex, loaderSource = null) {
  if (release?.schemaVersion !== "witness-tree/census-subdivision-overlay-release/1" || release.productId !== PRODUCT_ID) {
    throw new Error(`The census-subdivision release must be a version 1 ${PRODUCT_ID} record.`);
  }
  if (!digest(release.releaseId) || release.base !== `https://d3g1406o0uekin.cloudfront.net/releases/${PRODUCT_ID}/${release.releaseId}`) {
    throw new Error("The census-subdivision release base must address its release id.");
  }
  const files = [release.tiles, ...(release.figures ?? [])];
  for (const file of files) {
    if (!digest(file?.sha256) || !Number.isInteger(file.byteLength) || file.byteLength <= 0 || file.url !== `${release.base}/${file.fileName}`) {
      throw new Error(`${file?.fileName ?? "A file"} in the census-subdivision release is not pinned.`);
    }
  }
  if (release.tiles.layer !== "census_subdivisions") throw new Error("The census-subdivision tiles must name their layer.");
  const provinces = release.figures.map((figure) => figure.province);
  if (provinces.join() !== PROVINCES.join()) throw new Error(`The figures must cover ${PROVINCES.join(", ")} in that order.`);
  const counts = placeIndex.counts.placesByProvince;
  for (const figure of release.figures) {
    if (figure.placeCount !== counts[figure.province]) {
      throw new Error(`${figure.province} figures hold ${figure.placeCount} places; the place index lists ${counts[figure.province]}.`);
    }
    if (figure.contentEncoding !== "gzip" || !digest(figure.jsonSha256)) {
      throw new Error(`${figure.fileName} must be served gzip-encoded with its JSON digest recorded.`);
    }
  }
  // Only the published places are drawn; reserves, settlements and treaty or
  // agreement lands stay out until Phase 7 admits their boundaries.
  if (release.tiles.featureCount !== placeIndex.counts.places) {
    throw new Error(`The tiles draw ${release.tiles.featureCount} places; the place index lists ${placeIndex.counts.places}.`);
  }
  // The browser loader pins the names rather than importing the record.
  if (loaderSource !== null) {
    for (const pinned of [release.releaseId, release.base, release.tiles.fileName, release.tiles.layer, ...release.figures.map((figure) => `${figure.province}: "${figure.fileName}"`)]) {
      if (!loaderSource.includes(pinned)) throw new Error(`lib/explore/census-subdivisions.ts does not pin ${pinned}.`);
    }
  }
  if (!readback) throw new Error(`${READBACK_PATH} is missing: the release has been planned but not published.`);
  if (
    readback.schemaVersion !== "witness-tree/census-subdivision-overlay-release-readback/1" ||
    readback.releaseId !== release.releaseId ||
    readback.s3ExactReadback !== true ||
    readback.cloudFrontExactReadback !== true
  ) {
    throw new Error("The census-subdivision readback does not bind the release.");
  }
  const seen = new Map(readback.files.map((file) => [file.fileName, file]));
  if (seen.size !== files.length) throw new Error("The census-subdivision readback lists a different set of files.");
  for (const file of files) {
    const match = seen.get(file.fileName);
    if (!match || match.sha256 !== file.sha256 || match.byteLength !== file.byteLength) {
      throw new Error(`The census-subdivision readback does not match ${file.fileName}.`);
    }
  }
  return { releaseId: release.releaseId, files: files.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const read = (relative) => JSON.parse(readFileSync(path.join(REPO_ROOT, relative), "utf8"));
  try {
    const result = validateCensusSubdivisionRelease(
      read(RELEASE_PATH),
      existsSync(path.join(REPO_ROOT, READBACK_PATH)) ? read(READBACK_PATH) : null,
      read(PLACE_INDEX_PATH),
      readFileSync(path.join(REPO_ROOT, LOADER_PATH), "utf8"),
    );
    console.log(`Census-subdivision layer: ${result.files} files, release ${result.releaseId.slice(0, 12)}, read back exactly.`);
  } catch (error) {
    console.error(`Census-subdivision layer check failed: ${error.message}`);
    process.exit(1);
  }
}
