// Records which repository checks can only be evaluated when the real data
// root is attached, so that their failure while it is detached reads as
// "evidence unavailable" rather than "evidence contradicted". Those are not
// the same finding and must never be collapsed into one another.
//
// A single list could not carry that meaning, because the repository holds two
// deliberate and equally honest responses to an absent archive. Some checks
// refuse outright, in the words of one of them: an absent drive is not a pass.
// Others verify what they can, pass, and say in their own output exactly what
// they did not verify. Asserting that every listed check fails punished the
// second kind for behaving well, so each entry now declares which it is.
// "degrades" is only safe because it is guarded: such a check must print the
// sentence it declares here, so a check that passed having quietly verified
// nothing cannot hide behind the word.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { resolveDataRoot } from "./data-root.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
export const INVENTORY_PATH = "data/data-root-bound-checks.json";
export const INVENTORY_SCHEMA = "witness-tree/data-root-bound-checks/2";
export const DATA_ROOT_MARKER = "Witness_Tree-data";
// Attribution is an explicit allow-list, not a substring catch-all. Most
// checks name the unreadable path. run-wildfire-derived-recovery.sh instead
// refuses with a fixed sentence and never echoes a local path, because that
// runner is MFA adjacent. Both are data-root absence; nothing else is.
//
// The path has to be the root this run actually resolved, not merely a string
// containing "Witness_Tree-data". A check that builds the archive path from the
// repository instead of the shared helper names a directory beside the checkout
// that has never existed on any machine, and it fails that way whether the drive
// is attached or not. Matching the bare name excused exactly that: the federal
// electoral transformation runner was read as "the archive is gone" when what it
// really shows is a runner looking in the wrong place. Requiring the resolved
// root keeps those two findings apart, which is the whole job of this file.
export function attributionMarkers(dataRoot = sweepDataRoot()) {
  return Object.freeze([
    { marker: dataRoot, source: "the check named an unreadable path under the resolved data root", selfEvidencesAbsence: false },
    { marker: "Derived data root is absent or not absolute", source: "scripts/run-wildfire-derived-recovery.sh refused before any TOTP or AWS call", selfEvidencesAbsence: true },
  ]);
}
// Naming a path under the data root says which file the check wanted. It does
// not say the check failed to read it. A checksum disagreement also names its
// file, so the path alone cannot separate "could not read" from "read and
// disagreed". These are the signals that the filesystem itself refused.
//
// The last two are prose rather than errno strings. They are here because two
// checks phrase the refusal themselves instead of letting the error surface,
// and both still have to name a path under the data root to be excused at all.
export const ABSENCE_MARKERS = Object.freeze([
  "ENOENT",
  "ENOTDIR",
  "ENXIO",
  "ENODEV",
  "EIO",
  "ELOOP",
  "EACCES",
  "no such file or directory",
  "not a directory",
  "input/output error",
  "is not mounted",
  "does not resolve",
  "are not readable at",
  "missing local input",
]);
// Signals that the check read the bytes and they disagreed. A contradiction is
// a defect and is never excusable by an absent data root, so it is tested
// first and wins outright over any absence signal in the same output.
export const CONTRADICTION_MARKERS = Object.freeze([
  "drifted",
  "mismatch",
  "does not match",
  "differs",
  "differ from",
  "byte-for-byte",
  "unexpected sha256",
  "checksum disagree",
]);
// node:test reports a failed rejects() by quoting the pattern the caller
// expected. When a check asserts that some other failure says "output differs",
// an absent archive makes that assertion fail and the runner prints the word
// "differs" back, inside the echoed pattern. Scanning that text found a
// contradiction in a run whose fifteen ENOENT lines said the drive was simply
// not there. Only the check's own words can condemn it, so the echo is removed
// before the contradiction scan. A real disagreement is reported by the check
// itself and never solely inside a quoted expectation.
export const ECHOED_EXPECTATION_PATTERN = /The input did not match the regular expression \/.*?\/\./gs;

export function withoutEchoedExpectations(output) {
  return String(output).replace(ECHOED_EXPECTATION_PATTERN, "");
}
const REQUIRED_CLAIMS = {
  evidenceUnavailableIsNotEvidenceContradicted: true,
  listVerifiedAgainstPackageScripts: true,
  listVerifiedEmpiricallyWhenDataRootAbsent: true,
  ownerAdmitted: false,
  released: false,
  productionEligible: false,
};
export const DETACHED_BEHAVIOURS = Object.freeze(["fails", "degrades"]);

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
  exactKeys(document, ["checks", "claims", "dataRoot", "detachedSweep", "failingForOtherReasons", "schemaVersion", "status"], "inventory");
  assert.equal(document.schemaVersion, INVENTORY_SCHEMA, "inventory schema differs");
  assert.equal(document.status, "engineering-derived-inventory", "inventory status differs");
  assert.deepEqual(document.claims, REQUIRED_CLAIMS, "inventory claim boundary differs");

  exactKeys(document.dataRoot, ["path", "reason"], "inventory data root");
  assert.equal(typeof document.dataRoot.path, "string", "inventory data root path is required");
  assert.ok(document.dataRoot.path.includes(DATA_ROOT_MARKER), "inventory data root path must name the canonical data root");
  assert.ok(String(document.dataRoot.reason).trim().length > 0, "inventory data root reason is required");

  exactKeys(document.detachedSweep, ["method", "limits"], "inventory detached sweep");
  assert.ok(String(document.detachedSweep.method).trim().length > 0, "the sweep method must be stated");
  assert.ok(Array.isArray(document.detachedSweep.limits) && document.detachedSweep.limits.length > 0, "a sweep with no stated limits claims more than it verified");
  for (const limit of document.detachedSweep.limits) {
    exactKeys(limit, ["check", "reason"], "sweep limit");
    assert.ok(checkScripts.includes(limit.check), `${limit.check} is named as a sweep limit but no longer exists in package.json`);
    assert.ok(String(limit.reason).trim().length > 0, `${limit.check} needs a reason it cannot be swept`);
  }

  const checks = document.checks;
  assert.ok(Array.isArray(checks) && checks.length > 0, "inventory checks are required");
  const available = new Set(checkScripts);
  const names = [];
  for (const entry of checks) {
    exactKeys(entry, entry.whenDetached === "degrades" ? ["announces", "name", "whenDetached"] : ["name", "whenDetached"], "inventory check");
    assert.equal(typeof entry.name, "string", "each inventory check must name a script");
    assert.ok(entry.name.startsWith("check:"), `${entry.name} is not a check script`);
    assert.ok(available.has(entry.name), `${entry.name} is named in the inventory but no longer exists in package.json`);
    assert.ok(DETACHED_BEHAVIOURS.includes(entry.whenDetached), `${entry.name} must declare whether it fails or degrades with the data root detached`);
    // A "degrades" entry is a promise that the check says out loud what it
    // could not verify. Without the sentence, "degrades" and "passed having
    // checked nothing" are the same observation, which is the defect this
    // whole file exists to catch.
    if (entry.whenDetached === "degrades") {
      assert.equal(typeof entry.announces, "string", `${entry.name} degrades, so it must declare the shortfall it prints`);
      assert.ok(entry.announces.trim().length > 0, `${entry.name} degrades, so its declared shortfall cannot be blank`);
    }
    names.push(entry.name);
  }
  assert.equal(new Set(names).size, names.length, "inventory checks contain a duplicate");

  const others = document.failingForOtherReasons;
  assert.ok(Array.isArray(others), "the other-reasons list is required, even when empty");
  const otherNames = [];
  for (const entry of others) {
    exactKeys(entry, ["name", "reason"], "other-reasons entry");
    assert.ok(available.has(entry.name), `${entry.name} is named as failing for another reason but no longer exists in package.json`);
    assert.ok(String(entry.reason).trim().length > 0, `${entry.name} needs a stated reason it fails`);
    assert.ok(!names.includes(entry.name), `${entry.name} cannot be both data-root bound and failing for another reason`);
    otherNames.push(entry.name);
  }
  assert.equal(new Set(otherNames).size, otherNames.length, "the other-reasons list contains a duplicate");

  return {
    checks: checks.map((entry) => ({ ...entry })),
    others: others.map((entry) => ({ ...entry })),
    skipped: document.detachedSweep.limits.map((limit) => limit.check),
    total: available.size,
  };
}

// The sweep must resolve the archive exactly as the checks it spawns do, or its
// bookkeeping and their behaviour describe different worlds. Resolving the
// inventory's recorded relative path against the repository did that: from a
// worktree that does not sit beside the data directory it read "detached" while
// every spawned check inherited the real root and passed, and the reconciliation
// then blamed the inventory for it. The recorded path stays as the declaration
// of which root is meant; the shared helper says where that root actually is for
// this run, and it is the same helper the checks use.
export function sweepDataRoot() {
  return resolveDataRoot();
}

export function dataRootAvailable(dataRootPath) {
  try {
    return statSync(dataRootPath).isDirectory();
  } catch {
    return false;
  }
}

// A failure is attributable to the absent data root only when the output both
// points at that root and shows the filesystem refusing to read it. Anything
// else is a real defect and must not be excused by this inventory. In
// particular an output that merely echoes a data-root path is classified
// "other", not excused: unreadable and contradicted are different findings and
// collapsing them is the one thing this file exists to prevent.
export function classifyFailure(output, dataRoot = sweepDataRoot()) {
  const text = String(output);
  if (CONTRADICTION_MARKERS.some((marker) => withoutEchoedExpectations(text).includes(marker))) return "contradicted";
  const attribution = attributionMarkers(dataRoot).find(({ marker }) => text.includes(marker));
  if (!attribution) return "other";
  if (attribution.selfEvidencesAbsence) return "data-root-unavailable";
  return ABSENCE_MARKERS.some((marker) => text.includes(marker)) ? "data-root-unavailable" : "other";
}

export function reconcile(entries, others, observed) {
  const bound = new Map(entries.map((entry) => [entry.name, entry]));
  const otherNames = new Set(others.map((entry) => entry.name));
  const findings = [];

  for (const entry of entries) {
    const result = observed.get(entry.name);
    if (!result) continue;
    if (entry.whenDetached === "fails") {
      if (result.ok) findings.push({ name: entry.name, kind: "missing" });
      else if (result.kind !== "data-root-unavailable") findings.push({ name: entry.name, kind: "misattributed", observed: result.kind });
    } else if (!result.ok) {
      findings.push({ name: entry.name, kind: "degraded-but-failed", observed: result.kind });
    } else if (!String(result.output).includes(entry.announces)) {
      // Passing is not the same as passing honestly. The declared sentence is
      // the check telling the reader which bytes it never opened.
      findings.push({ name: entry.name, kind: "silent-degradation" });
    }
  }

  for (const entry of others) {
    const result = observed.get(entry.name);
    if (!result) continue;
    // Nothing attributable to the absent archive may sit in the other-reasons
    // list, or the list becomes a place to park exactly the failures the
    // inventory exists to account for.
    if (!result.ok && result.kind === "data-root-unavailable") findings.push({ name: entry.name, kind: "absence-parked-elsewhere" });
  }

  for (const [name, result] of observed) {
    if (result.ok || bound.has(name) || otherNames.has(name)) continue;
    findings.push({ name, kind: "unlisted", observed: result.kind });
  }

  return findings;
}

function runCheck(name) {
  const result = spawnSync("npm", ["run", "--silent", name], { cwd: root, encoding: "utf8", timeout: 600_000 });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

// Every check is observed, not only the failing ones, because a "degrades"
// entry is judged on what its passing output says.
export function validateEmpirically(checkScripts, run = runCheck, skipped = [], dataRoot = sweepDataRoot()) {
  const skip = new Set(skipped);
  const observed = new Map();
  for (const name of checkScripts) {
    if (skip.has(name)) continue;
    const result = run(name);
    observed.set(name, { ok: result.ok, kind: result.ok ? "pass" : classifyFailure(result.output, dataRoot), output: result.output });
  }
  return observed;
}

const FINDING_TEXT = {
  missing: (finding) => `inventory names ${finding.name} as failing when the archive is gone, but it passed`,
  misattributed: (finding) =>
    finding.observed === "contradicted"
      ? `${finding.name} read its bytes and they disagreed; that is a defect, not an absent data root`
      : `${finding.name} failed without showing that the data root was unreadable (${finding.observed})`,
  "degraded-but-failed": (finding) => `inventory says ${finding.name} degrades, but it failed (${finding.observed})`,
  "silent-degradation": (finding) => `${finding.name} passed with the archive gone without printing the shortfall it declares`,
  "absence-parked-elsewhere": (finding) => `${finding.name} is listed as failing for another reason, but it failed because the archive was unreadable`,
  unlisted: (finding) => `unlisted data-root-bound or genuinely failing check: ${finding.name} (${finding.observed})`,
};

function main() {
  const inventory = readJson(INVENTORY_PATH);
  const checkScripts = packageCheckScripts(readJson("package.json"));
  const { checks, others, skipped, total } = validateInventory(inventory, checkScripts);
  const dataRootPath = sweepDataRoot();
  const attached = dataRootAvailable(dataRootPath);

  const failing = checks.filter((entry) => entry.whenDetached === "fails").length;
  console.log(`${INVENTORY_PATH}: ${checks.length} of ${total} check scripts are data-root bound (${failing} refuse, ${checks.length - failing} degrade and say so).`);
  console.log(`Data root ${dataRootPath} (declared ${inventory.dataRoot.path}): ${attached ? "attached" : "not attached"}${existsSync(dataRootPath) ? "" : " (path does not resolve)"}.`);

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
  const observed = validateEmpirically(checkScripts, runCheck, skipped, dataRootPath);
  const findings = reconcile(checks, others, observed);
  for (const finding of findings) console.error(FINDING_TEXT[finding.kind](finding));
  assert.deepEqual(findings, [], "the data-root inventory does not account for what the detached sweep observed");
  console.log(`Reconciled across ${observed.size} checks: ${failing} refuse and every refusal is attributable to the absent data root, ${checks.length - failing} degrade and each printed its shortfall, ${others.length} fail for stated other reasons, ${skipped.length} could not be swept.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
