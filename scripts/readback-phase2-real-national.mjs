import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

async function sha(file) { const h = createHash("sha256"); for await (const chunk of createReadStream(file)) h.update(chunk); return h.digest("hex"); }
const root = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Usage: readback-phase2-real-national <output-directory>");
const lineageFile = join(root, "lineage.json");
const lineage = JSON.parse(await readFile(lineageFile, "utf8"));
assert.equal(lineage.status, "versioned-nonproduction"); assert.equal(lineage.productionEligible, false); assert.deepEqual(lineage.forestClassValues, [210,220,230]); assert.deepEqual(lineage.excludedClassValues, [81]);
assert.equal(lineage.outputs.length, 79); assert.equal(new Set(lineage.outputs.map((x) => x.path)).size, 79);
const actual = [];
for (const dir of ["masks","loss","disturbance"]) for (const name of await readdir(join(root, dir))) actual.push(`${dir}/${name}`);
assert.deepEqual(actual.sort(), lineage.outputs.map((x) => x.path).sort());
for (const row of lineage.outputs) {
  const file = join(root, row.path); assert.equal((await stat(file)).size, row.byteLength); assert.equal(await sha(file), row.sha256);
  const info = spawnSync("gdalinfo", ["-json", file], { encoding:"utf8" }); assert.equal(info.status, 0, info.stderr);
  const parsed = JSON.parse(info.stdout); assert.deepEqual(parsed.size, [193936,128340]); assert.equal(parsed.bands.length, 1);
  if (row.kind === "forest-mask" || row.kind === "detected-forest-loss") { assert.equal(parsed.bands[0].type, "Byte"); assert.equal(parsed.bands[0].noDataValue, 255); }
  else assert.equal(parsed.bands[0].type, "UInt16");
}
console.log(JSON.stringify({status:"readback-passed",outputCount:79,totalBytes:lineage.outputs.reduce((s,x)=>s+x.byteLength,0),lineageSha256:await sha(lineageFile),productionEligible:false}));
