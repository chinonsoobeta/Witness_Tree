import assert from "node:assert/strict";
import test from "node:test";
import {
  ABSENCE_MARKERS,
  ATTRIBUTION_MARKERS,
  CONTRADICTION_MARKERS,
  DATA_ROOT_MARKER,
  INVENTORY_PATH,
  INVENTORY_SCHEMA,
  classifyFailure,
  packageCheckScripts,
  readJson,
  reconcile,
  validateEmpirically,
  validateInventory,
} from "../scripts/check-data-root-bound-checks.mjs";

const inventory = readJson(INVENTORY_PATH);
const checkScripts = packageCheckScripts(readJson("package.json"));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("the committed inventory names only check scripts that still exist", () => {
  const result = validateInventory(inventory, checkScripts);
  assert.equal(result.checks.length, inventory.checks.length);
  assert.ok(result.total >= result.checks.length);
});

test("a renamed or deleted check script fails the inventory instead of silently dropping out", () => {
  const trimmed = checkScripts.filter((name) => name !== inventory.checks[0]);
  assert.throws(() => validateInventory(inventory, trimmed), /no longer exists in package\.json/);
});

test("a duplicated entry fails rather than inflating the bound count", () => {
  const document = clone(inventory);
  document.checks.push(document.checks[0]);
  assert.throws(() => validateInventory(document, checkScripts), /duplicate/);
});

test("an empty inventory cannot stand in for having verified nothing", () => {
  const document = clone(inventory);
  document.checks = [];
  assert.throws(() => validateInventory(document, checkScripts), /inventory checks are required/);
});

test("the claim boundary cannot be widened into an owner admission or a release", () => {
  for (const key of ["ownerAdmitted", "released", "productionEligible"]) {
    const document = clone(inventory);
    document.claims[key] = true;
    assert.throws(() => validateInventory(document, checkScripts), /claim boundary differs/);
  }
});

test("an added or removed top-level field fails closed", () => {
  const added = clone(inventory);
  added.extra = "unreviewed";
  assert.throws(() => validateInventory(added, checkScripts), /missing or unexpected fields/);
  const removed = clone(inventory);
  delete removed.dataRoot;
  assert.throws(() => validateInventory(removed, checkScripts), /missing or unexpected fields/);
});

test("the schema identifier is pinned", () => {
  const document = clone(inventory);
  document.schemaVersion = `${INVENTORY_SCHEMA}-relaxed`;
  assert.throws(() => validateInventory(document, checkScripts), /schema differs/);
});

test("attribution is an allow-list, so an unrelated failure is never excused", () => {
  assert.equal(classifyFailure(`ENOENT: stat /x/${DATA_ROOT_MARKER}/raw/a.zip`), "data-root-unavailable");
  assert.equal(classifyFailure("Derived data root is absent or not absolute; no TOTP or AWS call was made"), "data-root-unavailable");
  assert.equal(classifyFailure("AssertionError: province total drifted"), "contradicted");
  assert.equal(classifyFailure("ENOENT: open data/phase2-admission-record-2026-08-26.json"), "other");
  assert.equal(ATTRIBUTION_MARKERS.length, 2);
});

// The defect this pins: a check that read the bytes and found them wrong names
// the offending file, and that path lives under the data root. Excusing it on
// the path alone turns a contradiction into "evidence unavailable", which is
// the one collapse this inventory exists to prevent.
test("a contradiction is never excused merely because the offending path is under the data root", () => {
  const contradiction = `AssertionError: sha256 for /x/${DATA_ROOT_MARKER}/derived/a.tif drifted from the bound value`;
  assert.equal(classifyFailure(contradiction), "contradicted");
  assert.deepEqual(reconcile(["check:a"], new Map([["check:a", classifyFailure(contradiction)]])).misattributed, ["check:a"]);
});

test("a contradiction wins over an absence signal present in the same output", () => {
  const mixed = `ENOENT: stat /x/${DATA_ROOT_MARKER}/raw/b.zip\nAssertionError: recorded sha256 does not match`;
  assert.equal(classifyFailure(mixed), "contradicted");
});

test("naming a data-root path without any unreadability signal is not excused", () => {
  assert.equal(classifyFailure(`AssertionError: /x/${DATA_ROOT_MARKER}/derived/a.tif has 4 bands, expected 1`), "other");
  assert.equal(classifyFailure(`feature count for /x/${DATA_ROOT_MARKER}/derived/a.gpkg was 0`), "other");
});

test("each recognised unreadability signal alongside a data-root path is excused", () => {
  for (const marker of ABSENCE_MARKERS) {
    assert.equal(classifyFailure(`${marker}: /x/${DATA_ROOT_MARKER}/raw/a.zip`), "data-root-unavailable", marker);
  }
});

test("the marker sets are disjoint, so no single word both excuses and condemns", () => {
  for (const absence of ABSENCE_MARKERS) {
    for (const contradiction of CONTRADICTION_MARKERS) {
      assert.ok(!absence.includes(contradiction) && !contradiction.includes(absence), `${absence} overlaps ${contradiction}`);
    }
  }
});

test("reconciliation reports an unlisted failure, a listed check that passed, and a misattributed reason separately", () => {
  const observed = new Map([
    ["check:a", "data-root-unavailable"],
    ["check:c", "data-root-unavailable"],
    ["check:d", "other"],
  ]);
  const result = reconcile(["check:a", "check:b", "check:d"], observed);
  assert.deepEqual(result.missing, ["check:b"]);
  assert.deepEqual(result.unlisted, ["check:c"]);
  assert.deepEqual(result.misattributed, ["check:d"]);
});

test("a passing sweep produces no findings and never invents one", () => {
  const result = reconcile(["check:a"], new Map([["check:a", "data-root-unavailable"]]));
  assert.deepEqual(result, { missing: [], unlisted: [], misattributed: [] });
});

test("the sweep classifies each failing check and ignores passing ones", () => {
  const failures = validateEmpirically(["check:a", "check:b", "check:c"], (name) => ({
    ok: name === "check:b",
    output: name === "check:a" ? `ENOENT: no such file or directory, stat /x/${DATA_ROOT_MARKER}/y` : "AssertionError: real defect",
  }));
  assert.deepEqual([...failures.entries()], [["check:a", "data-root-unavailable"], ["check:c", "other"]]);
});
