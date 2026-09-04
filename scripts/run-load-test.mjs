import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import autocannon from "autocannon";
import { checkedManifestOutput } from "./verify-data-root-inventory.mjs";
import { resolveDataRoot } from "./data-root.mjs";

export const ROUTES = Object.freeze(["/en", "/fr", "/en/explore", "/fr/explorer", "/en/compare", "/fr/comparer"]);
export const BUDGET = Object.freeze({ requests: 120, connections: 2, requestsPerSecond: 6, deadlineSeconds: 30, timeoutSeconds: 5, pipelining: 1 });
const repository = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);

export function validateLoadOptions({ origin = "http://127.0.0.1:4173", requests = BUDGET.requests } = {}) {
  let url;
  try { url = new URL(origin); } catch { throw new Error("--origin must be an absolute loopback HTTP origin"); }
  assert.ok(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash,
  "This harness accepts loopback HTTP origins only. Production and remote targets require a separate owner-authorized scenario.");
  assert.ok(Number.isInteger(requests) && requests >= ROUTES.length * BUDGET.connections
    && requests <= BUDGET.requests && requests % (ROUTES.length * BUDGET.connections) === 0,
  "--requests must be a multiple of 12 between 12 and 120");
  return { origin: url.origin, requests };
}

export function latencyPercentiles(samples) {
  assert.ok(samples.every((value) => Number.isFinite(value) && value >= 0), "Invalid response latency");
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (percentile) => sorted.length ? sorted[Math.ceil(percentile * sorted.length) - 1] : null;
  return { unit: "milliseconds", method: "nearest-rank, observed responses including non-2xx; no coordinated-omission correction", samples: sorted.length,
    p50: at(0.50), p95: at(0.95), p99: at(0.99) };
}

export async function runLoadScenario(options = {}) {
  const { origin, requests } = validateLoadOptions(options);
  const startedAt = new Date().toISOString();
  const samples = [];
  const byRoute = Object.fromEntries(ROUTES.map((route) => [route, 0]));
  const byStatus = {};
  let deadlineReached = false;
  let interrupted = false;
  let timer;
  let stop;
  let result;
  let failureCode = null;
  try {
    result = await new Promise((resolve, reject) => {
      const instance = autocannon({ url: origin, amount: requests, connections: BUDGET.connections,
        pipelining: BUDGET.pipelining, timeout: BUDGET.timeoutSeconds, overallRate: BUDGET.requestsPerSecond,
        bailout: 1, excludeErrorStats: false, headers: { "user-agent": "local-load-verifier/1" },
        requests: ROUTES.map((route) => ({ method: "GET", path: route, onResponse: () => { byRoute[route] += 1; } })),
      }, (error, value) => error ? reject(error) : resolve(value));
      instance.on("response", (_client, statusCode, _bytes, milliseconds) => {
        samples.push(milliseconds);
        byStatus[statusCode] = (byStatus[statusCode] ?? 0) + 1;
      });
      // autocannon's amount overrides duration, so an independent deadline is
      // required to bound a run that never receives all its expected responses.
      timer = setTimeout(() => { deadlineReached = true; instance.stop(); }, BUDGET.deadlineSeconds * 1000);
      stop = () => { interrupted = true; instance.stop(); };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  } catch (error) { failureCode = error.code ?? "load-run-failed"; }
  finally {
    clearTimeout(timer);
    if (stop) { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
  }
  const non2xx = Object.entries(byStatus).reduce((count, [status, total]) => count + (Number(status) >= 200 && Number(status) < 300 ? 0 : total), 0);
  const connectionErrors = result?.errors ?? null;
  const outcomes = connectionErrors === null ? null : samples.length + connectionErrors;
  const complete = Boolean(result && samples.length === requests && Object.values(byRoute).every((count) => count === requests / ROUTES.length));
  const passed = complete && non2xx === 0 && connectionErrors === 0 && !deadlineReached && !interrupted && !failureCode;
  return { schemaVersion: "witness-tree/local-load-observation/1", status: passed ? "passed" : "failed", startedAt,
    completedAt: new Date().toISOString(), target: { origin, scope: "loopback-only", production: false },
    engine: { name: "autocannon", version: require("autocannon/package.json").version, node: process.version },
    budget: { ...BUDGET, requests, routes: ROUTES, method: "GET", redirectsFollowed: false, assetsFetched: false, warmupRequests: 0 },
    complete, deadlineReached, interrupted, failureCode, responses: samples.length, byRoute, byStatus,
    latency: latencyPercentiles(samples), connectionErrors, timeouts: result?.timeouts ?? null, non2xx,
    errorRate: outcomes ? (non2xx + connectionErrors) / outcomes : null,
    errorRateBasis: "non-2xx responses plus connection errors divided by all observed responses plus connection errors; timeouts are already included in connection errors",
    durationSeconds: result?.duration ?? null,
    claims: { productionLoadTest: false, fiftyTimesLoadDemonstrated: false, phase8CriterionPass: false } };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: npm run verify:load-test -- [--origin http://127.0.0.1:4173] [--requests 120] [--output FILE]\nLoopback HTTP only; production and remote targets are refused. Sends GET requests to all six bilingual routes. Requests: multiples of 12, maximum 120; two connections; six requests/second; five-second socket timeout; 30-second deadline. No redirects, assets or warmup requests. Output defaults to a new timestamped file under outputs/. Existing output paths and every SSD data-root alias are refused. Exit 0: complete error-free local observation; 1: failed, interrupted or incomplete. No Phase 8 load-testing claim.");
    return;
  }
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    assert.ok(["--origin", "--requests", "--output"].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith("--"), "Unknown or incomplete load-test argument");
    options[args[i].slice(2)] = args[i] === "--requests" ? Number(args[i + 1]) : args[i + 1];
  }
  const validated = validateLoadOptions(options);
  const dataRoot = resolveDataRoot();
  const directory = path.join(repository, "outputs");
  if (!options.output) {
    try { await lstat(directory); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      await checkedManifestOutput(directory, dataRoot);
      await mkdir(directory);
    }
  }
  const output = await checkedManifestOutput(options.output ?? path.join(directory, `load-run-${new Date().toISOString().replaceAll(":", "-")}.json`), dataRoot);
  const result = await runLoadScenario(validated);
  const sources = await Promise.all(["scripts/run-load-test.mjs", "package-lock.json", "dist/client/.vite/manifest.json"].map(async (relative) => {
    try { return { path: relative, sha256: createHash("sha256").update(await readFile(path.join(repository, relative))).digest("hex") }; }
    catch (error) { if (error.code === "ENOENT") return { path: relative, sha256: null }; throw error; }
  }));
  await writeFile(output, `${JSON.stringify({ ...result, sources, sourceBindingScope: "local files; no claim that the listening process serves these bytes" }, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ status: result.status, responses: result.responses, latency: result.latency, errorRate: result.errorRate, output }));
  process.exitCode = result.status === "passed" ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(JSON.stringify({ status: "failed", reason: error.message }));
  process.exitCode = 1;
});
