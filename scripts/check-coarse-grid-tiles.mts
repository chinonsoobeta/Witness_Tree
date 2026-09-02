/**
 * The coarse grid is where a drawn area turns into a number a reader will
 * repeat out loud. The tiles themselves are 497 MB and live on the approved
 * data root, so what this gate can see is the record of what was packed. These
 * are the properties that decide whether that record can be trusted.
 *
 * The one that matters most is the pair identity. The union figure a reader
 * sees is computed as sum minus overcount, and that subtraction is only valid
 * because the identity was proven to hold over every one of the 741 year
 * windows. If the proof were partial, or run against a different extraction
 * than the one that was packed, every union percentage on the page would be
 * quietly wrong and would look exactly as confident as a right one.
 *
 * The rules are exported as one function so the tests can feed it a record
 * with one fact changed and watch it refuse. A gate nobody has watched refuse
 * anything is not yet known to be a gate.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { BLOCK_METRES, BLOCK_PIXELS, GRID_BLOCK_HEIGHT, GRID_BLOCK_WIDTH } from "../lib/grid/lambert";
import { BLOCK_CELLS, FIRST_STEP_YEAR, STEPS, TILE_BLOCKS, tileName } from "../lib/shapes/tiles";

export const RECORD_PATH = "data/phase6-coarse-grid-tiles.json";
export const PACKER_PATH = "scripts/phase6_pack_coarse_grid.py";
export const PROVER_NAME = "phase6_prove_pair_identity.py";
export const RUNNER_PATH = "scripts/run-phase6-pack-grid.sh";
export const DISTRICT_INDEX_PATH = "data/phase6-district-index.json";

/** Header plus the part of a block whose length does not depend on its pairs. */
const BLOCK_FIXED_BYTES = 2 + 4 + STEPS * 2 + STEPS * 2 + 2;
const TILE_HEADER_BYTES = 10;
const BLOCK_HECTARES = 92.16;
const HEX64 = /^[0-9a-f]{64}$/;

export type Tile = {
  tileX: number;
  tileY: number;
  file: string;
  blocks: number;
  bytes: number;
  rawBytes: number;
  sha256: string;
};

export type GridRecord = {
  annualStepCount: number;
  blockMetres: number;
  blockPixels: number;
  blocksPacked: number;
  cellHectares: number;
  claims: { [claim: string]: boolean };
  completionMarker: { file: string; rule: string; value: string };
  countableCells: number;
  encoding: { absentBlockMeaning: string; block: string; byteOrder: string; compression: string; header: string };
  firstYear: number;
  gridHeight: number;
  gridWidth: number;
  lastYear: number;
  magic: string;
  methodVersion: string;
  packerSha256: string;
  pairIdentity: {
    blocksRead: number;
    cellsWithAnyLoss: number;
    countableCells: number;
    identityHolds: boolean;
    methodVersion: string;
    mismatches: unknown[];
    windowsChecked: number;
  };
  tileBlocks: number;
  tiles: Tile[];
  tilesAcross: number;
  tilesDown: number;
  tilesWritten: number;
  totalBytes: number;
};

export type Sources = {
  record: GridRecord;
  decoder: string;
  runner: string;
  packerBytes: Uint8Array;
  districtIndex: { gridWidth: number; gridHeight: number };
};

const fail = (message: string): never => {
  throw new Error(message);
};

export function verifyCoarseGridTiles({ record, decoder, runner, packerBytes, districtIndex }: Sources): string {
  // 1. Nothing here is admitted, released, reviewed, or production eligible.
  //    The tiles are an engineering artifact and the record says so.
  for (const claim of ["admitted", "expertReviewed", "productionEligible", "released"]) {
    if (record.claims?.[claim] !== false) {
      fail(`${RECORD_PATH} must record ${claim} as false. The coarse grid claims nothing it has not earned.`);
    }
  }

  // 2. The identity holds, everywhere, with nothing skipped. The year range in
  //    the record is what decides how many windows a full proof must cover, so
  //    a shortened proof and a shortened range are both caught here.
  const steps = record.lastYear - record.firstYear;
  if (steps !== record.annualStepCount) {
    fail(`${record.firstYear} to ${record.lastYear} is ${steps} year-to-year steps, but the record claims ${record.annualStepCount}.`);
  }
  const windows = (steps * (steps + 1)) / 2;
  if (record.pairIdentity.identityHolds !== true) {
    fail("The pair identity did not hold. Union cannot be computed as sum minus overcount until it does.");
  }
  if (record.pairIdentity.mismatches.length !== 0) {
    fail(
      `The identity proof recorded ${record.pairIdentity.mismatches.length} mismatches, so the union figure is not safe to publish.`,
    );
  }
  if (record.pairIdentity.windowsChecked !== windows) {
    fail(
      `The proof covered ${record.pairIdentity.windowsChecked} windows, but ${steps} annual steps make ${windows}. A partial proof is not a proof.`,
    );
  }

  // 3. The proof and the pack read the same bytes. A proof over some other
  //    extraction says nothing about the tiles that ship.
  if (record.pairIdentity.blocksRead !== record.blocksPacked) {
    fail(
      `The proof read ${record.pairIdentity.blocksRead} blocks and the packer wrote ${record.blocksPacked}. They must be the same extraction.`,
    );
  }
  if (record.pairIdentity.countableCells !== record.countableCells) {
    fail("The proof and the pack disagree on how many cells are countable, so they did not read the same source.");
  }
  if (record.pairIdentity.methodVersion !== record.methodVersion) {
    fail("The proof and the pack record different method versions.");
  }
  if (record.pairIdentity.cellsWithAnyLoss <= 0) {
    fail(`The proof found no cell that ever lost forest, which cannot be true of this country over ${steps} years.`);
  }

  // 4. The packer in this repository is the packer that wrote the tiles. If
  //    anyone edits it, this record is stale and must be rebuilt, not patched.
  const packerSha = createHash("sha256").update(packerBytes).digest("hex");
  if (packerSha !== record.packerSha256) {
    fail(
      `${PACKER_PATH} now hashes to ${packerSha}, but the tiles were packed by ${record.packerSha256}. Repack rather than editing the record.`,
    );
  }
  // A mention in a comment is not a run. The runner must actually invoke the
  // prover, or the identity would be something the record remembers rather
  // than something this build established.
  if (!new RegExp(`^\\s*python3\\s+"\\$HERE/${PROVER_NAME.replace(".", "\\.")}"`, "m").test(runner)) {
    fail(`${RUNNER_PATH} must run ${PROVER_NAME}, so the identity is proven on every build rather than remembered.`);
  }

  // 5. The tile index is one complete set covering exactly what was packed,
  //    with no tile counted twice and none missing.
  if (record.tiles.length !== record.tilesWritten) {
    fail(`The record names ${record.tilesWritten} tiles but lists ${record.tiles.length}.`);
  }
  const seen = new Set<string>();
  let blockTotal = 0;
  let byteTotal = 0;
  for (const tile of record.tiles) {
    const key = `${tile.tileX},${tile.tileY}`;
    if (seen.has(key)) fail(`Tile ${key} appears twice in the index.`);
    seen.add(key);
    if (tile.tileX < 0 || tile.tileX >= record.tilesAcross || tile.tileY < 0 || tile.tileY >= record.tilesDown) {
      fail(`Tile ${key} sits outside the ${record.tilesAcross} by ${record.tilesDown} tiling it belongs to.`);
    }
    if (tile.file !== tileName(tile.tileX, tile.tileY)) {
      fail(`Tile ${key} is filed as ${tile.file}, which is not the name the reader will ask for.`);
    }
    if (tile.blocks < 1 || tile.blocks > TILE_BLOCKS * TILE_BLOCKS) {
      fail(`Tile ${key} claims ${tile.blocks} blocks, which a ${TILE_BLOCKS} by ${TILE_BLOCKS} tile cannot hold.`);
    }
    if (tile.rawBytes < TILE_HEADER_BYTES + tile.blocks * BLOCK_FIXED_BYTES) {
      fail(`Tile ${key} is too short to hold the ${tile.blocks} blocks it claims, so the reader would run off its end.`);
    }
    if (tile.bytes < 1) fail(`Tile ${key} was written as an empty file.`);
    if (!HEX64.test(tile.sha256)) fail(`Tile ${key} does not carry a sha256 digest.`);
    blockTotal += tile.blocks;
    byteTotal += tile.bytes;
  }
  if (blockTotal !== record.blocksPacked) {
    fail(`The tiles hold ${blockTotal} blocks between them, but the pack recorded ${record.blocksPacked}.`);
  }
  if (byteTotal !== record.totalBytes) {
    fail(`The tiles are ${byteTotal} bytes between them, but the pack recorded ${record.totalBytes}.`);
  }

  // 6. The format the record describes is the format the reader decodes. A
  //    record that drifted from lib/shapes/tiles.ts would be a false map.
  if (record.magic !== "WTG1" || !decoder.includes("0x57544731")) {
    fail("The record and the reader must agree that a tile starts with WTG1.");
  }
  if (record.tileBlocks !== TILE_BLOCKS) {
    fail(`The tiles are ${record.tileBlocks} blocks across; the reader expects ${TILE_BLOCKS}.`);
  }
  if (record.annualStepCount !== STEPS) {
    fail(`The record has ${record.annualStepCount} steps; the reader expects ${STEPS}.`);
  }
  if (record.firstYear !== FIRST_STEP_YEAR) {
    fail(`The record starts at ${record.firstYear}; the reader starts at ${FIRST_STEP_YEAR}.`);
  }
  for (const field of ["dx", "dy", "countable", "mapped", "forest", "loss", "pairCount", "first", "second"]) {
    if (!record.encoding.block.includes(field)) {
      fail(`The encoding description omits ${field}, so it does not describe the block the reader actually decodes.`);
    }
  }
  if (record.encoding.byteOrder !== "little-endian" || !decoder.includes("getUint16(cursor, true)")) {
    fail("The record and the reader must agree that a tile is little-endian.");
  }
  if (record.encoding.compression !== "gzip" || !decoder.includes('DecompressionStream("gzip")')) {
    fail("The record and the reader must agree that a tile is gzipped.");
  }

  // 7. An absent block is not a zero. This is the whole difference between
  //    "no forest was lost here" and "nobody looked here", and a reader cannot
  //    tell them apart unless the artifact keeps them apart.
  if (!/not the same as/i.test(record.encoding.absentBlockMeaning)) {
    fail("The record must say plainly that an absent block is not the same as a zero.");
  }
  if (!decoder.includes("a block present with zero countable cells")) {
    fail("lib/shapes/tiles.ts must keep saying that a present empty block and an absent block are different facts.");
  }

  // 8. The tiles were packed on the grid the app computes on. Two grids would
  //    put a point in one district and its area in another.
  if (record.blockPixels !== BLOCK_PIXELS) {
    fail(`The tiles use ${record.blockPixels} pixel blocks; the app uses ${BLOCK_PIXELS}.`);
  }
  if (record.blockMetres !== BLOCK_METRES) {
    fail(`The tiles use ${record.blockMetres} m blocks; the app uses ${BLOCK_METRES} m.`);
  }
  if (record.gridWidth !== GRID_BLOCK_WIDTH || record.gridHeight !== GRID_BLOCK_HEIGHT) {
    fail(
      `The tiles cover ${record.gridWidth} by ${record.gridHeight} blocks; the app's grid is ${GRID_BLOCK_WIDTH} by ${GRID_BLOCK_HEIGHT}.`,
    );
  }
  if (districtIndex.gridWidth !== record.gridWidth || districtIndex.gridHeight !== record.gridHeight) {
    fail("The district index and the coarse grid are on different grids, so a point and its area would not line up.");
  }
  if (
    Math.ceil(record.gridWidth / TILE_BLOCKS) !== record.tilesAcross ||
    Math.ceil(record.gridHeight / TILE_BLOCKS) !== record.tilesDown
  ) {
    fail("The tiling does not cover the grid it claims to cover.");
  }
  if (Math.abs(record.cellHectares * BLOCK_CELLS - BLOCK_HECTARES) > 1e-9) {
    fail(`A ${record.blockMetres} m block is ${BLOCK_HECTARES} ha, not ${record.cellHectares * BLOCK_CELLS}.`);
  }

  // 9. The counts are inside what the geometry allows. A block cannot hold
  //    more cells than it has, and the country cannot hold more blocks than
  //    the grid.
  if (record.blocksPacked < 1 || record.blocksPacked > record.gridWidth * record.gridHeight) {
    fail(`${record.blocksPacked} blocks does not fit in a ${record.gridWidth} by ${record.gridHeight} grid.`);
  }
  if (record.countableCells < 1 || record.countableCells > record.blocksPacked * BLOCK_CELLS) {
    fail(`${record.countableCells} countable cells cannot fit in ${record.blocksPacked} blocks of ${BLOCK_CELLS}.`);
  }
  if (record.pairIdentity.cellsWithAnyLoss > record.countableCells) {
    fail("More cells lost forest than were countable, which cannot be true.");
  }

  // 10. The run cannot quietly overwrite or resume. A half-written tile set
  //     that looked complete would be the worst outcome here.
  if (!runner.includes("set -C")) {
    fail(`${RUNNER_PATH} must write its completion marker with set -C, so a second run cannot overwrite the first.`);
  }
  if (!runner.includes("the tile output set is incomplete")) {
    fail(`${RUNNER_PATH} must refuse a partial output set rather than filling in around it.`);
  }
  if (!HEX64.test(record.completionMarker.value)) {
    fail("The completion marker is not a sha256 digest.");
  }

  return (
    `coarse grid tiles: ${record.tilesWritten} tiles hold ${record.blocksPacked} blocks of ${record.blockMetres} m ` +
    `over ${record.gridWidth} by ${record.gridHeight}, ${record.countableCells} countable cells, ` +
    `the pair identity holds over all ${record.pairIdentity.windowsChecked} windows, ` +
    `the packer still hashes to its recorded build, and nothing is claimed as production eligible.`
  );
}

export function readSources(): Sources {
  const root = new URL("../", import.meta.url);
  const bytes = (path: string) => readFileSync(fileURLToPath(new URL(path, root)));
  const text = (path: string) => bytes(path).toString("utf8");
  return {
    record: JSON.parse(text(RECORD_PATH)) as GridRecord,
    decoder: text("lib/shapes/tiles.ts"),
    runner: text(RUNNER_PATH),
    packerBytes: bytes(PACKER_PATH),
    districtIndex: JSON.parse(text(DISTRICT_INDEX_PATH)) as { gridWidth: number; gridHeight: number },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(verifyCoarseGridTiles(readSources()));
}
