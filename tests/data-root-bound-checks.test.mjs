import assert from "node:assert/strict";
import test from "node:test";
import {
  ABSENCE_MARKERS,
  attributionMarkers,
  CONTRADICTION_MARKERS,
  DATA_ROOT_MARKER,
  DETACHED_BEHAVIOURS,
  INVENTORY_PATH,
  INVENTORY_SCHEMA,
  classifyFailure,
  packageCheckScripts,
  readJson,
  reconcile,
  validateEmpirically,
  validateInventory,
  withoutEchoedExpectations,
  sweepDataRoot,
} from "../scripts/check-data-root-bound-checks.mjs";
import { resolveDataRoot, SSD_DATA_ROOT } from "../scripts/data-root.mjs";
import { readdirSync } from "node:fs";
import { BASELINE, validateDataRootCoverage } from "../scripts/check-data-root-coverage.mjs";
import { checkOutcome, verificationSummary } from "../scripts/run-verification-checks.mjs";

const inventory = readJson(INVENTORY_PATH);
const checkScripts = packageCheckScripts(readJson("package.json"));

test("current coverage pins unavailable names as well as their counts", () => {
  const input = { packageDocument: readJson("package.json"), inventory, testFiles: readdirSync(new URL("../tests", import.meta.url)).filter((name) => /\.test\.(mjs|ts|tsx)$/.test(name)) };
  const result = validateDataRootCoverage(input);
  assert.equal(BASELINE.checkScripts, 231);
  assert.equal(result.current.dataRootChecks, 30);
  assert.equal(result.current.dataRootTestFiles, 25);
  assert.equal(result.empiricalCompleteness, "unavailable");
  const changed = clone(inventory);
  changed.checks[0].name = "check:bilingual";
  assert.throws(() => validateDataRootCoverage({ ...input, inventory: changed }), /names or detached behavior changed/);
  assert.throws(() => validateDataRootCoverage({ ...input, requirements: [new Map(), new Map(), new Map()] }), /Unavailable test names or reasons changed/);
});

test("machine outcomes distinguish passed, failed and unavailable even for a degrading exit-zero check", () => {
  const base = { name: "check:a", dataRoot: "/missing/Witness_Tree-data", attached: false, registry: [{ name: "check:a", whenDetached: "degrades", announces: "data root not mounted" }] };
  const run = (exitCode, output, overrides = {}) => checkOutcome({ ...base, exitCode, output, ...overrides });
  assert.equal(run(0, "data root not mounted").status, "unavailable");
  assert.equal(run(0, "all good").status, "failed");
  assert.equal(run(1, "ENOENT: /missing/Witness_Tree-data/raw/a.tif").status, "unavailable");
  assert.equal(run(1, "checksum mismatch /missing/Witness_Tree-data/raw/a.tif").status, "failed");
  assert.equal(run(1, "ENOENT: data/missing-record.json").status, "failed");
  assert.equal(run(null, "timeout").status, "failed");
  assert.equal(run(0, "all good", { attached: true }).status, "passed");
  assert.equal(verificationSummary([{ status: "passed" }, { status: "unavailable" }]).exitCode, 2);
  assert.equal(verificationSummary([{ status: "failed" }, { status: "unavailable" }]).exitCode, 1);
  assert.equal(verificationSummary([{ status: "passed" }]).exitCode, 0);
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// The sweep's own resolved root. Attribution is measured against this exact
// path, never against the bare product name, so a phantom archive path beside
// some other checkout cannot borrow the excuse.
const ROOT = `/x/${DATA_ROOT_MARKER}`;
const absent = (name) => `ENOENT: no such file or directory, open ${ROOT}/derived/${name}.json`;

// A null output means the check passed. Everything else is its failure text,
// classified exactly as the sweep would classify it.
function observe(outputs) {
  return new Map(
    Object.entries(outputs).map(([name, output]) => [
      name,
      output === null ? { ok: true, kind: "pass", output: "" } : { ok: false, kind: classifyFailure(output, ROOT), output },
    ]),
  );
}

test("the committed inventory names only check scripts that still exist", () => {
  const result = validateInventory(inventory, checkScripts);
  assert.equal(result.checks.length, inventory.checks.length);
  assert.ok(result.total >= result.checks.length);
});

test("a renamed or deleted check script fails the inventory instead of silently dropping out", () => {
  const trimmed = checkScripts.filter((name) => name !== inventory.checks[0].name);
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
  assert.equal(classifyFailure(`ENOENT: stat ${ROOT}/raw/a.zip`, ROOT), "data-root-unavailable");
  assert.equal(classifyFailure("Derived data root is absent or not absolute; no TOTP or AWS call was made", ROOT), "data-root-unavailable");
  assert.equal(classifyFailure("AssertionError: province total drifted", ROOT), "contradicted");
  assert.equal(classifyFailure("ENOENT: open data/phase2-admission-record-2026-08-26.json", ROOT), "other");
  assert.equal(attributionMarkers(ROOT).length, 2);
});

// The defect this pins: a check that read the bytes and found them wrong names
// the offending file, and that path lives under the data root. Excusing it on
// the path alone turns a contradiction into "evidence unavailable", which is
// the one collapse this inventory exists to prevent.
test("a contradiction is never excused merely because the offending path is under the data root", () => {
  const contradiction = `AssertionError: sha256 for ${ROOT}/derived/a.tif drifted from the bound value`;
  assert.equal(classifyFailure(contradiction, ROOT), "contradicted");
  assert.deepEqual(reconcile([{ name: "check:a", whenDetached: "fails" }], [], observe({ "check:a": contradiction })), [
    { name: "check:a", kind: "misattributed", observed: "contradicted" },
  ]);
});

test("a contradiction wins over an absence signal present in the same output", () => {
  const mixed = `ENOENT: stat ${ROOT}/raw/b.zip\nAssertionError: recorded sha256 does not match`;
  assert.equal(classifyFailure(mixed, ROOT), "contradicted");
});

// The defect this pins: a runner that shadows the shared helper builds the
// archive path from its own checkout, so it names a directory beside the
// repository that has never existed anywhere. It fails that way with the drive
// attached too. Matching the bare product name excused it as an absent archive
// and hid a resolution bug inside the one list meant to account for absences.
test("an archive path that is not under the resolved root is a wrong-place defect, not an absent drive", () => {
  const phantom = `Stopped: missing local input: /private/tmp/some-worktree/${DATA_ROOT_MARKER}/raw/a.zip`;
  assert.equal(classifyFailure(phantom, ROOT), "other");
  assert.equal(classifyFailure(`Stopped: missing local input: ${ROOT}/raw/a.zip`, ROOT), "data-root-unavailable");
});

test("naming a data-root path without any unreadability signal is not excused", () => {
  assert.equal(classifyFailure(`AssertionError: ${ROOT}/derived/a.tif has 4 bands, expected 1`, ROOT), "other");
  assert.equal(classifyFailure(`feature count for ${ROOT}/derived/a.gpkg was 0`, ROOT), "other");
});

test("each recognised unreadability signal alongside a data-root path is excused", () => {
  for (const marker of ABSENCE_MARKERS) {
    assert.equal(classifyFailure(`${marker}: ${ROOT}/raw/a.zip`, ROOT), "data-root-unavailable", marker);
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
  const observed = observe({
    "check:a": absent("a"),
    "check:b": null,
    "check:c": absent("c"),
    "check:d": "AssertionError: real defect",
  });
  const findings = reconcile(
    [{ name: "check:a", whenDetached: "fails" }, { name: "check:b", whenDetached: "fails" }, { name: "check:d", whenDetached: "fails" }],
    [],
    observed,
  );
  assert.deepEqual(findings, [
    { name: "check:b", kind: "missing" },
    { name: "check:d", kind: "misattributed", observed: "other" },
    { name: "check:c", kind: "unlisted", observed: "data-root-unavailable" },
  ]);
});

test("a passing sweep produces no findings and never invents one", () => {
  assert.deepEqual(reconcile([{ name: "check:a", whenDetached: "fails" }], [], observe({ "check:a": absent("a") })), []);
});

// A check that keeps working with the archive gone is only acceptable if it
// says which bytes it skipped. Without that sentence "degrades" and "passed
// having verified nothing" are the same observation, and the second is the
// defect that started this file: a gap checker that silently verified 0 of its
// 54 bound tile checksums and reported ok.
test("a check that degrades must print the shortfall it declares", () => {
  const entry = { name: "check:a", whenDetached: "degrades", announces: "data root not mounted" };
  assert.deepEqual(reconcile([entry], [], observe({ "check:a": null })), [{ name: "check:a", kind: "silent-degradation" }]);
  const honest = observe({ "check:a": null });
  honest.set("check:a", { ok: true, kind: "pass", output: "ok, 0 verified against bytes (data root not mounted)" });
  assert.deepEqual(reconcile([entry], [], honest), []);
});

test("a check registered as degrading is a finding when it fails instead", () => {
  const entry = { name: "check:a", whenDetached: "degrades", announces: "skipped" };
  assert.deepEqual(reconcile([entry], [], observe({ "check:a": absent("a") })), [
    { name: "check:a", kind: "degraded-but-failed", observed: "data-root-unavailable" },
  ]);
});

// The other-reasons list exists for failures the archive cannot explain. If an
// absence-attributable failure could sit there, the list would become the place
// to park exactly what the inventory is meant to account for.
test("an absence-attributable failure cannot be parked in the other-reasons list", () => {
  assert.deepEqual(reconcile([], [{ name: "check:a", reason: "needs a live database" }], observe({ "check:a": absent("a") })), [
    { name: "check:a", kind: "absence-parked-elsewhere" },
  ]);
  assert.deepEqual(reconcile([], [{ name: "check:a", reason: "needs a live database" }], observe({ "check:a": "ECONNREFUSED 127.0.0.1:5432" })), []);
});

test("the sweep observes every check, so a passing one can still be judged on what it said", () => {
  const observed = validateEmpirically(["check:a", "check:b", "check:c"], (name) => ({
    ok: name === "check:b",
    output: name === "check:a" ? `ENOENT: no such file or directory, stat ${ROOT}/y` : "AssertionError: real defect",
  }), [], ROOT);
  assert.deepEqual([...observed.keys()], ["check:a", "check:b", "check:c"]);
  assert.deepEqual([...observed.entries()].map(([name, result]) => [name, result.kind]), [
    ["check:a", "data-root-unavailable"],
    ["check:b", "pass"],
    ["check:c", "other"],
  ]);
});

// Running a check whose behaviour the sweep cannot observe would produce an
// answer about the wrong world, so a declared limit is skipped rather than
// guessed at.
test("a check the sweep cannot observe is skipped rather than guessed at", () => {
  const observed = validateEmpirically(["check:a", "check:b"], () => ({ ok: false, output: "boom" }), ["check:b"]);
  assert.deepEqual([...observed.keys()], ["check:a"]);
});

test("every entry declares how it behaves with the archive detached", () => {
  const document = clone(inventory);
  delete document.checks[0].whenDetached;
  assert.throws(() => validateInventory(document, checkScripts), /missing or unexpected fields/);
  const invalid = clone(inventory);
  invalid.checks[0].whenDetached = "sometimes";
  assert.throws(() => validateInventory(invalid, checkScripts), /must declare whether it fails or degrades/);
  assert.deepEqual([...DETACHED_BEHAVIOURS], ["fails", "degrades"]);
});

test("a degrading entry cannot omit the sentence it promises to print", () => {
  const document = clone(inventory);
  const entry = document.checks.find((candidate) => candidate.whenDetached === "degrades");
  entry.announces = "   ";
  assert.throws(() => validateInventory(document, checkScripts), /declared shortfall cannot be blank/);
});

test("a check cannot be both data-root bound and excused as failing for another reason", () => {
  const document = clone(inventory);
  document.failingForOtherReasons.push({ name: document.checks[0].name, reason: "double booked" });
  assert.throws(() => validateInventory(document, checkScripts), /cannot be both/);
});

test("an other-reasons entry without a stated reason fails closed", () => {
  const document = clone(inventory);
  document.failingForOtherReasons[0].reason = "";
  assert.throws(() => validateInventory(document, checkScripts), /needs a stated reason/);
});

// A sweep that names no limits claims it observed everything. These two checks
// pin the resolved root to the canonical SSD path, so an override cannot move
// them and the sweep genuinely cannot see how they behave when it is gone.
test("a sweep with no stated limits claims more than it verified", () => {
  const document = clone(inventory);
  document.detachedSweep.limits = [];
  assert.throws(() => validateInventory(document, checkScripts), /no stated limits/);
});

test("a sweep limit must name a real check and say why it cannot be swept", () => {
  const unknown = clone(inventory);
  unknown.detachedSweep.limits[0].check = "check:never-existed";
  assert.throws(() => validateInventory(unknown, checkScripts), /no longer exists in package\.json/);
  const silent = clone(inventory);
  silent.detachedSweep.limits[0].reason = " ";
  assert.throws(() => validateInventory(silent, checkScripts), /needs a reason it cannot be swept/);
});

// node:test prints the pattern a failed rejects() expected. When a check asserts
// that some other failure says "output differs", an absent archive makes that
// assertion fail and the word comes back inside the echoed pattern. Reading it
// as the check's own finding classified a run with fifteen ENOENT lines as a
// checksum contradiction.
test("a contradiction word quoted back inside an expected pattern is not the check's own finding", () => {
  const echoed = `ENOENT: no such file or directory, open ${ROOT}/derived/a.json\n` +
    "The input did not match the regular expression /aggregate output differs/. Input:\n'ENOENT'";
  assert.equal(classifyFailure(echoed, ROOT), "data-root-unavailable");
  assert.ok(!withoutEchoedExpectations(echoed).includes("differs"));
});

test("stripping the echo never hides a contradiction the check reported itself", () => {
  const both = `The input did not match the regular expression /whatever/.\nAssertionError: recorded sha256 does not match ${ROOT}/derived/a.tif`;
  assert.equal(classifyFailure(both, ROOT), "contradicted");
});

// The sweep spawns every check as a child process, so those children resolve the archive
// through the shared helper while the sweep resolved the inventory's recorded relative
// path against the repository. In a worktree that does not sit beside the data directory
// those two answers disagreed: the sweep recorded "detached" and reported the whole
// inventory as wrong, while every child had read the attached archive and passed. The
// invariant is not which path is right, it is that both must name the same one.
test("the sweep resolves the archive to the same path the checks it spawns do", () => {
  assert.equal(sweepDataRoot(), resolveDataRoot());
});

test("the sweep follows an overridden archive location rather than the repository layout", () => {
  const previous = process.env.WITNESS_TREE_DATA_ROOT;
  process.env.WITNESS_TREE_DATA_ROOT = "/Volumes/Some_Other_Disk/Witness_Tree-data";
  try {
    assert.equal(sweepDataRoot(), "/Volumes/Some_Other_Disk/Witness_Tree-data");
  } finally {
    if (previous === undefined) delete process.env.WITNESS_TREE_DATA_ROOT;
    else process.env.WITNESS_TREE_DATA_ROOT = previous;
  }
});

test("with no override the sweep names the canonical archive, not a path beside the checkout", () => {
  const previous = process.env.WITNESS_TREE_DATA_ROOT;
  delete process.env.WITNESS_TREE_DATA_ROOT;
  try {
    assert.equal(sweepDataRoot(), SSD_DATA_ROOT);
  } finally {
    if (previous !== undefined) process.env.WITNESS_TREE_DATA_ROOT = previous;
  }
});
