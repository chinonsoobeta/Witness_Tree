import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_RECORD = path.join(REPO_ROOT, "data", "observability-deployment.json");

function requiredText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
}

export function parseArguments(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--origin", "--record", "--output"].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    requiredText(value, argument);
    if (value.startsWith("--")) throw new Error(`${argument} requires a value.`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  requiredText(options.origin, "--origin");
  requiredText(options.output, "--output");
  return { origin: options.origin, output: options.output, record: options.record ?? DEFAULT_RECORD };
}

function checkedOrigin(value) {
  const origin = new URL(value);
  if (origin.protocol !== "https:") throw new Error("The synthetic origin must use HTTPS.");
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
    throw new Error("The synthetic origin must be an HTTPS origin without credentials, a path, a query, or a fragment.");
  }
  return origin;
}

function checkedRoutes(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error("At least one synthetic route is required.");
  const paths = new Set();
  return value.map((route) => {
    if (!route || typeof route !== "object" || Array.isArray(route)) throw new Error("Each synthetic route must be an object.");
    requiredText(route.path, "Synthetic route path");
    if (!route.path.startsWith("/") || route.path.startsWith("//")) throw new Error(`Synthetic route ${route.path} must be an origin-relative path.`);
    if (paths.has(route.path)) throw new Error(`Synthetic route ${route.path} is duplicated.`);
    paths.add(route.path);
    if (!Number.isSafeInteger(route.expectedStatus) || route.expectedStatus < 100 || route.expectedStatus > 599) {
      throw new Error(`Synthetic route ${route.path} expectedStatus must be an HTTP status code.`);
    }
    requiredText(route.contentMarker, `Synthetic route ${route.path} contentMarker`);
    return route;
  });
}

export async function runSyntheticUptime({ origin, routes, fetchImpl = fetch, now = () => new Date() }) {
  const checked = checkedOrigin(origin);
  const configuredRoutes = checkedRoutes(routes);
  const startedAt = now().toISOString();
  const observedRoutes = [];

  for (const route of configuredRoutes) {
    const url = new URL(route.path, checked);
    if (url.origin !== checked.origin) throw new Error(`Synthetic route ${route.path} escapes the configured origin.`);
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
        headers: { "user-agent": "WitnessTree-Synthetic-Uptime/1" },
      });
      const body = await response.text();
      observedRoutes.push({
        path: route.path,
        expectedStatus: route.expectedStatus,
        status: response.status,
        contentMarker: route.contentMarker,
        contentMarkerFound: body.includes(route.contentMarker),
        error: null,
      });
    } catch (error) {
      observedRoutes.push({
        path: route.path,
        expectedStatus: route.expectedStatus,
        status: null,
        contentMarker: route.contentMarker,
        contentMarkerFound: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const result = observedRoutes.every(
    (route) => route.status === route.expectedStatus && route.contentMarkerFound === true,
  )
    ? "pass"
    : "fail";

  return {
    schemaVersion: "witness-tree/synthetic-uptime-run/1",
    origin: checked.origin,
    startedAt,
    completedAt: now().toISOString(),
    result,
    observedRoutes,
  };
}

function readRoutes(recordPath) {
  const record = JSON.parse(readFileSync(recordPath, "utf8"));
  return record?.syntheticUptime?.routes;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage: npm run verify:synthetic-uptime -- [options]

GET every configured route and verify its HTTP status and content marker.
--origin URL   HTTPS origin (npm default: https://www.witnesstree.ca)
--output FILE  New receipt file (npm default: synthetic-uptime-result.json)
--record FILE  Route record (default: data/observability-deployment.json)
--help, -h     Print this help without making a request or writing a file

Existing receipts are never overwritten. Choose a new --output for each run.
Exit 0 means every route passed; exit 1 means a failed probe or invalid invocation.
A run does not update the committed observability claims.`);
    return;
  }
  const result = await runSyntheticUptime({
    origin: options.origin,
    routes: readRoutes(path.resolve(options.record)),
  });
  writeFileSync(path.resolve(options.output), `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`${result.result.toUpperCase()} synthetic uptime: ${result.observedRoutes.length} route(s) observed; receipt ${options.output}`);
  if (result.result !== "pass") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`FAIL synthetic uptime: ${error.message}`);
    process.exitCode = 1;
  });
}
