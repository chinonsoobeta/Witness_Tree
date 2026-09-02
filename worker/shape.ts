/**
 * Measuring a drawn shape against the coarse grid.
 *
 * The shape arrives in the request body and never in a URL, so a shape someone
 * drew around their own property does not end up in a log line or a referrer.
 * Nothing here logs its input.
 *
 * Counts come from the packed grid tiles, never from the map tiles the person
 * is looking at. The rendered tiles are simplified for drawing and would give a
 * plausible wrong number; the grid is the same aggregation the rest of the
 * product reports from.
 *
 * The answer states its own precision. The grid answers per 960 m block, so a
 * shape whose edge cuts blocks gets a bracketed estimate rather than a single
 * number pretending to be exact.
 */

import {
  MAX_SHAPE_BLOCKS,
  MAX_SHAPE_HECTARES,
  ShapeError,
  shapeCoverage,
  type GeographicPoint,
} from "../lib/shapes/coverage";
import { measureShape, WindowError } from "../lib/shapes/measure";
import { decodeTile, gunzip, tileForBlock, tileName, type PackedBlock } from "../lib/shapes/tiles";

export const SHAPE_MEASURE_PATH = "/api/shape/measure";
export const SHAPE_FLAG_HEADER = "x-witness-tree-shape";

/** The most vertices a drawn shape may carry. */
export const MAX_SHAPE_VERTICES = 250;
/**
 * The most tiles one measurement will fetch. A tile is 61 km square, so forty
 * of them reach far beyond any shape drawn by hand while keeping a single
 * request's transfer bounded.
 */
export const MAX_SHAPE_TILES = 40;

export type ShapeEnv = Readonly<{ COARSE_GRID_BASE?: string }>;

export function coarseGridConfigured(env: ShapeEnv): boolean {
  return Boolean(env.COARSE_GRID_BASE);
}

export function withShapeFlag(request: Request, configured: boolean): Request {
  const headers = new Headers(request.headers);
  headers.set(SHAPE_FLAG_HEADER, configured ? "on" : "off");
  return new Request(request, { headers });
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function readPoints(value: unknown): GeographicPoint[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SHAPE_VERTICES) return null;
  const points: GeographicPoint[] = [];
  for (const entry of value) {
    const latitude = (entry as { latitude?: unknown })?.latitude;
    const longitude = (entry as { longitude?: unknown })?.longitude;
    if (typeof latitude !== "number" || typeof longitude !== "number") return null;
    points.push({ latitude, longitude });
  }
  return points;
}

function readYear(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/**
 * Fetches one tile. A tile file is gzip on disk, but a CDN may also declare
 * the encoding and have the runtime decompress it already, so the magic number
 * decides rather than the file name.
 */
async function readTile(base: string, name: string, fetcher: typeof fetch): Promise<Uint8Array | null> {
  const url = new URL(name, base.endsWith("/") ? base : `${base}/`).toString();
  const response = await fetcher(url);
  // A tile that was never written covers nothing countable, which is a fact
  // about the country rather than a failure to read.
  if (response.status === 404) return null;
  if (response.status !== 200) {
    throw new Error("The coarse grid did not answer for a tile.");
  }
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.length >= 2 && body[0] === 0x1f && body[1] === 0x8b) {
    return await gunzip(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer);
  }
  return body;
}

export async function handleShapeMeasure(
  request: Request,
  env: ShapeEnv,
  deps: { fetch: typeof fetch } = { fetch },
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST to measure a shape." }, 405);
  }
  const base = env.COARSE_GRID_BASE;
  if (!base) {
    return json({ error: "Shape measurement is not configured." }, 503);
  }

  let points: GeographicPoint[] | null;
  let startYear: number | null;
  let endYear: number | null;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    points = readPoints(body?.points);
    startYear = readYear(body?.startYear);
    endYear = readYear(body?.endYear);
  } catch {
    return json({ error: "The shape could not be read." }, 400);
  }
  if (!points || startYear === null || endYear === null) {
    return json({ error: "A measurement needs a list of points and two whole years." }, 400);
  }

  let coverage;
  try {
    coverage = shapeCoverage(points);
  } catch (error) {
    if (error instanceof ShapeError) {
      return json({ error: error.message, kind: error.kind }, 422);
    }
    throw error;
  }

  const wanted = new Map<string, { tileX: number; tileY: number }>();
  for (const block of coverage.blocks) {
    const tile = tileForBlock(block.gx, block.gy);
    wanted.set(`${tile.tileX},${tile.tileY}`, tile);
  }
  if (wanted.size > MAX_SHAPE_TILES) {
    return json(
      {
        error: "The drawn shape reaches across too much of the map to measure at once.",
        kind: "too-spread-out",
      },
      422,
    );
  }

  const blocks = new Map<string, PackedBlock>();
  try {
    const tiles = await Promise.all(
      [...wanted.values()].map(async (tile) => {
        const raw = await readTile(base, tileName(tile.tileX, tile.tileY), deps.fetch);
        return raw === null ? null : decodeTile(raw);
      }),
    );
    for (const tile of tiles) {
      if (!tile) continue;
      for (const block of tile.blocks) blocks.set(`${block.gx},${block.gy}`, block);
    }
  } catch {
    return json({ error: "The coarse grid could not be read." }, 502);
  }

  try {
    return json(measureShape(coverage, blocks, startYear, endYear), 200);
  } catch (error) {
    if (error instanceof WindowError) {
      return json({ error: error.message, kind: "window" }, 422);
    }
    throw error;
  }
}

export const SHAPE_LIMITS = {
  maxHectares: MAX_SHAPE_HECTARES,
  maxBlocks: MAX_SHAPE_BLOCKS,
  maxTiles: MAX_SHAPE_TILES,
  maxVertices: MAX_SHAPE_VERTICES,
} as const;
