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

export function validateBoundaryOverlays(release, source) {
  if (release?.schemaVersion !== "witness-tree/boundary-overlay-release/1") {
    throw new Error("Boundary overlay release must be a version 1 record.");
  }
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
  for (const archive of release.archives) {
    if (!/^[a-f0-9]{64}$/.test(archive?.sha256 ?? "")) {
      throw new Error(`Archive ${archive?.fileName} has no valid checksum.`);
    }
    if (!Number.isInteger(archive.byteLength) || archive.byteLength <= 0) {
      throw new Error(`Archive ${archive.fileName} has no byte length.`);
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
  const source = await readFile(new URL("../lib/explore/boundaries.ts", import.meta.url), "utf8");
  const result = validateBoundaryOverlays(release, source);
  process.stdout.write(
    `Boundary overlays: ${result.archives} archives, ${result.provincial} provincial sources, release ${result.releaseId.slice(0, 12)}.\n`,
  );
}
