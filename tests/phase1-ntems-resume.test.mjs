import assert from "node:assert/strict";
import test from "node:test";
import { parseOptions, resumeOutcome } from "../scripts/run-phase1-ntems-transform.mjs";

const plan = {
  output: "/out/annual-land-cover-1986.tif",
  sidecar: "/out/annual-land-cover-1986.tif.sidecar.json",
  relativeOutput: "annual-land-cover-1986.tif",
  specification: { id: "ntems-annual-land-cover-v1", methodVersion: "v1" },
  input: { path: "raw/nrcan-annual-land-cover-v2/2026-08-12/CA_forest_VLCE2_1986.zip", sha256: "a".repeat(64), byteLength: 1024, member: "CA_forest_VLCE2_1986.tif", year: 1986 },
};

const goodSidecar = {
  schemaVersion: "witness-tree/phase1-ntems-transformation-sidecar/1",
  specId: "ntems-annual-land-cover-v1",
  methodVersion: "v1",
  inputBindings: [plan.input],
  output: { path: "annual-land-cover-1986.tif", format: "GTiff" },
  outputSha256: "b".repeat(64),
  outputByteLength: 2048,
};

const world = ({ sidecar = goodSidecar, sha = "b".repeat(64), size = 2048, output = true, side = true } = {}) => ({
  read: () => structuredClone(sidecar),
  hash: () => sha,
  size: () => size,
  present: (file) => (file === plan.output ? output : side),
});

test("a year with no prior output is produced", () => {
  const w = world({ output: false, side: false });
  assert.deepEqual(resumeOutcome(plan, w.read, w.hash, w.size, w.present), { action: "produce" });
});

test("a complete and exactly matching prior output is skipped, never rewritten", () => {
  const w = world();
  assert.deepEqual(resumeOutcome(plan, w.read, w.hash, w.size, w.present), { action: "skip", sha256: "b".repeat(64), byteLength: 2048 });
});

test("a half-written pair stops the run in either direction", () => {
  const missingSidecar = world({ side: false });
  assert.throws(() => resumeOutcome(plan, missingSidecar.read, missingSidecar.hash, missingSidecar.size, missingSidecar.present), /raster exists without its sidecar/);
  const missingRaster = world({ output: false });
  assert.throws(() => resumeOutcome(plan, missingRaster.read, missingRaster.hash, missingRaster.size, missingRaster.present), /sidecar exists without its raster/);
});

test("a prior output that no longer matches its own sidecar is never accepted", () => {
  const wrongSha = world({ sha: "c".repeat(64) });
  assert.throws(() => resumeOutcome(plan, wrongSha.read, wrongSha.hash, wrongSha.size, wrongSha.present), /no longer matches its sidecar SHA-256/);
  const wrongSize = world({ size: 4096 });
  assert.throws(() => resumeOutcome(plan, wrongSize.read, wrongSize.hash, wrongSize.size, wrongSize.present), /no longer matches its sidecar byte length/);
});

test("a prior output produced from a different source is never accepted", () => {
  for (const [field, value] of [["path", "raw/other.zip"], ["sha256", "d".repeat(64)], ["byteLength", 99], ["member", "CA_forest_VLCE2_1987.tif"]]) {
    const w = world({ sidecar: { ...goodSidecar, inputBindings: [{ ...plan.input, [field]: value }] } });
    assert.throws(() => resumeOutcome(plan, w.read, w.hash, w.size, w.present), new RegExp(`${field} differs`));
  }
  const wrongYear = world({ sidecar: { ...goodSidecar, inputBindings: [{ ...plan.input, year: 1987 }] } });
  assert.throws(() => resumeOutcome(plan, wrongYear.read, wrongYear.hash, wrongYear.size, wrongYear.present), /different source year/);
});

test("a prior output from another specification, method version or path is never accepted", () => {
  const otherSpec = world({ sidecar: { ...goodSidecar, specId: "ntems-canopy-cover-v1" } });
  assert.throws(() => resumeOutcome(plan, otherSpec.read, otherSpec.hash, otherSpec.size, otherSpec.present), /specification ntems-canopy-cover-v1/);
  const otherMethod = world({ sidecar: { ...goodSidecar, methodVersion: "v2" } });
  assert.throws(() => resumeOutcome(plan, otherMethod.read, otherMethod.hash, otherMethod.size, otherMethod.present), /method version v2/);
  const otherPath = world({ sidecar: { ...goodSidecar, output: { path: "annual-land-cover-1987.tif" } } });
  assert.throws(() => resumeOutcome(plan, otherPath.read, otherPath.hash, otherPath.size, otherPath.present), /records a different output path/);
});

test("an unreadable or foreign sidecar stops the run rather than being ignored", () => {
  const unreadable = world();
  unreadable.read = () => { throw new Error("bad json"); };
  assert.throws(() => resumeOutcome(plan, unreadable.read, unreadable.hash, unreadable.size, unreadable.present), /unreadable/);
  const foreign = world({ sidecar: { schemaVersion: "something/else" } });
  assert.throws(() => resumeOutcome(plan, foreign.read, foreign.hash, foreign.size, foreign.present), /not a Phase 1 NTEMS sidecar/);
});

test("--resume requires --execute and is off by default", () => {
  assert.equal(parseOptions(["--execute"]).resume, false);
  assert.equal(parseOptions(["--execute", "--resume"]).resume, true);
  assert.throws(() => parseOptions(["--resume"]), /only meaningful with --execute/);
  assert.throws(() => parseOptions(["--preflight", "--resume"]), /only meaningful with --execute/);
});
