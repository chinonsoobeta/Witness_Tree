import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const GRID={width:193936,height:128340,originX:-2660910.524,originY:2998848.1105,pixelWidth:30,pixelHeight:-30,crsWktSha256:"221435cb5f13c37ec9936a21dc113d2184e3f5fcb1e4eb1a21b891e39cfd6882"};
const METHOD={version:"phase2-owner-approved-versioned-nonproduction-v1",sha256:"8d12ff6b6fb10208410bedf5f012e96a9682fdec457cccce688509d2dfa0b8fa"};
function canonical(value){if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;if(value&&typeof value==="object")return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;return JSON.stringify(value);}
const sha=value=>createHash("sha256").update(canonical(value)).digest("hex");
function geometry(cells){return {type:"MultiPolygon",crsWktSha256:GRID.crsWktSha256,coordinates:cells.map(cell=>{const row=Math.floor(cell/GRID.width),column=cell%GRID.width,x0=GRID.originX+column*30,y0=GRID.originY-row*30,x1=x0+30,y1=y0-30;return [[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]];})};}
export function realDetectedChangeEvent({fromYear,toYear,cellIndices,sourceLossSha256}){
  assert.equal(toYear,fromYear+1);assert.match(sourceLossSha256,/^[0-9a-f]{64}$/);const cells=[...cellIndices];assert.deepEqual(cells,[...new Set(cells)].sort((a,b)=>a-b));assert.ok(cells.length>0);
  const set=new Set(cells);for(const cell of cells){assert.ok(Number.isSafeInteger(cell)&&cell>=0&&cell<GRID.width*GRID.height);}const visited=new Set([cells[0]]),stack=[cells[0]];while(stack.length){const cell=stack.pop(),row=Math.floor(cell/GRID.width);for(const next of [cell-GRID.width,cell+GRID.width,cell-1,cell+1])if(set.has(next)&&!visited.has(next)&&(Math.floor(next/GRID.width)===row||next%GRID.width===cell%GRID.width)){visited.add(next);stack.push(next);}}assert.equal(visited.size,cells.length,"Patch cells must be one four-connected component.");
  const patchGeometry=geometry(cells),core={batchId:"phase2-real-national-1984-2022-v1",fromYear,toYear,sourceLossSha256,methodVersion:METHOD.version,methodParameterSha256:METHOD.sha256,grid:GRID,cellIndices:cells,geometry:patchGeometry},patchChecksumSha256=sha(core);
  return {status:"versioned-nonproduction",eventId:`detected-change-${toYear}-${patchChecksumSha256.slice(0,24)}`,category:"detected-change",evidence:"satellite-observation",observationYear:toYear,eventStart:`${toYear}-01-01`,eventEnd:`${toYear}-12-31`,geometry:patchGeometry,areaHectares:cells.length*0.09,cellIndices:cells,lineage:{batchId:core.batchId,sourceLossSha256,fromYear,toYear,sourceLossValue:1},methodVersion:METHOD.version,methodParameterSha256:METHOD.sha256,coverageGrade:"national-baseline",patchChecksumSha256,released:false,productionEligible:false};
}
