import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const owner=await readFile(new URL("../docs/PHASE2_REAL_DATA_OWNER_DECISION.md",import.meta.url),"utf8");
const matrix=await readFile(new URL("../docs/PLAN_GAP_MATRIX.md",import.meta.url),"utf8");
const status=await readFile(new URL("../docs/IMPLEMENTATION_STATUS.md",import.meta.url),"utf8");
const phase2Row=matrix.split("\n").find(line=>line.startsWith("| **2. National baseline pipeline (1984–2022)**"));

test("Phase 2 status documents pin the independently audited 51-point allocation",()=>{
  const allocation=/dependencies (\d+)\/20, core methods (\d+)\/35, required outputs (\d+)\/20, validation (\d+)\/15 and publication\/exit (\d+)\/10/.exec(owner);
  assert.ok(allocation);
  assert.deepEqual(allocation.slice(1).map(Number),[4,20,14,12,1]);
  assert.equal(allocation.slice(1).map(Number).reduce((sum,value)=>sum+value,0),51);
  assert.match(owner,/independently passed technical audit at \*\*51% \(\+8 percentage points from 43%\)\*\*/);
  assert.doesNotMatch(owner,/prospective fixed-rubric ceiling|pending independent audit|dependencies 5\/20|core methods 21\/35|required outputs 12\/20/);
});

test("the current Phase 2 matrix records the real raster batch and every retained gap",()=>{
  assert.ok(phase2Row);
  assert.match(phase2Row,/41 checksum-bound local inputs/);
  assert.match(phase2Row,/39 annual forest masks, 38 continuous annual detected-loss rasters and two historical disturbance rasters/);
  assert.match(phase2Row,/All 79 outputs \(23,141,889,028 bytes\) passed exact checksum, lineage and GeoTIFF readback/);
  for(const gap of ["Vectorize the real loss rasters into patches and normalized events","all eight versioned boundary intersections and aggregates","independent validation samples and statistics","generate tiles/downloads","complete release and exit evidence"])assert.match(phase2Row,new RegExp(gap));
  assert.match(phase2Row,/\| \*\*51%\*\* \|$/);
  assert.doesNotMatch(phase2Row,/illustrative annual fixtures|Fetch and process NTEMS|create annual masks|\*\*15%\*\*/);
  assert.match(status,/independently audited fixed-rubric score is 51%; it is not production maturity/);
});
