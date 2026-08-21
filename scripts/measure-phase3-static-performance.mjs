import { gzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";

const ROUTES = [
  "/en/places/bc-province?view=table",
  "/fr/lieux/bc-province?view=table",
  "/en/location/location-bc-province",
  "/fr/emplacement/location-bc-province",
];
const SIMULATED_4G = Object.freeze({ roundTripMs: 150, downstreamBitsPerSecond: 1_600_000 });
const HTML_GZIP_LIMIT = 100 * 1024;

async function worker() {
  const url = new URL("../dist/server/index.js", import.meta.url);
  url.searchParams.set("measure", `${process.pid}-${Date.now()}`);
  return (await import(url.href)).default;
}

async function responseFor(runtime, pathname) {
  return runtime.fetch(new Request(`http://phase3.local${pathname}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

export async function measureStaticRoutes(routes = ROUTES) {
  const runtime = await worker();
  const results = [];
  for (const route of routes) {
    await responseFor(runtime, route); // warm module and route caches before local timing
    const started = performance.now();
    const response = await responseFor(runtime, route);
    const html = await response.text();
    const localRenderMs = performance.now() - started;
    if (response.status !== 200 || !/<main\b[^>]*id="main"/.test(html)) throw new Error(`${route}: expected a complete static HTML response.`);
    const gzipBytes = gzipSync(html).byteLength;
    if (gzipBytes >= HTML_GZIP_LIMIT) throw new Error(`${route}: HTML gzip ${gzipBytes}/${HTML_GZIP_LIMIT} bytes.`);
    results.push({ route, status: response.status, htmlBytes: Buffer.byteLength(html), gzipBytes, localRenderMs: Number(localRenderMs.toFixed(2)), simulated4gTransferMs: Number((SIMULATED_4G.roundTripMs + gzipBytes * 8 / SIMULATED_4G.downstreamBitsPerSecond * 1000).toFixed(2)), lcp: "unavailable-without-a-rendering-browser" });
  }
  return { schemaVersion: "witness-tree/phase3-local-performance/1", status: "local-diagnostic", simulated4g: SIMULATED_4G, htmlGzipLimit: HTML_GZIP_LIMIT, results };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(await measureStaticRoutes(), null, 2));
