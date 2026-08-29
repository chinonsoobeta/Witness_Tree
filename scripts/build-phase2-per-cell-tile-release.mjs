import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

// Turns the built tile archives into the checksum-bound release record the
// site reads. One archive per interval: the map only ever loads the interval
// the reader has selected, and PMTiles serves that over range requests, so a
// reader downloads the tiles in view rather than an archive.
//
// The release id is the digest of the per-archive digests, so the published
// path changes if any archive changes, and a stale path cannot silently serve
// different bytes.

const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const TILES = path.join(DATA_ROOT, "derived/phase2-per-cell-geometry-1984-2022-v1/tiles");
const DISTRIBUTION = "https://d3g1406o0uekin.cloudfront.net";
const RELEASE = "phase2-per-cell-geometry-v1";

const digest = (file) =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file).on("data", (chunk) => hash.update(chunk)).on("end", () => resolve(hash.digest("hex"))).on("error", reject);
  });

const readback = JSON.parse(await readFile(new URL("../data/phase2-per-cell-geometry-readback.json", import.meta.url), "utf8"));
const built = (await readdir(TILES)).filter((name) => name.endsWith(".pmtiles")).sort();

const intervals = [];
for (const entry of readback.intervals) {
  const name = `${entry.interval}.pmtiles`;
  if (!built.includes(name)) continue;
  const file = path.join(TILES, name);
  intervals.push({
    interval: entry.interval,
    fileName: name,
    byteLength: (await stat(file)).size,
    sha256: await digest(file),
    patchCount: entry.patchCount,
    cellCount: entry.cellCount,
    harvestCells: entry.attribution.harvestCells,
    fireCells: entry.attribution.fireCells,
  });
}

const releaseId = createHash("sha256").update(intervals.map((entry) => `${entry.interval}:${entry.sha256}`).join("\n")).digest("hex");
const base = `${DISTRIBUTION}/releases/${RELEASE}/${releaseId}/tiles`;

await writeFile(
  new URL("../data/phase2-per-cell-tile-release.json", import.meta.url),
  `${JSON.stringify(
    {
      schemaVersion: "witness-tree/phase2-per-cell-tile-release/1",
      releaseId,
      base,
      productId: readback.productId,
      readback: "data/phase2-per-cell-geometry-readback.json",
      minZoom: 8,
      maxZoom: 14,
      generalizedBelowZoom: 14,
      countable: false,
      expertReviewed: false,
      productionEligible: false,
      intervals: intervals.map((entry) => ({ ...entry, url: `${base}/${entry.fileName}` })),
      totals: {
        intervalCount: intervals.length,
        byteLength: intervals.reduce((running, entry) => running + entry.byteLength, 0),
      },
    },
    null,
    2,
  )}\n`,
);
console.log(`${intervals.length} archives, ${(intervals.reduce((r, e) => r + e.byteLength, 0) / 1e9).toFixed(1)} GB, release ${releaseId.slice(0, 12)}`);
