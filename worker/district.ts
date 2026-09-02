/**
 * Resolving a point to its electoral districts.
 *
 * The index is 48 MB per layer and lives on the CDN, so this route reads two
 * bytes out of it with a range request rather than holding it. Five layers, one
 * federal and four provincial, are read in parallel; a point outside the four
 * provinces simply reads empty from those four, which is the honest answer
 * rather than a missing one.
 *
 * The route takes a point, never an address. Whatever the caller typed stays in
 * the address route and is never forwarded here, so a district lookup cannot
 * become a second copy of someone's address. Nothing here logs its input.
 *
 * A partial read is refused rather than interpreted. A CDN that ignores the
 * range header answers 200 with the whole file, and treating its first two
 * bytes as the requested block would answer confidently about the wrong place.
 */

import { CANADA_BOUNDS } from "../lib/address";
import {
  DISTRICT_INDEX_BLOCK_METRES,
  DISTRICT_INDEX_METHOD_VERSION,
  FEDERAL_LAYER_ID,
  PROVINCIAL_LAYER_IDS,
  type DistrictLookup,
  districtIndexLayer,
  readIndexValue,
} from "../lib/districts/index-lookup";
import { blockByteOffset, blockForPoint, metresFromBlockEdge, projectToGrid } from "../lib/grid/lambert";

export const DISTRICT_RESOLVE_PATH = "/api/district/resolve";
export const DISTRICT_FLAG_HEADER = "x-witness-tree-district";

export type DistrictEnv = Readonly<{ DISTRICT_INDEX_BASE?: string }>;

export function districtIndexConfigured(env: DistrictEnv): boolean {
  return Boolean(env.DISTRICT_INDEX_BASE);
}

export function withDistrictFlag(request: Request, configured: boolean): Request {
  const headers = new Headers(request.headers);
  headers.set(DISTRICT_FLAG_HEADER, configured ? "on" : "off");
  return new Request(request, { headers });
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function finiteCoordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * One two-byte read. The status and the length are both checked, because a
 * range request that quietly became a whole-file request still looks like a
 * success from the caller's side.
 */
async function readBlockValue(
  base: string,
  file: string,
  offset: number,
  fetcher: typeof fetch,
): Promise<number> {
  const url = new URL(file, base.endsWith("/") ? base : `${base}/`).toString();
  const response = await fetcher(url, { headers: { Range: `bytes=${offset}-${offset + 1}` } });
  if (response.status !== 206) {
    throw new Error("The district index did not answer a range request.");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== 2) {
    throw new Error("The district index returned the wrong number of bytes.");
  }
  return bytes[0] | (bytes[1] << 8);
}

async function lookupLayer(
  base: string,
  layerId: string,
  offset: number,
  fetcher: typeof fetch,
): Promise<DistrictLookup> {
  const layer = districtIndexLayer(layerId);
  if (!layer) throw new Error("The district index has no such layer.");
  return readIndexValue(layer, await readBlockValue(base, layer.file, offset, fetcher));
}

export async function handleDistrictResolve(
  request: Request,
  env: DistrictEnv,
  deps: { fetch: typeof fetch } = { fetch },
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST to resolve a point." }, 405);
  }
  const base = env.DISTRICT_INDEX_BASE;
  if (!base) {
    return json({ error: "District lookup is not configured." }, 503);
  }

  let latitude: number | null;
  let longitude: number | null;
  try {
    const body = (await request.json()) as { latitude?: unknown; longitude?: unknown };
    latitude = finiteCoordinate(body?.latitude);
    longitude = finiteCoordinate(body?.longitude);
  } catch {
    return json({ error: "The point could not be read." }, 400);
  }
  if (latitude === null || longitude === null) {
    return json({ error: "A point needs a numeric latitude and longitude." }, 400);
  }
  if (
    latitude < CANADA_BOUNDS.south ||
    latitude > CANADA_BOUNDS.north ||
    longitude < CANADA_BOUNDS.west ||
    longitude > CANADA_BOUNDS.east
  ) {
    return json({ error: "That point is outside the area this index covers." }, 422);
  }

  const projected = projectToGrid(latitude, longitude);
  const block = blockForPoint(latitude, longitude);
  if (!block) {
    return json({ error: "That point is outside the area this index covers." }, 422);
  }
  const offset = blockByteOffset(block);

  let federal: DistrictLookup;
  let provincial: readonly Readonly<{ layerId: string; lookup: DistrictLookup }>[];
  try {
    const [federalLookup, ...provincialLookups] = await Promise.all([
      lookupLayer(base, FEDERAL_LAYER_ID, offset, deps.fetch),
      ...PROVINCIAL_LAYER_IDS.map((layerId) => lookupLayer(base, layerId, offset, deps.fetch)),
    ]);
    federal = federalLookup;
    provincial = PROVINCIAL_LAYER_IDS.map((layerId, position) => ({
      layerId,
      lookup: provincialLookups[position],
    })).filter((entry) => entry.lookup.kind !== "empty");
  } catch {
    return json({ error: "The district index could not be read." }, 502);
  }

  return json(
    {
      block,
      federal,
      provincial,
      precision: {
        blockMetres: DISTRICT_INDEX_BLOCK_METRES,
        metresFromBlockEdge: Math.round(metresFromBlockEdge(projected)),
        methodVersion: DISTRICT_INDEX_METHOD_VERSION,
      },
    },
    200,
  );
}
