/**
 * The gate over the coarse grid record, watched refusing.
 *
 * Each test here changes exactly one fact and asserts the verifier says no.
 * The facts chosen are the ones that would let a wrong number through looking
 * exactly like a right one: a proof that skipped windows, a proof run against a
 * different extraction, a tile too short for the blocks it claims, a packer
 * that has been edited since the tiles were written.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { TILE_BLOCKS, STEPS, BLOCK_CELLS } from "../lib/shapes/tiles";
import { readSources, verifyCoarseGridTiles, type Sources } from "../scripts/check-coarse-grid-tiles.mjs";

const root = new URL("../", import.meta.url);
const sources = readSources();
const record = sources.record;

function changed(mutate: (draft: Sources) => void): Sources {
  const draft: Sources = {
    record: structuredClone(record),
    decoder: sources.decoder,
    runner: sources.runner,
    packerBytes: sources.packerBytes,
    districtIndex: structuredClone(sources.districtIndex),
  };
  mutate(draft);
  return draft;
}

function refused(mutate: (draft: Sources) => void, expected: RegExp): void {
  assert.throws(() => verifyCoarseGridTiles(changed(mutate)), expected);
}

test("the record as committed passes, and says what it covers", () => {
  const summary = verifyCoarseGridTiles(sources);
  assert.match(summary, /pair identity holds over all 741 windows/);
  assert.match(summary, /nothing is claimed as production eligible/);
});

test("a proof that did not hold, or that found a mismatch, is refused", () => {
  refused((draft) => {
    draft.record.pairIdentity.identityHolds = false;
  }, /pair identity did not hold/);
  refused((draft) => {
    draft.record.pairIdentity.mismatches = [{ window: [3, 7] }];
  }, /1 mismatches/);
});

test("a proof that skipped windows is refused, and so is a year range shortened to match it", () => {
  refused((draft) => {
    draft.record.pairIdentity.windowsChecked = 740;
  }, /A partial proof is not a proof/);
  refused((draft) => {
    draft.record.lastYear = 2021;
    draft.record.pairIdentity.windowsChecked = 703;
  }, /37 year-to-year steps, but the record claims 38/);
});

test("a proof run against a different extraction than the one packed is refused", () => {
  refused((draft) => {
    draft.record.pairIdentity.blocksRead = record.blocksPacked - 1;
  }, /must be the same extraction/);
  refused((draft) => {
    draft.record.pairIdentity.countableCells = record.countableCells - 1;
  }, /did not read the same source/);
  refused((draft) => {
    draft.record.pairIdentity.methodVersion = "coarse-grid-960m-union-and-sum-1984-2022-v2";
  }, /different method versions/);
});

test("a record that claims production eligibility, release, admission or review is refused", () => {
  for (const claim of ["admitted", "expertReviewed", "productionEligible", "released"]) {
    refused((draft) => {
      draft.record.claims[claim] = true;
    }, new RegExp(`must record ${claim} as false`));
  }
});

test("a packer edited since the tiles were written invalidates the record", () => {
  refused((draft) => {
    draft.packerBytes = new Uint8Array([...draft.packerBytes, 0x0a]);
  }, /Repack rather than editing the record/);
});

test("a tile index that double counts, misnames, or under-sizes a tile is refused", () => {
  refused((draft) => {
    draft.record.tiles[1] = { ...draft.record.tiles[1]!, tileX: draft.record.tiles[0]!.tileX, tileY: draft.record.tiles[0]!.tileY };
  }, /appears twice/);
  refused((draft) => {
    draft.record.tiles[0]!.file = "tile-0.bin.gz";
  }, /not the name the reader will ask for/);
  refused((draft) => {
    draft.record.tiles[0]!.rawBytes = 11;
  }, /too short to hold/);
  refused((draft) => {
    draft.record.tiles[0]!.tileX = record.tilesAcross;
  }, /sits outside/);
  refused((draft) => {
    draft.record.tiles[0]!.blocks -= 1;
  }, /blocks between them, but the pack recorded/);
});

test("a tile set whose bytes do not add up to the recorded total is refused", () => {
  refused((draft) => {
    draft.record.tiles[0]!.bytes += 1;
  }, /bytes between them, but the pack recorded/);
  refused((draft) => {
    draft.record.tilesWritten = record.tiles.length - 1;
  }, /but lists/);
});

test("softening an absent block into a zero is refused on both sides", () => {
  refused((draft) => {
    draft.record.encoding.absentBlockMeaning = "no loss in the block";
  }, /absent block is not the same as a zero/);
  refused((draft) => {
    draft.decoder = draft.decoder.replace("a block present with zero countable cells", "an empty block");
  }, /different facts/);
});

test("a record on a different grid from the district index is refused", () => {
  refused((draft) => {
    draft.districtIndex.gridWidth = record.gridWidth - 1;
  }, /different grids/);
  refused((draft) => {
    draft.record.blockMetres = 480;
  }, /the app uses 960 m/);
});

test("counts larger than the geometry allows are refused", () => {
  refused((draft) => {
    draft.record.countableCells = record.blocksPacked * BLOCK_CELLS + 1;
    draft.record.pairIdentity.countableCells = draft.record.countableCells;
  }, /cannot fit in/);
  refused((draft) => {
    draft.record.pairIdentity.cellsWithAnyLoss = record.countableCells + 1;
  }, /More cells lost forest than were countable/);
});

test("a runner that could overwrite or resume its own output is refused", () => {
  refused((draft) => {
    draft.runner = draft.runner.replace("set -C", "");
  }, /must write its completion marker with set -C/);
  refused((draft) => {
    draft.runner = draft.runner.replace("the tile output set is incomplete", "resuming");
  }, /refuse a partial output set/);
  refused((draft) => {
    // Leaving the comment that mentions the prover, and removing only the line
    // that runs it, is the failure this rule exists to catch.
    draft.runner = draft.runner.replace(/^\s*python3\s+"\$HERE\/phase6_prove_pair_identity\.py".*$/m, "  true \\");
  }, /proven on every build rather than remembered/);
});

test("the committed index tiles the country once, counted independently of the gate", () => {
  const seen = new Set<string>();
  let blocks = 0;
  let bytes = 0;
  for (const tile of record.tiles) {
    seen.add(`${tile.tileX},${tile.tileY}`);
    assert.ok(tile.tileX < record.tilesAcross && tile.tileY < record.tilesDown);
    assert.ok(tile.blocks >= 1 && tile.blocks <= TILE_BLOCKS * TILE_BLOCKS);
    blocks += tile.blocks;
    bytes += tile.bytes;
  }
  assert.equal(seen.size, record.tiles.length);
  assert.equal(blocks, record.blocksPacked);
  assert.equal(bytes, record.totalBytes);
  assert.equal(record.pairIdentity.windowsChecked, (STEPS * (STEPS + 1)) / 2);
});

test("the packer this repository carries is the one the record names", () => {
  const bytes = readFileSync(fileURLToPath(new URL("scripts/phase6_pack_coarse_grid.py", root)));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), record.packerSha256);
});
