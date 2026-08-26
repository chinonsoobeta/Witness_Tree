// Records which repository checks can only be evaluated when the real data
// root is attached, so that their failure while it is detached reads as
// "evidence unavailable" rather than "evidence contradicted". Those are not
// the same finding and must never be collapsed into one another.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
export const INVENTORY_PATH = "data/data-root-bound-checks.json";
export const INVENTORY_SCHEMA = "witness-tree/data-root-bound-checks/1";
export const DATA_ROOT_MARKER = "Witness_Tree-data";
// Attribution is an explicit allow-list, not a substring catch-all. Most
// checks name the unreadable path. run-wildfire-derived-recovery.sh instead
// refuses with a fixed sentence and never echoes a local path, because that
// runner is MFA adjacent. Both are data-root absence; nothing else is.
export const ATTRIBUTION_MARKERS = Object.freeze([
  { marker: DATA_ROOT_MARKER, source: "the check named an unreadable path under the data root" },
  { marker: "Derived data root is absent or not absolute", source: "scripts/run-wildfire-derived-recovery.sh refused before any TOTP or AWS call" },
]);
const REQUIRED_CLAIMS = {
  evidenceUnavailableIsNotEvidenceContradicted: true,
  listVerifiedAgainstPackageScripts: true,
  listVerifiedEmpiricallyWhenDataRootAbsent: true,
  ownerAdmitted: false,
  released: false,
  productionEligible: false,
};

function exactKeys(value, expected, label) {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} contains missing or unexpected fields`);
}

export function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, new URL("..", import.meta.url)), "utf8"));
}

export function packageCheckScripts(packageDocument) {
  const scripts = packageDocument?.scripts;
  assert.ok(scripts && typeof scripts === "object" && !Array.isArray(scripts), "package scripts are required");
  return Object.keys(scripts).filter((name) => name.startsWith("check:"));
}

// Static validation. This proves the inventory still names real scripts; it
// does not prove the inventory is complete. Completeness is only decidable
// while the data root is detached, which validateEmpirically handles.
export function validateInventory(document, checkScripts) {
  assert.ok(document && typeof document === "object" && !Array.isArray(document), "inventory document is required");
  exactKeys(document, ["checks", "claims", "dataRoot", "schemaVersion", "status"], "inventory");
  assert.equal(document.schemaVersion, INVENTORY_SCHEMA, "inventory schema differs");
  assert.equal(document.status, "engineering-derived-inventory", "inventory status differs");
  assert.deepEqual(document.claims, REQUIRED_CLAIMS, "inventory claim boundary differs");

  exactKeys(document.dataRoot, ["path", "reason"], "inventory data root");
  assert.equal(typeof document.dataRoot.path, "string", "inventory data root path is required");
  assert.ok(document.dataRoot.path.includes(DATA_ROOT_MARKER), "inventory data root path must name the canonical data root");
  assert.ok(String(document.dataRoot.reason).trim().length > 0, "inventory data root reason is required");

  const checks = document.checks;
  assert.ok(Array.isArray(checks) && checks.length > 0, "inventory checks are required");
  assert.equal(new Set(checks).size, checks.length, "inventory checks contain a duplicate");
  const available = new Set(checkScripts);
  for (const name of checks) {
    assert.equal(typeof name, "string", "each inventory check must be a string");
    assert.ok(name.startsWith("check:"), `${name} is not a check script`);
    assert.ok(available.has(name), `${name} is named in the inventory but no longer exists in package.json`);
  }
  return { checks: [...checks], total: available.size };
}

export function dataRootAvailable(dataRootPath) {
  try {
    return statSync(dataRootPath).isDirectory();
  } catch {
    return false;
  }
}

// A failure is attributable to the absent data root only when the failure
// output itself names a path under that root. Anything else is a real defect
// and must not be excused by this inventory.
export function classifyFailure(output) {
  const text = String(output);
  return ATTRIBUTION_MARKERS.some(({ marker }) => text.includes(marker)) ? "data-root-unavailable" : "other";
}

export function reconcile(expected, observedFailures) {
  const expectedSet = new Set(expected);
  const missing = [...expectedSet].filter((name) => !observedFailures.has(name));
  const unlisted = [...observedFailures.keys()].filter((name) => !expectedSet.has(name));
  const misattributed = [...observedFailures.entries()]
    .filter(([name, kind]) => expectedSet.has(name) && kind !== "data-root-unavailable")
    .map(([name]) => name);
  return { missing, unlisted, misattributed };
}

function runCheck(name) {
  const result = spawnSync("npm", ["run", "--silent", name], { cwd: root, encoding: "utf8", timeout: 600_000 });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

export function validateEmpirically(checkScripts, run = runCheck) {
  const failures = new Map();
  for (const name of checkScripts) {
    const result = run(name);
    if (!result.ok) failures.set(name, classifyFailure(result.output));
  }
  return failures;
}

function main() {
  const inventory = readJson(INVENTORY_PATH);
  const checkScripts = packageCheckScripts(readJson("package.json"));
  const { checks, total } = validateInventory(inventory, checkScripts);
  const dataRootPath = new URL(`${inventory.dataRoot.path}/`, new URL("..", import.meta.url)).pathname.replace(/\/$/, "");
  const attached = dataRootAvailable(dataRootPath);

  console.log(`${INVENTORY_PATH}: ${checks.length} of ${total} check scripts are data-root bound.`);
  console.log(`Data root ${dataRootPath}: ${attached ? "attached" : "not attached"}${existsSync(dataRootPath) ? "" : " (path does not resolve)"}.`);

  if (!process.argv.includes("--empirical")) {
    console.log("Static validation only. Pass --empirical to reconcile the inventory against a full check sweep.");
    return;
  }
  if (attached) {
    // With the data root attached these checks pass, so a sweep cannot show
    // which of them depend on it. Saying so is the honest result; claiming
    // verification here would be a fabricated gate.
    console.log("Empirical reconciliation is undecidable while the data root is attached. No completeness claim is made.");
    return;
  }
  const failures = validateEmpirically(checkScripts);
  const { missing, unlisted, misattributed } = reconcile(checks, failures);
  for (const name of unlisted) console.error(`unlisted data-root-bound or genuinely failing check: ${name} (${failures.get(name)})`);
  for (const name of missing) console.error(`inventory names ${name} but it passed with the data root detached`);
  for (const name of misattributed) console.error(`${name} failed for a reason that does not name the data root`);
  assert.equal(unlisted.length, 0, "a failing check is not accounted for by the data-root inventory");
  assert.equal(missing.length, 0, "the inventory names a check that does not depend on the data root");
  assert.equal(misattributed.length, 0, "a listed check failed for a reason other than the absent data root");
  console.log(`Reconciled: exactly the ${checks.length} inventoried checks fail, and every one is attributable to the absent data root.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
