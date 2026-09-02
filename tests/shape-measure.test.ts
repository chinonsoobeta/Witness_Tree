import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SHAPE_TILES,
  MAX_SHAPE_VERTICES,
  SHAPE_FLAG_HEADER,
  SHAPE_MEASURE_PATH,
  coarseGridConfigured,
  handleShapeMeasure,
  withShapeFlag,
} from "../worker/shape";
import { shapeCoverage, type GeographicPoint } from "../lib/shapes/coverage";
import { BLOCK_CELLS, STEPS, TILE_BLOCKS, tileForBlock, tileName } from "../lib/shapes/tiles";
import { CELL_HECTARES } from "../lib/shapes/measure";

const BASE = "https://example.invalid/grid/";

type Bracket = { low: number; estimate: number; high: number };
type Measurement = {
  unionHectares: Bracket;
  sumHectares: Bracket;
  forestHectares: Bracket;
  unionShareOfForest: number | null;
  coverage: {
    blocks: number;
    interiorBlocks: number;
    edgeBlocks: number;
    blocksWithoutData: number;
    edgeShareOfEstimate: number;
  };
  precision: { blockMetres: number; exact: boolean };
};

async function measurementOf(response: Response): Promise<Measurement> {
  return (await response.json()) as Measurement;
}
const point = (latitude: number, longitude: number): GeographicPoint => ({ latitude, longitude });

/** A small box near Ottawa, well inside the mapped area. */
const BOX: GeographicPoint[] = [
  point(45.40, -75.72),
  point(45.40, -75.66),
  point(45.44, -75.66),
  point(45.44, -75.72),
];

type BlockSpec = {
  gx: number;
  gy: number;
  countable?: number;
  mapped?: number;
  forest?: number[];
  loss?: number[];
  pairs?: [number, number, number][];
};

function encodeBlock(spec: BlockSpec): Uint8Array {
  const forest = spec.forest ?? new Array<number>(STEPS).fill(BLOCK_CELLS);
  const loss = spec.loss ?? new Array<number>(STEPS).fill(0);
  const pairs = spec.pairs ?? [];
  const bytes = new Uint8Array(2 + 4 + STEPS * 4 + 2 + pairs.length * 4);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, spec.gx % TILE_BLOCKS);
  view.setUint8(1, spec.gy % TILE_BLOCKS);
  view.setUint16(2, spec.countable ?? BLOCK_CELLS, true);
  view.setUint16(4, spec.mapped ?? BLOCK_CELLS, true);
  let cursor = 6;
  for (const value of forest) { view.setUint16(cursor, value, true); cursor += 2; }
  for (const value of loss) { view.setUint16(cursor, value, true); cursor += 2; }
  view.setUint16(cursor, pairs.length, true);
  cursor += 2;
  for (const [first, second, cells] of pairs) {
    view.setUint8(cursor, first);
    view.setUint8(cursor + 1, second);
    view.setUint16(cursor + 2, cells, true);
    cursor += 4;
  }
  return bytes;
}

function encodeTile(tileX: number, tileY: number, specs: BlockSpec[]): Uint8Array {
  const blocks = specs.map(encodeBlock);
  const total = blocks.reduce((sum, block) => sum + block.byteLength, 0);
  const raw = new Uint8Array(10 + total);
  raw.set([0x57, 0x54, 0x47, 0x31], 0); // "WTG1"
  const view = new DataView(raw.buffer);
  view.setUint16(4, tileX, true);
  view.setUint16(6, tileY, true);
  view.setUint16(8, specs.length, true);
  let cursor = 10;
  for (const block of blocks) { raw.set(block, cursor); cursor += block.byteLength; }
  return raw;
}

function bodyOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function gzipped(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(bodyOf(raw)).body!.pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A stand-in CDN serving the tiles a test builds, and 404 for the rest. */
function servingTiles(
  tiles: Map<string, Uint8Array>,
  options: { status?: number; trailing?: boolean } = {},
) {
  const seen: string[] = [];
  const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    seen.push(url);
    const name = url.slice(url.lastIndexOf("/") + 1);
    const body = tiles.get(name);
    if (!body) return new Response(null, { status: 404 });
    if (options.status && options.status !== 200) return new Response(bodyOf(body), { status: options.status });
    return new Response(bodyOf(body), { status: 200 });
  };
  return { fetcher: fetcher as unknown as typeof fetch, seen };
}

function measureRequest(body: unknown, method = "POST"): Request {
  return new Request(`https://example.invalid${SHAPE_MEASURE_PATH}`, {
    method,
    body: method === "POST" ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json" },
  });
}

/** Builds tiles covering every block the shape touches, with one spec each. */
async function tilesFor(
  shape: GeographicPoint[],
  spec: (gx: number, gy: number) => Omit<BlockSpec, "gx" | "gy"> | null,
): Promise<Map<string, Uint8Array>> {
  const coverage = shapeCoverage(shape);
  const grouped = new Map<string, BlockSpec[]>();
  for (const block of coverage.blocks) {
    const detail = spec(block.gx, block.gy);
    if (!detail) continue;
    const tile = tileForBlock(block.gx, block.gy);
    const key = `${tile.tileX},${tile.tileY}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({ gx: block.gx, gy: block.gy, ...detail });
  }
  const tiles = new Map<string, Uint8Array>();
  for (const [key, specs] of grouped) {
    const [tileX, tileY] = key.split(",").map(Number);
    tiles.set(tileName(tileX, tileY), await gzipped(encodeTile(tileX, tileY, specs)));
  }
  return tiles;
}

test("a cell disturbed twice counts once in the union and twice in the sum", async () => {
  // Ten cells lost at step 5, ten at step 6, and they are the same ten cells,
  // which the consecutive pair records. The window spans both steps.
  const loss = new Array<number>(STEPS).fill(0);
  loss[5] = 10;
  loss[6] = 10;
  const tiles = await tilesFor(BOX, () => ({ loss, pairs: [[5, 6, 10]] }));
  const { fetcher } = servingTiles(tiles);
  const response = await handleShapeMeasure(
    measureRequest({ points: BOX, startYear: 1989, endYear: 1991 }),
    { COARSE_GRID_BASE: BASE },
    { fetch: fetcher },
  );
  assert.equal(response.status, 200);
  const body = await measurementOf(response);

  const coverage = shapeCoverage(BOX);
  let weighted = 0;
  for (const block of coverage.blocks) weighted += block.fraction;
  assert.ok(
    Math.abs(body.sumHectares.estimate - weighted * 20 * CELL_HECTARES) < 1e-6,
    `sum was ${body.sumHectares.estimate}`,
  );
  assert.ok(
    Math.abs(body.unionHectares.estimate - weighted * 10 * CELL_HECTARES) < 1e-6,
    `union was ${body.unionHectares.estimate}`,
  );
  // The union is the honest half of the pair, so it is exactly half the sum here.
  assert.ok(body.unionHectares.estimate * 2 - body.sumHectares.estimate < 1e-6);
});

test("the answer brackets its estimate between interior-only and whole-block bounds", async () => {
  const loss = new Array<number>(STEPS).fill(0);
  loss[10] = 100;
  const tiles = await tilesFor(BOX, () => ({ loss }));
  const { fetcher } = servingTiles(tiles);
  const response = await handleShapeMeasure(
    measureRequest({ points: BOX, startYear: 1994, endYear: 1995 }),
    { COARSE_GRID_BASE: BASE },
    { fetch: fetcher },
  );
  const body = await measurementOf(response);
  assert.ok(body.unionHectares.low < body.unionHectares.estimate);
  assert.ok(body.unionHectares.estimate < body.unionHectares.high);
  assert.equal(body.precision.blockMetres, 960);
  assert.equal(body.precision.exact, false);
  assert.ok(body.coverage.edgeBlocks > 0);
  assert.ok(body.coverage.edgeShareOfEstimate > 0 && body.coverage.edgeShareOfEstimate < 1);
});

test("a block absent from a tile is missing data, not zero loss", async () => {
  const loss = new Array<number>(STEPS).fill(0);
  loss[10] = 100;
  // Half the blocks are written and half are left out. An absent block was
  // never countable; writing it as zero would claim nothing was lost there.
  let index = 0;
  const tiles = await tilesFor(BOX, () => {
    index += 1;
    return index % 2 === 0 ? { loss } : null;
  });
  const { fetcher } = servingTiles(tiles);
  const response = await handleShapeMeasure(
    measureRequest({ points: BOX, startYear: 1994, endYear: 1995 }),
    { COARSE_GRID_BASE: BASE },
    { fetch: fetcher },
  );
  assert.equal(response.status, 200);
  const body = await measurementOf(response);
  assert.ok(body.coverage.blocksWithoutData > 0, "no blocks were reported as missing");
  assert.ok(body.coverage.blocksWithoutData < body.coverage.blocks, "every block was missing");
  assert.equal(body.precision.exact, false);
});

test("a tile the grid never wrote answers 404 without failing the measurement", async () => {
  const { fetcher, seen } = servingTiles(new Map());
  const response = await handleShapeMeasure(
    measureRequest({ points: BOX, startYear: 1994, endYear: 1995 }),
    { COARSE_GRID_BASE: BASE },
    { fetch: fetcher },
  );
  assert.equal(response.status, 200);
  assert.ok(seen.length > 0);
  const body = await measurementOf(response);
  assert.equal(body.coverage.blocksWithoutData, body.coverage.blocks);
  assert.equal(body.unionHectares.estimate, 0);
  assert.equal(body.unionShareOfForest, null);
});

test("the shape never appears in a URL", async () => {
  const tiles = await tilesFor(BOX, () => ({}));
  const { fetcher, seen } = servingTiles(tiles);
  await handleShapeMeasure(
    measureRequest({ points: BOX, startYear: 1994, endYear: 1995 }),
    { COARSE_GRID_BASE: BASE },
    { fetch: fetcher },
  );
  assert.ok(seen.length > 0, "no tile was fetched");
  for (const url of seen) {
    assert.match(url, /\/\d+-\d+\.bin\.gz$/, `a tile URL carried something else: ${url}`);
    assert.ok(!url.includes("45."), `a URL carried a latitude: ${url}`);
    assert.ok(!url.includes("-75."), `a URL carried a longitude: ${url}`);
    assert.ok(!url.includes("?"), `a URL carried a query string: ${url}`);
  }
});

test("the route refuses what it cannot answer instead of guessing", async () => {
  const tiles = await tilesFor(BOX, () => ({}));
  const { fetcher } = servingTiles(tiles);
  const env = { COARSE_GRID_BASE: BASE };
  const call = (body: unknown, method = "POST") =>
    handleShapeMeasure(measureRequest(body, method), env, { fetch: fetcher });

  assert.equal((await call({}, "GET")).status, 405);
  assert.equal(
    (await handleShapeMeasure(measureRequest({ points: BOX, startYear: 1994, endYear: 1995 }), {}, { fetch: fetcher }))
      .status,
    503,
  );
  assert.equal((await call({ points: BOX })).status, 400);
  assert.equal((await call({ points: [], startYear: 1994, endYear: 1995 })).status, 400);
  assert.equal((await call({ points: BOX, startYear: 1994.5, endYear: 1995 })).status, 400);
  assert.equal(
    (await call({ points: new Array(MAX_SHAPE_VERTICES + 1).fill(BOX[0]), startYear: 1994, endYear: 1995 })).status,
    400,
  );

  // Paris is off the grid, and 1970 is before the record starts.
  const paris = [point(48.85, 2.34), point(48.86, 2.34), point(48.86, 2.35)];
  assert.equal((await call({ points: paris, startYear: 1994, endYear: 1995 })).status, 422);
  const outOfRange = await call({ points: BOX, startYear: 1970, endYear: 1995 });
  assert.equal(outOfRange.status, 422);
  assert.equal(((await outOfRange.json()) as { kind: string }).kind, "window");
  const backwards = await call({ points: BOX, startYear: 1995, endYear: 1994 });
  assert.equal(backwards.status, 422);
});

test("a tile the CDN mangles is refused rather than partly decoded", async () => {
  const good = await tilesFor(BOX, () => ({}));
  const name = [...good.keys()][0];

  const truncated = new Map(good);
  const body = good.get(name)!;
  truncated.set(name, body.slice(0, body.byteLength - 8));
  const short = await handleShapeMeasure(
    measureRequest({ points: BOX, startYear: 1994, endYear: 1995 }),
    { COARSE_GRID_BASE: BASE },
    { fetch: servingTiles(truncated).fetcher },
  );
  assert.equal(short.status, 502);

  // Bytes after the last block mean the reader and the writer disagree.
  const trailing = new Map(good);
  trailing.set(name, await gzipped(new Uint8Array([...encodeTile(0, 0, []), 1, 2, 3])));
  const extra = await handleShapeMeasure(
    measureRequest({ points: BOX, startYear: 1994, endYear: 1995 }),
    { COARSE_GRID_BASE: BASE },
    { fetch: servingTiles(trailing).fetcher },
  );
  assert.equal(extra.status, 502);

  const wrongMagic = new Map(good);
  wrongMagic.set(name, await gzipped(new Uint8Array(20)));
  const magic = await handleShapeMeasure(
    measureRequest({ points: BOX, startYear: 1994, endYear: 1995 }),
    { COARSE_GRID_BASE: BASE },
    { fetch: servingTiles(wrongMagic).fetcher },
  );
  assert.equal(magic.status, 502);
});

test("an uncompressed tile is read as readily as a gzipped one", async () => {
  const coverage = shapeCoverage(BOX);
  const tile = tileForBlock(coverage.blocks[0].gx, coverage.blocks[0].gy);
  const specs = coverage.blocks
    .filter((block) => {
      const owner = tileForBlock(block.gx, block.gy);
      return owner.tileX === tile.tileX && owner.tileY === tile.tileY;
    })
    .map((block) => ({ gx: block.gx, gy: block.gy }));
  const plain = new Map([[tileName(tile.tileX, tile.tileY), encodeTile(tile.tileX, tile.tileY, specs)]]);
  const response = await handleShapeMeasure(
    measureRequest({ points: BOX, startYear: 1994, endYear: 1995 }),
    { COARSE_GRID_BASE: BASE },
    { fetch: servingTiles(plain).fetcher },
  );
  assert.equal(response.status, 200);
});

test("the flag says whether the grid is configured, and overwrites a caller's claim", () => {
  assert.equal(coarseGridConfigured({}), false);
  assert.equal(coarseGridConfigured({ COARSE_GRID_BASE: BASE }), true);
  const lying = new Request("https://example.invalid/en", { headers: { [SHAPE_FLAG_HEADER]: "on" } });
  assert.equal(withShapeFlag(lying, false).headers.get(SHAPE_FLAG_HEADER), "off");
  assert.equal(withShapeFlag(lying, true).headers.get(SHAPE_FLAG_HEADER), "on");
  assert.ok(MAX_SHAPE_TILES > 0);
});
