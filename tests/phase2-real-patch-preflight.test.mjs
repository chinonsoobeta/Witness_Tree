import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { realDetectedChangeEvent } from "../scripts/phase2-real-patch-contract.mjs";
import { validateRealPatchPreflight } from "../scripts/check-phase2-real-patch-preflight.mjs";

const record=JSON.parse(await readFile(new URL("../data/phase2-real-patch-vectorization-preflight.json",import.meta.url),"utf8"));
test("bounded profile remains checksum-bound and blocks an unproved national run",()=>assert.equal(validateRealPatchPreflight(structuredClone(record)).nationalExecutionStarted,false));
test("real patch records have stable four-connected identity, geometry, area, and non-production status",()=>{const input={fromYear:2021,toYear:2022,cellIndices:[0,1,193936],sourceLossSha256:"5b6661bcd7ec6f5e3c97431a2532d4fe325dc2fdfd70bd53e6a7ea5a8cc3c84d"},first=realDetectedChangeEvent(input),second=realDetectedChangeEvent(input);assert.deepEqual(first,second);assert.equal(first.geometry.coordinates.length,3);assert.equal(first.areaHectares,0.27);assert.equal(first.lineage.sourceLossSha256,input.sourceLossSha256);assert.match(first.eventId,/^detected-change-2022-[0-9a-f]{24}$/);assert.equal(first.released,false);assert.equal(first.productionEligible,false);});
test("patch contract rejects gaps, unstable order, duplicate cells, wrong years, and source drift",()=>{const base={fromYear:2021,toYear:2022,sourceLossSha256:"a".repeat(64)};for(const cellIndices of [[0,2],[1,0],[0,0]])assert.throws(()=>realDetectedChangeEvent({...base,cellIndices}));assert.throws(()=>realDetectedChangeEvent({...base,toYear:2023,cellIndices:[0]}));assert.throws(()=>realDetectedChangeEvent({...base,sourceLossSha256:"bad",cellIndices:[0]}));});
test("preflight rejects invented capacity, execution, release, and removed blockers",()=>{for(const mutate of [x=>x.absoluteContractBound.passes=true,x=>x.nationalExecutionStarted=true,x=>x.productionEligible=true,x=>x.released=true,x=>x.blockers.pop()]){const changed=structuredClone(record);mutate(changed);assert.throws(()=>validateRealPatchPreflight(changed));}});
