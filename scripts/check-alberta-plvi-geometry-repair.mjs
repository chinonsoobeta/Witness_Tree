import { readFile } from "node:fs/promises";

const SHA256 = /^[a-f0-9]{64}$/;
const IDS = [17119, 17583, 17931, 19384, 20217, 21021, 21992, 23014, 40392, 50824, 82560, 161140];

export function validateAlbertaPlviGeometryRepair(run) {
  if (!run || run.status !== "local-geometry-repair-patch" || run.sourceId !== "ab-primary-land-vegetation" || run.rawArchiveSha256 !== "017a0a835c680ca1b6c1eb790322a28e1b4c0c64e36924da46d8bb99cb1571d3") throw new Error("PLVI repair must remain bound to the exact staged raw archive.");
  if (run.rule?.function !== "GDAL SQLite ST_MakeValid(geometry)" || run.rule.relativeAreaTolerance !== 1e-9) throw new Error("PLVI repair policy must keep its deterministic function and tolerance.");
  const patch = run.patch;
  if (!patch || !SHA256.test(patch.sha256) || patch.byteLength !== 623651 || patch.featureCount !== 12 || patch.crs !== "EPSG:3400" || patch.invalidGeometryCount !== 0 || patch.nonPolygonCount !== 0 || !(patch.maxRelativeAreaDelta <= run.rule.relativeAreaTolerance)) throw new Error("PLVI patch must be checksummed, valid, polygon-only, complete, and within tolerance.");
  if (!Array.isArray(run.features) || run.features.length !== IDS.length || run.features.map((feature) => feature.polygonId).join(",") !== IDS.join(",")) throw new Error("PLVI repair must account for every invalid polygon exactly once.");
  for (const feature of run.features) if (feature.reason !== "Ring Self-intersection" || !(feature.sourceArea > 0) || !(feature.relativeAreaDelta <= run.rule.relativeAreaTolerance)) throw new Error("PLVI repair feature evidence is incomplete or exceeds tolerance.");
  if (run.immutableObjectStorage !== false || run.ownerAdmissionReady !== false || run.productionEligible !== false) throw new Error("A local repair patch must not claim immutable storage, owner admission, or production eligibility.");
  return run;
}

export async function checkAlbertaPlviGeometryRepair(file = new URL("../data/transformation-runs/alberta-plvi-geometry-repair-v1-2026-08-14.json", import.meta.url)) {
  return validateAlbertaPlviGeometryRepair(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await checkAlbertaPlviGeometryRepair();
  console.log("Alberta PLVI geometry repair patch passed its fail-closed evidence gate.");
}
