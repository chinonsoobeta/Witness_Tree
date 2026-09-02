/**
 * The district readout answers "which district is this address in", which is a
 * question people will act on. These are the properties that keep the answer
 * either right or visibly uncertain, rather than confident and wrong.
 *
 * The one that matters most is the range read. The index is 48 MB and the
 * route reads two bytes out of it; a CDN that ignores the range header answers
 * 200 with the whole file, and its first two bytes are block zero. That failure
 * looks exactly like success from the caller's side, so it is checked here as
 * well as in the tests.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");
const fail = (message: string): never => {
  throw new Error(message);
};

const ROUTE = "/api/district/resolve";
const FLAG_HEADER = "x-witness-tree-district";
const INDEX_BINDING = "DISTRICT_INDEX_BASE";

const route = read("worker/district.ts");
const lookup = read("lib/districts/index-lookup.ts");
const lambert = read("lib/grid/lambert.ts");
const manifest = JSON.parse(read("data/phase6-district-index.json"));

// 1. A partial read must be refused, not interpreted.
if (!route.includes("response.status !== 206")) {
  fail("worker/district.ts must require a 206, or a whole-file answer is read as block zero.");
}
if (!route.includes("bytes.length !== 2")) {
  fail("worker/district.ts must require exactly two bytes back.");
}

// 2. The route takes a point and never the text it came from. An address that
//    reached this route would be a second copy of it, in a second place.
for (const forbidden of ["query", "address", "formattedAddress"]) {
  if (new RegExp(`body\\??\\.\\s*${forbidden}\\b`).test(route)) {
    fail(`worker/district.ts reads ${forbidden} from the request body. It must take coordinates only.`);
  }
}
for (const forbidden of ["console.log", "console.warn", "console.error", "console.info"]) {
  if (route.includes(forbidden)) fail(`worker/district.ts calls ${forbidden}. A point must not reach a log.`);
}
if (!route.includes('"Cache-Control": "no-store"')) {
  fail("worker/district.ts must answer with no-store.");
}
if (!route.includes('request.method !== "POST"')) {
  fail("worker/district.ts must refuse anything but POST, so a point cannot arrive in a query string.");
}

// 3. Unconfigured means absent, not broken. The flag must be stamped by the
//    worker and the route must be handled before the app router sees it.
const workerIndex = read("worker/index.ts");
if (!workerIndex.includes("url.pathname === DISTRICT_RESOLVE_PATH")) {
  fail("worker/index.ts must handle the district route itself.");
}
const routeAt = workerIndex.indexOf("url.pathname === DISTRICT_RESOLVE_PATH");
const fallthroughAt = workerIndex.indexOf("handler.fetch(stamped");
if (routeAt < 0 || fallthroughAt < 0 || routeAt > fallthroughAt) {
  fail("worker/index.ts must answer the district route before falling through to the app router.");
}
if (!workerIndex.includes("withDistrictFlag(")) {
  fail("worker/index.ts must stamp the district flag on every request.");
}
if (!route.includes(`DISTRICT_FLAG_HEADER = "${FLAG_HEADER}"`)) {
  fail(`worker/district.ts must declare the flag header as ${FLAG_HEADER}.`);
}
if (!route.includes(`if (!base) {`)) {
  fail("worker/district.ts must answer that it is unconfigured rather than reading a default index.");
}
if (!route.includes(`env.${INDEX_BINDING}`)) {
  fail(`worker/district.ts must read the index location from ${INDEX_BINDING}.`);
}

// 4. A block a boundary crosses must name its candidates. An index that
//    silently picked one of them would be wrong about roughly one address in
//    five, and would look exactly as confident as the ones it got right.
if (!lookup.includes('kind: "mixture"')) {
  fail("lib/districts/index-lookup.ts must be able to return a mixture.");
}
if (!lookup.includes("throw new RangeError")) {
  fail("lib/districts/index-lookup.ts must refuse a value it cannot explain.");
}
const client = read("components/search/AddressFinderClient.tsx");
if (!client.includes("federalMixture")) {
  fail("the address field must say when the index cannot separate two districts.");
}
if (!client.includes("text.precision(")) {
  fail("the address field must state the resolution it answered at.");
}

// 5. The address never enters the page's own address. A GET form, a link
//    carrying the query, or a history write would each undo the POST route.
if (client.includes("method=\"get\"") || client.includes("method='get'")) {
  fail("the address field must not submit as a GET form.");
}
for (const forbidden of ["history.pushState", "history.replaceState", "router.push", "router.replace"]) {
  if (client.includes(forbidden)) {
    fail(`the address field calls ${forbidden}, which would put the address into the page's address.`);
  }
}
if (!client.includes('method: "POST"')) {
  fail("the address field must send its query as a POST body.");
}

// 6. The index the route reads and the legend it names must be one artifact.
if (typeof manifest.gridWidth !== "number" || typeof manifest.gridHeight !== "number") {
  fail("data/phase6-district-index.json must declare its grid size.");
}
const blockMetres = manifest.blockMetres;
if (blockMetres !== 960) fail(`the district index is built at ${blockMetres} m rather than 960 m.`);
if (!lambert.includes("BLOCK_PIXELS = 32")) {
  fail("lib/grid/lambert.ts must use the same 32 pixel block the index was built on.");
}
const expectedBytes = manifest.gridWidth * manifest.gridHeight * 2;
for (const layer of manifest.layers as { id: string; bytes: number; legend: unknown[]; districts: number; mixtures: unknown[] }[]) {
  if (layer.bytes !== expectedBytes) {
    fail(`${layer.id} is ${layer.bytes} bytes, which is not one uint16 per block of the declared grid.`);
  }
  if (layer.legend.length !== layer.districts) {
    fail(`${layer.id} names ${layer.districts} districts but its legend holds ${layer.legend.length}.`);
  }
  if (layer.mixtures.length === 0) {
    fail(`${layer.id} records no mixtures, which cannot be true of a grid coarser than a boundary.`);
  }
}
if (manifest.claims?.productionEligible !== false) {
  fail("the district index must not claim production eligibility.");
}

const layerNames = (manifest.layers as { id: string }[]).map((layer) => layer.id).join(", ");
console.log(
  `district resolve: ${ROUTE} reads two bytes per layer over ${layerNames}, ` +
    `${manifest.gridWidth} by ${manifest.gridHeight} blocks of ${blockMetres} m, ` +
    `a partial read is refused, and a boundary block names its candidates.`,
);
