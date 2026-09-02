/**
 * Reader for the packed coarse-grid tiles.
 *
 * The layout is fixed by scripts/phase6_pack_coarse_grid.py.  This reader is
 * deliberately strict: a tile whose header, block count, or trailing length
 * does not agree with itself is refused rather than partially decoded, because
 * a silently short read would produce a confident wrong number.
 */

/** Year-to-year steps, 1984-1985 through 2021-2022. */
export const STEPS = 38;
export const FIRST_STEP_YEAR = 1984;
/** Blocks along one edge of a tile. */
export const TILE_BLOCKS = 64;
/** 30 m cells in a 32 x 32 block. */
export const BLOCK_CELLS = 1024;
const MAGIC = 0x57544731; // "WTG1"
const BLOCK_FIXED_BYTES = 2 + 4 + STEPS * 2 + STEPS * 2 + 2;
const PAIR_BYTES = 4;

export type PackedBlock = Readonly<{
  gx: number;
  gy: number;
  countableCells: number;
  mappedCells: number;
  forestKnownCells: readonly number[];
  annualLossCells: readonly number[];
  /** Consecutive loss-step pairs, as [firstStep, secondStep, cells]. */
  pairs: readonly (readonly [number, number, number])[];
}>;

export class TileFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TileFormatError";
  }
}

export function tileName(tileX: number, tileY: number): string {
  return `${tileY}-${tileX}.bin.gz`;
}

/** The tile a block belongs to. */
export function tileForBlock(gx: number, gy: number): { tileX: number; tileY: number } {
  return { tileX: Math.floor(gx / TILE_BLOCKS), tileY: Math.floor(gy / TILE_BLOCKS) };
}

export async function gunzip(data: ArrayBuffer): Promise<Uint8Array> {
  const stream = new Response(data).body;
  if (!stream) throw new TileFormatError("The tile had no body to decompress.");
  const decompressed = stream.pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(decompressed).arrayBuffer());
}

/**
 * Decodes one tile into its blocks.  Blocks absent from a tile were never
 * countable anywhere in the block; a block present with zero countable cells
 * is a different fact and is kept.
 */
export function decodeTile(raw: Uint8Array): { tileX: number; tileY: number; blocks: PackedBlock[] } {
  if (raw.byteLength < 10) throw new TileFormatError("The tile is shorter than its own header.");
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (view.getUint32(0, false) !== MAGIC) throw new TileFormatError("The tile is not a coarse-grid tile.");
  const tileX = view.getUint16(4, true);
  const tileY = view.getUint16(6, true);
  const blockCount = view.getUint16(8, true);

  const blocks: PackedBlock[] = [];
  let offset = 10;
  for (let index = 0; index < blockCount; index += 1) {
    if (offset + BLOCK_FIXED_BYTES > raw.byteLength) {
      throw new TileFormatError("The tile ends inside a block.");
    }
    const dx = view.getUint8(offset);
    const dy = view.getUint8(offset + 1);
    if (dx >= TILE_BLOCKS || dy >= TILE_BLOCKS) {
      throw new TileFormatError("A block claims a position outside its own tile.");
    }
    const countableCells = view.getUint16(offset + 2, true);
    const mappedCells = view.getUint16(offset + 4, true);
    if (countableCells > BLOCK_CELLS || mappedCells > BLOCK_CELLS) {
      throw new TileFormatError("A block counts more cells than a block holds.");
    }
    let cursor = offset + 6;
    const forestKnownCells: number[] = [];
    for (let step = 0; step < STEPS; step += 1, cursor += 2) forestKnownCells.push(view.getUint16(cursor, true));
    const annualLossCells: number[] = [];
    for (let step = 0; step < STEPS; step += 1, cursor += 2) annualLossCells.push(view.getUint16(cursor, true));
    const pairCount = view.getUint16(cursor, true);
    cursor += 2;
    if (cursor + pairCount * PAIR_BYTES > raw.byteLength) {
      throw new TileFormatError("The tile ends inside a block's pair list.");
    }
    const pairs: [number, number, number][] = [];
    for (let pair = 0; pair < pairCount; pair += 1, cursor += PAIR_BYTES) {
      const first = view.getUint8(cursor);
      const second = view.getUint8(cursor + 1);
      const cells = view.getUint16(cursor + 2, true);
      if (!(first < second && second < STEPS)) {
        throw new TileFormatError("A block carries a pair outside the recorded steps.");
      }
      if (cells > BLOCK_CELLS) {
        throw new TileFormatError("A block carries a pair count larger than the block.");
      }
      pairs.push([first, second, cells]);
    }
    blocks.push({
      gx: tileX * TILE_BLOCKS + dx,
      gy: tileY * TILE_BLOCKS + dy,
      countableCells,
      mappedCells,
      forestKnownCells,
      annualLossCells,
      pairs,
    });
    offset = cursor;
  }
  if (offset !== raw.byteLength) {
    throw new TileFormatError("The tile carries bytes after its last block.");
  }
  return { tileX, tileY, blocks };
}
