import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateV21LineageShape, writeOrVerifyEvidence } from "../scripts/readback-phase2-v21-raster-first.mjs";

function lineage() {
  const years = [1984, 1988, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2022];
  const row = (kind, extra, inputs) => ({ kind, ...extra, output: { path: `${kind}-${extra.year ?? `${extra.fromYear}-${extra.toYear}`}.tif`, byteLength: 1, sha256: "a".repeat(64) }, sidecar: `sidecars/${kind}.json`, inputs, telemetry: { elapsedSeconds: 1, peakRssBytes: 1, scratchDiskPeakBytes: 0, window: [1, 1] }, productionEligible: false, released: false });
  const input = (extra) => ({ ...extra, path: "/tmp/input.tif", byteLength: 1, sha256: "b".repeat(64) });
  return { schemaVersion: "witness-tree/phase2-v21-raster-first-lineage/1", batchId: "phase2-v21-raster-first-1984-2022-v1", status: "local-nonproduction-executed", execution: { noPerCellPolygons: true, concurrency: 1, elapsedSeconds: 1 }, claims: { admitted: false, productionEligible: false, released: false, boundaryAggregationPerformed: false, externalAction: false }, outputs: [...years.map((year) => row("forest-mask-snapshot", { year }, [input({ year })])), ...years.slice(0, -1).map((fromYear, i) => { const toYear = years[i + 1]; return row("whole-interval-loss", { fromYear, toYear }, Array.from({ length: toYear - fromYear }, (_, offset) => input({ fromYear: fromYear + offset, toYear: fromYear + offset + 1 }))); })] };
}
test("readback shape requires exactly the 11 V2.1 snapshots and all 10 complete intervals", () => assert.doesNotThrow(() => validateV21LineageShape(lineage())));
test("readback shape fails closed when one annual input is removed", () => { const fixture = lineage(); fixture.outputs.at(-1).inputs.pop(); assert.throws(() => validateV21LineageShape(fixture), /annual inputs/); });
test("readback shape fails closed when a claim is promoted", () => { const fixture = lineage(); fixture.claims.released = true; assert.throws(() => validateV21LineageShape(fixture), /claims/); });
test("readback command is explicit, local-only, and not wired into CI test", async () => { const source = await readFile(new URL("../scripts/readback-phase2-v21-raster-first.mjs", import.meta.url), "utf8"); const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8"); assert.match(source, /--write-repo-evidence/); assert.match(source, /flag: "wx"/); assert.match(source, /vectorsCreated: false/); assert.match(source, /gdalsrsinfo.*proj4/s); assert.doesNotMatch(source, /expected\.crs\.wkt\).*digest/); assert.match(packageJson, /"readback:phase2-v21-raster-first"/); assert.doesNotMatch(packageJson.match(/"test:unit"[^\n]+/)?.[0] ?? "", /readback:phase2-v21-raster-first/); });
test("readback's vector-free conclusion is bound to the raster-only worker and lineage", async () => { const worker = await readFile(new URL("../scripts/phase2_v21_raster_window.py", import.meta.url), "utf8"); assert.doesNotMatch(worker, /from osgeo import ogr|Polygonize|RasterToPolygon/i); const fixture = lineage(); fixture.execution.noPerCellPolygons = false; assert.throws(() => validateV21LineageShape(fixture), /raster-only/); });

test("evidence writes once, then an exact canonical rerun leaves the recorded bytes unchanged", async () => {
  const directory = await mkdtemp(join(tmpdir(), "witness-tree-v21-readback-"));
  const target = join(directory, "evidence.json");
  const evidence = { schemaVersion: "example/1", counts: { outputs: 21 }, claims: { released: false } };
  try {
    assert.equal(await writeOrVerifyEvidence(evidence, target), "written");
    const initial = await readFile(target, "utf8");
    assert.equal(await writeOrVerifyEvidence({ claims: { released: false }, counts: { outputs: 21 }, schemaVersion: "example/1" }, target), "matched");
    assert.equal(await readFile(target, "utf8"), initial);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("evidence rerun fails loudly on substantive drift and never overwrites the record", async () => {
  const directory = await mkdtemp(join(tmpdir(), "witness-tree-v21-readback-"));
  const target = join(directory, "evidence.json");
  const recorded = { schemaVersion: "example/1", codeProvenance: { runnerSha256: "a".repeat(64) }, counts: { outputs: 21 }, claims: { released: false } };
  try {
    await writeFile(target, `${JSON.stringify(recorded, null, 2)}\n`);
    const initial = await readFile(target, "utf8");
    for (const drifted of [
      { ...recorded, counts: { outputs: 20 } },
      { ...recorded, codeProvenance: { runnerSha256: "b".repeat(64) } },
      { ...recorded, verifiedAt: "2026-08-31T00:00:00.000Z" },
    ]) {
      await assert.rejects(writeOrVerifyEvidence(drifted, target), /recorded evidence differs from the fresh readback/);
    }
    assert.equal(await readFile(target, "utf8"), initial);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
