import { readFile } from "node:fs/promises";
// The names each jurisdiction must be called by in the coverage note. The
// point of this gate is that the note cannot drift from the layer: if a
// province is added to or dropped from the archive and nobody updates the
// sentence, a reader is told the overlay covers something it does not.
const JURISDICTION_NAMES = new Map([
  ["BC", { en: "British Columbia", fr: "Colombie-Britannique" }],
  ["AB", { en: "Alberta", fr: "Alberta" }],
  ["ON", { en: "Ontario", fr: "Ontario" }],
  ["QC", { en: "Québec", fr: "Québec" }],
]);

const PRODUCT_ID = "boundary-overlays-v3";
const PROVINCE_CLIP = Object.freeze({
  operation: "intersection",
  boundaryRelativePath: "raw/statcan-boundaries/2026-08-12/lpr_000b21a_e.zip",
  boundarySha256: "d28bbb15d7b49e3d1828755a5f1b4ebcee699ad70efe8b0f1b902d29ebffd20b",
  boundaryLayer: "lpr_000b21a_e",
  boundaryFilter: "PRUID IN ('24','35','48','59')",
  provinceIds: ["24", "35", "48", "59"],
  boundaryFeatureCount: 4,
  boundarySourceCrs: "EPSG:3347",
  outputCrs: "EPSG:4326",
  appliesTo: ["economic-regions", "watersheds"],
});
const CLIPPED_OVERLAYS = new Set(PROVINCE_CLIP.appliesTo);

function sameArray(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function validateClipTransform(transform) {
  const clip = transform?.clip;
  if (!clip || typeof clip !== "object") {
    throw new Error("Boundary overlay release must record its province clip transform.");
  }
  for (const field of ["boundaryRelativePath", "boundarySha256", "boundaryLayer", "boundaryFilter", "boundarySourceCrs", "outputCrs"]) {
    if (clip[field] !== PROVINCE_CLIP[field]) {
      throw new Error(`Province clip metadata ${field} changed.`);
    }
  }
  if (clip.operation !== PROVINCE_CLIP.operation) {
    throw new Error("Province clip operation must be a geometry intersection.");
  }
  if (!/^[a-f0-9]{64}$/.test(clip.boundarySha256 ?? "")) {
    throw new Error("Province clip boundary must carry a SHA-256 checksum.");
  }
  if (clip.boundaryFeatureCount !== PROVINCE_CLIP.boundaryFeatureCount) {
    throw new Error("Province clip boundary must contain four province features.");
  }
  if (!sameArray(clip.provinceIds, PROVINCE_CLIP.provinceIds)) {
    throw new Error("Province clip must select PRUIDs 24, 35, 48 and 59 in that order.");
  }
  if (!sameArray(clip.appliesTo, PROVINCE_CLIP.appliesTo)) {
    throw new Error("Province clip must apply exactly to economic regions and watersheds.");
  }
}

export function validateBoundaryOverlays(release, source, readback) {
  if (release?.schemaVersion !== "witness-tree/boundary-overlay-release/1") {
    throw new Error("Boundary overlay release must be a version 1 record.");
  }
  if (release.productId !== PRODUCT_ID) {
    throw new Error(`Boundary overlay release must be ${PRODUCT_ID}.`);
  }
  validateClipTransform(release.transform);
  if (!/^[a-f0-9]{64}$/.test(release.releaseId ?? "")) {
    throw new Error("Boundary overlay release id must be a SHA-256 digest.");
  }
  if (!release.base?.endsWith(`/${release.releaseId}/tiles`)) {
    throw new Error("Boundary overlay base must address the release id.");
  }
  if (!source.includes(release.releaseId)) {
    throw new Error("lib/explore/boundaries.ts does not pin the published release id.");
  }
  if (!source.includes(release.base)) {
    throw new Error("lib/explore/boundaries.ts does not pin the published release base.");
  }

  if (!Array.isArray(release.archives) || release.archives.length === 0) {
    throw new Error("Boundary overlay release must publish at least one archive.");
  }
  if (readback) {
    if (readback.schemaVersion !== "witness-tree/boundary-overlay-release-readback/1" || readback.releaseId !== release.releaseId) {
      throw new Error("Boundary overlay readback does not bind the published release.");
    }
    if (readback.s3ExactReadback !== true || readback.cloudFrontExactReadback !== true) {
      throw new Error("Boundary overlay release has not passed both exact remote readbacks.");
    }
    const observed = new Map(readback.archives.map((archive) => [archive.fileName, archive]));
    for (const archive of release.archives) {
      const match = observed.get(archive.fileName);
      if (!match || match.byteLength !== archive.byteLength || match.sha256 !== archive.sha256) {
        throw new Error(`Boundary overlay readback does not match ${archive.fileName}.`);
      }
    }
    if (observed.size !== release.archives.length) {
      throw new Error("Boundary overlay readback contains an unexpected archive.");
    }
  }
  for (const archive of release.archives) {
    if (!/^[a-f0-9]{64}$/.test(archive?.sha256 ?? "")) {
      throw new Error(`Archive ${archive?.fileName} has no valid checksum.`);
    }
    if (!Number.isInteger(archive.byteLength) || archive.byteLength <= 0) {
      throw new Error(`Archive ${archive.fileName} has no byte length.`);
    }
    const clipped = CLIPPED_OVERLAYS.has(archive.overlay);
    if (archive.clippedToProvinceBoundary !== clipped) {
      throw new Error(`Archive ${archive.fileName} has incorrect province clip metadata.`);
    }
    if (!archive.url?.startsWith(`${release.base}/`)) {
      throw new Error(`Archive ${archive.fileName} is not served from the release base.`);
    }
    if (!source.includes(archive.fileName)) {
      throw new Error(`lib/explore/boundaries.ts does not reference ${archive.fileName}.`);
    }
    // The tiler names the layer and the style asks for it by name. A mismatch
    // draws nothing at all and reports no error, so it is checked here rather
    // than left to be noticed on the map.
    if (!source.includes(`"${archive.layer}"`)) {
      throw new Error(`lib/explore/boundaries.ts does not name the source layer ${archive.layer}.`);
    }
  }

  // Feature counts must reconcile to the sources they were built from.
  const perOverlay = new Map();
  for (const entry of release.sources ?? []) {
    if (!Number.isInteger(entry.inputFeatureCount) || entry.inputFeatureCount <= 0) {
      throw new Error(`${entry.id} must record its positive input feature count.`);
    }
    if (!Number.isInteger(entry.inputDistinctCount) || entry.inputDistinctCount <= 0) {
      throw new Error(`${entry.id} must record its positive input distinct-identifier count.`);
    }
    if (!Number.isInteger(entry.featureCount) || entry.featureCount <= 0) {
      throw new Error(`${entry.id} must record its positive output feature count.`);
    }
    if (!Number.isInteger(entry.districtCount) || entry.districtCount <= 0) {
      throw new Error(`${entry.id} must record its positive output distinct-identifier count.`);
    }
    if (entry.inputFeatureCount < entry.featureCount || entry.inputDistinctCount < entry.districtCount) {
      throw new Error(`${entry.id} output counts cannot exceed the input counts.`);
    }
    const clipped = CLIPPED_OVERLAYS.has(entry.overlay);
    if (entry.clippedToProvinceBoundary !== clipped) {
      throw new Error(`${entry.id} has incorrect province clip metadata.`);
    }
    if (clipped && (
      !Number.isInteger(entry.selectedFeatureCount) ||
      entry.selectedFeatureCount <= 0 ||
      entry.selectedFeatureCount > entry.inputFeatureCount ||
      entry.featureCount > entry.selectedFeatureCount ||
      entry.districtCount > entry.selectedFeatureCount
    )) {
      throw new Error(`${entry.id} must preserve its pre-clip selected and output feature counts.`);
    }
    perOverlay.set(entry.overlay, (perOverlay.get(entry.overlay) ?? 0) + entry.featureCount);
  }
  for (const archive of release.archives) {
    const expected = perOverlay.get(archive.overlay);
    if (expected !== archive.featureCount) {
      throw new Error(
        `${archive.overlay} publishes ${archive.featureCount} features but its sources total ${expected}.`,
      );
    }
  }

  const provincial = (release.sources ?? []).filter(
    (entry) => entry.overlay === "provincial-ridings",
  );
  if (provincial.length === 0) throw new Error("No provincial riding sources are recorded.");
  for (const entry of provincial) {
    const names = JURISDICTION_NAMES.get(entry.jurisdiction);
    if (!names) throw new Error(`Unknown provincial jurisdiction ${entry.jurisdiction}.`);
    for (const locale of ["en", "fr"]) {
      if (!source.includes(names[locale])) {
        throw new Error(
          `The provincial overlay publishes ${entry.jurisdiction} but the ${locale} coverage note does not name it.`,
        );
      }
    }
  }

  // An overlay that is not available must not carry a URL, and must say why.
  for (const match of source.matchAll(/available: false,([\s\S]*?)\n {4}\},/g)) {
    if (/\burl:/.test(match[1])) {
      throw new Error("An unavailable overlay must not declare a tile URL.");
    }
    if (!/reason: \{/.test(match[1])) {
      throw new Error("An unavailable overlay must state a reason.");
    }
  }
  return { releaseId: release.releaseId, archives: release.archives.length, provincial: provincial.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const release = JSON.parse(await readFile(new URL("../data/boundary-overlay-release.json", import.meta.url), "utf8"));
  const readback = JSON.parse(await readFile(new URL("../data/boundary-overlay-release-readback.json", import.meta.url), "utf8"));
  const source = await readFile(new URL("../lib/explore/boundaries.ts", import.meta.url), "utf8");
  const result = validateBoundaryOverlays(release, source, readback);
  process.stdout.write(
    `Boundary overlays: ${result.archives} archives, ${result.provincial} provincial sources, release ${result.releaseId.slice(0, 12)}.\n`,
  );
}
