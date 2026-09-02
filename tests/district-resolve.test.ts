import assert from "node:assert/strict";
import test from "node:test";

import {
  DISTRICT_RESOLVE_PATH,
  districtIndexConfigured,
  handleDistrictResolve,
  withDistrictFlag,
} from "../worker/district";
import {
  MIXTURE_BASE,
  districtIndexLayer,
  readIndexValue,
} from "../lib/districts/index-lookup";
import {
  BLOCK_METRES,
  GRID_BLOCK_HEIGHT,
  GRID_BLOCK_WIDTH,
  blockByteOffset,
  blockForPoint,
  metresFromBlockEdge,
  projectToGrid,
} from "../lib/grid/lambert";

const BASE = "https://example.invalid/index/";

/** A stand-in CDN that honours ranges over an index built for the test. */
function servingIndex(values: Map<string, number>, options: { status?: number; length?: number } = {}) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const file = url.slice(url.lastIndexOf("/") + 1);
    const range = String((init?.headers as Record<string, string>)?.Range ?? "");
    const start = Number(range.replace("bytes=", "").split("-")[0]);
    const value = values.get(`${file}:${start}`) ?? 0;
    const bytes = new Uint8Array(options.length ?? 2);
    bytes[0] = value & 0xff;
    if (bytes.length > 1) bytes[1] = (value >> 8) & 0xff;
    return new Response(bytes, { status: options.status ?? 206 });
  };
}

test("the block encoding reads back as empty, a single district, or named candidates", () => {
  const layer = districtIndexLayer("federal-2023");
  assert.ok(layer, "the federal layer is present in the shipped manifest");

  assert.deepEqual(readIndexValue(layer, 0), { kind: "empty" });

  const single = readIndexValue(layer, 1);
  assert.equal(single.kind, "single");
  assert.equal(single.kind === "single" && single.districtId, layer.legend[0].districtId);

  const mixture = readIndexValue(layer, MIXTURE_BASE);
  assert.equal(mixture.kind, "mixture");
  assert.ok(mixture.kind === "mixture" && mixture.candidates.length >= 2,
    "a mixture always names at least two candidates, or it would not be one");
});

test("a value the legend or the mixture table cannot explain is refused rather than guessed", () => {
  const layer = districtIndexLayer("federal-2023");
  assert.ok(layer);
  assert.throws(() => readIndexValue(layer, layer.legend.length + 1), /position the legend does not hold/);
  assert.throws(() => readIndexValue(layer, MIXTURE_BASE + layer.mixtures.length), /mixture the table does not hold/);
  assert.throws(() => readIndexValue(layer, -1), /unsigned 16-bit/);
  assert.throws(() => readIndexValue(layer, 1.5), /unsigned 16-bit/);
});

test("the projection places known points on the grid and refuses points off it", () => {
  // Checked against GDAL's own transform for the canonical grid; the two agree
  // to under a metre, which is the NAD83 to WGS84 difference and not an error
  // in the formula.
  // GDAL's own answer for this point on the canonical grid, to three decimals.
  // The tolerance is one metre because GDAL applies the NAD83 to WGS84 shift
  // and this does not; that difference is documented in lib/grid/lambert.ts.
  const ottawa = projectToGrid(45.4215, -75.6972);
  assert.ok(Math.abs(ottawa.x - 1510614.923) < 1, `unexpected easting ${ottawa.x}`);
  assert.ok(Math.abs(ottawa.y - -169810.564) < 1, `unexpected northing ${ottawa.y}`);

  const block = blockForPoint(45.4215, -75.6972);
  assert.deepEqual(block, { gx: 4345, gy: 3300 });
  assert.equal(blockByteOffset(block!), (3300 * GRID_BLOCK_WIDTH + 4345) * 2);

  assert.equal(blockForPoint(82.5018, -62.3481), null, "a point north of the grid has no block");
  assert.ok(GRID_BLOCK_WIDTH > 0 && GRID_BLOCK_HEIGHT > 0);
});

test("distance to a block edge never exceeds half a block", () => {
  for (const [latitude, longitude] of [[45.4215, -75.6972], [49.2827, -123.1207], [46.8, -71.2]] as const) {
    const metres = metresFromBlockEdge(projectToGrid(latitude, longitude));
    assert.ok(metres >= 0 && metres <= BLOCK_METRES / 2, `edge distance ${metres} is outside the block`);
  }
});

test("the route refuses anything but POST and answers no-store", async () => {
  const response = await handleDistrictResolve(
    new Request(`https://example.invalid${DISTRICT_RESOLVE_PATH}`),
    { DISTRICT_INDEX_BASE: BASE },
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("an unconfigured index answers that it is unconfigured rather than guessing", async () => {
  assert.equal(districtIndexConfigured({}), false);
  const response = await handleDistrictResolve(
    new Request(`https://example.invalid${DISTRICT_RESOLVE_PATH}`, { method: "POST", body: "{}" }),
    {},
  );
  assert.equal(response.status, 503);
});

test("a point without numbers, or outside the covered area, is refused", async () => {
  const post = (body: string) =>
    handleDistrictResolve(
      new Request(`https://example.invalid${DISTRICT_RESOLVE_PATH}`, { method: "POST", body }),
      { DISTRICT_INDEX_BASE: BASE },
      { fetch: servingIndex(new Map()) },
    );
  assert.equal((await post('{"latitude":"45","longitude":-75}')).status, 400);
  assert.equal((await post("not json")).status, 400);
  assert.equal((await post('{"latitude":48.8,"longitude":2.3}')).status, 422, "Paris is not in Canada");
});

test("a resolved point reports its district, its province, and its own precision", async () => {
  const federal = districtIndexLayer("federal-2023");
  const ontario = districtIndexLayer("on-2022");
  assert.ok(federal && ontario);

  const block = blockForPoint(43.6532, -79.3832);
  assert.ok(block);
  const offset = blockByteOffset(block);
  const values = new Map<string, number>([
    [`${federal.file}:${offset}`, 1],
    [`${ontario.file}:${offset}`, 1],
  ]);

  const response = await handleDistrictResolve(
    new Request(`https://example.invalid${DISTRICT_RESOLVE_PATH}`, {
      method: "POST",
      body: JSON.stringify({ latitude: 43.6532, longitude: -79.3832 }),
    }),
    { DISTRICT_INDEX_BASE: BASE },
    { fetch: servingIndex(values) },
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    federal: { kind: string; districtId?: string };
    provincial: readonly { layerId: string }[];
    precision: { blockMetres: number; metresFromBlockEdge: number };
  };
  assert.equal(body.federal.kind, "single");
  assert.equal(body.federal.districtId, federal.legend[0].districtId);
  assert.deepEqual(body.provincial.map((entry) => entry.layerId), ["on-2022"],
    "a province that reads empty is left out rather than reported as nothing");
  assert.equal(body.precision.blockMetres, BLOCK_METRES);
  assert.ok(body.precision.metresFromBlockEdge >= 0);
});

test("a CDN that ignores the range header is refused rather than read from the top of the file", async () => {
  // This is the failure that would answer confidently about the wrong place:
  // a 200 carrying the whole index looks like success, and its first two bytes
  // are block zero rather than the block that was asked for.
  const wholeFile = await handleDistrictResolve(
    new Request(`https://example.invalid${DISTRICT_RESOLVE_PATH}`, {
      method: "POST",
      body: JSON.stringify({ latitude: 43.6532, longitude: -79.3832 }),
    }),
    { DISTRICT_INDEX_BASE: BASE },
    { fetch: servingIndex(new Map(), { status: 200 }) },
  );
  assert.equal(wholeFile.status, 502);

  const shortRead = await handleDistrictResolve(
    new Request(`https://example.invalid${DISTRICT_RESOLVE_PATH}`, {
      method: "POST",
      body: JSON.stringify({ latitude: 43.6532, longitude: -79.3832 }),
    }),
    { DISTRICT_INDEX_BASE: BASE },
    { fetch: servingIndex(new Map(), { length: 48 }) },
  );
  assert.equal(shortRead.status, 502);
});

test("the flag the page reads is the worker's answer and not the caller's", () => {
  const claimed = new Request("https://example.invalid/en/search", {
    headers: { "x-witness-tree-district": "on" },
  });
  assert.equal(withDistrictFlag(claimed, false).headers.get("x-witness-tree-district"), "off");
  assert.equal(withDistrictFlag(claimed, true).headers.get("x-witness-tree-district"), "on");
});
