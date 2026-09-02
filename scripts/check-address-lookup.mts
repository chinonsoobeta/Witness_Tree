/**
 * The address harness is dormant, which is exactly when a containment rule
 * stops being checked by use. These are the properties that must hold before a
 * key is ever inserted, because inserting the key is the moment they stop
 * being cheap to fix.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const root = new URL("../", import.meta.url);
const resolve = (path: string) => fileURLToPath(new URL(path, root));
const read = (path: string) => readFileSync(resolve(path), "utf8");
const fail = (message: string): never => {
  throw new Error(message);
};

const PROVIDER_HOST = "places.googleapis.com";
const KEY_BINDING = "ADDRESS_PROVIDER_KEY";
const FLAG_HEADER = "x-witness-tree-address";
const ROUTE = "/api/address/search";

function walk(directory: string): string[] {
  const absolute = resolve(directory);
  let entries: string[];
  try {
    entries = readdirSync(absolute);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(absolute, entry);
    if (statSync(path).isDirectory()) {
      found.push(...walk(relative(resolve("."), path)));
    } else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

// 1. The browser never learns the provider exists. If the host or the key
//    binding can be reached from anything the bundle can import, the key stops
//    being a worker secret in practice even while it still is one on paper.
const shipped = [...walk("app"), ...walk("components"), ...walk("lib")];
for (const path of shipped) {
  const source = readFileSync(path, "utf8");
  const where = relative(resolve("."), path);
  if (where.startsWith("lib/address/")) continue;
  if (source.includes(PROVIDER_HOST)) fail(`${where} names the address provider host. Only the worker may.`);
  if (source.includes(KEY_BINDING)) fail(`${where} names the provider key binding. Only the worker may.`);
}

// The one exempt directory is exempt for a reason, so the reason is checked.
const query = read("lib/address/query.ts");
if (!query.includes(PROVIDER_HOST)) fail("lib/address/query.ts no longer builds the provider request.");
if (query.includes(KEY_BINDING)) fail("lib/address/query.ts must take the key as an argument, never read a binding.");
for (const barrel of ["lib/address/index.ts"]) {
  if (read(barrel).includes("./runtime")) fail(`${barrel} re-exports the server-only flag reader into shared code.`);
}

// 2. The page talks to our own origin and nothing else, which is the whole
//    reason the proxy exists. A provider host in connect-src would mean the
//    browser is calling the provider directly.
const workerEntry = read("worker/index.ts");
const connectSrc = workerEntry.match(/"connect-src ([^"]+)"/)?.[1] ?? fail("worker/index.ts no longer declares connect-src.");
if (connectSrc.includes(PROVIDER_HOST)) fail("connect-src names the address provider. The browser must only reach our own origin.");

// 3. The flag is the worker's answer, not the caller's. It has to be stamped on
//    the request that reaches the app router, with no branch that skips it.
if (!workerEntry.includes("withAddressFlag(request,")) fail("worker/index.ts does not stamp the address flag on the inbound request.");
if (!/handler\.fetch\(stamped,/.test(workerEntry)) fail("worker/index.ts passes an unstamped request to the app router.");
const stampIndex = workerEntry.indexOf("withAddressFlag(request,");
const routeIndex = workerEntry.indexOf("url.pathname === ADDRESS_SEARCH_PATH");
if (routeIndex < 0 || routeIndex > stampIndex) fail("the address route must be handled before the app router fallthrough.");

const workerRoute = read("worker/address.ts");
if (!workerRoute.includes(`"${ROUTE}"`)) fail(`worker/address.ts no longer serves ${ROUTE}.`);
if (!workerRoute.includes(`"${FLAG_HEADER}"`)) fail("worker/address.ts no longer declares the flag header.");
if (read("lib/address/runtime.ts").split(`"${FLAG_HEADER}"`).length !== 2) fail("the page and the worker disagree about the flag header name.");

// 4. An address is personal, so it must not travel where requests are logged.
if (!/request\.method !== "POST"/.test(workerRoute)) fail("worker/address.ts must refuse anything but POST, so an address never lands in a query string.");
if (!workerRoute.includes('"Cache-Control": "no-store"')) fail("worker/address.ts must answer with no-store.");
for (const forbidden of ["console.log", "console.warn", "console.error", "console.info"]) {
  if (workerRoute.includes(forbidden)) fail(`worker/address.ts calls ${forbidden}. The query must not reach a log.`);
}

// 5. A public, per-request-billed route without a ceiling is a bill. The
//    reservation must happen before the paid call, not after it.
const budget = read("lib/address/budget.ts");
for (const required of ["ADDRESS_DAILY_CEILING", "ADDRESS_CLIENT_LIMIT", "ADDRESS_CACHE_TTL_SECONDS"]) {
  if (!budget.includes(`export const ${required}`)) fail(`lib/address/budget.ts no longer declares ${required}.`);
}
const reserveAt = workerRoute.indexOf("await reserveAddressSpend(store,");
const fetchAt = workerRoute.indexOf("deps.fetch(addressRequest");
if (reserveAt < 0 || fetchAt < 0 || reserveAt > fetchAt) fail("worker/address.ts must reserve the spend before it makes the paid call.");
const cacheAt = workerRoute.indexOf("const cached = await store.read(cacheKey)");
if (cacheAt < 0 || cacheAt > reserveAt) fail("worker/address.ts must consult the cache before it reserves a paid call.");

const ceiling = Number(budget.match(/ADDRESS_DAILY_CEILING = (\d+)/)?.[1] ?? 0);
const perClient = Number(budget.match(/ADDRESS_CLIENT_LIMIT = (\d+)/)?.[1] ?? 0);
if (!(ceiling > 0) || !(perClient > 0)) fail("the address limits must be positive numbers.");
if (perClient >= ceiling) fail("a single client must not be able to spend the whole daily ceiling.");

console.log(
  `address lookup harness: proxied through ${ROUTE}, connect-src ${connectSrc}, ceiling ${ceiling}/day and ${perClient}/client/minute, key confined to the worker.`,
);
