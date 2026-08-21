import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import canonicalManifest from "../data/phase3-example-download-manifest.json" with { type: "json" };
import { PLACE_PROVINCES, PLACE_TYPES } from "../lib/places/types.ts";

const canonicalPlaceIds = PLACE_PROVINCES.flatMap((province) => PLACE_TYPES.map((type) => `${province.toLowerCase()}-${type}`)).sort();

export async function checkPhase3Downloads({ manifest = canonicalManifest, publicRoot = path.resolve("public") } = {}) {
  if (manifest.schemaVersion !== "witness-tree/phase3-example-download-manifest/1" || manifest.status !== "example" || manifest.reviewStatus !== "unapproved" || manifest.productionEligible !== false || manifest.entries.length !== 32) throw new Error("Download manifest must contain exactly 32 bounded example entries.");
  const manifestPlaceIds = manifest.entries.map(({ placeId }) => placeId);
  if (new Set(manifestPlaceIds).size !== manifestPlaceIds.length) throw new Error("Download manifest place IDs must be unique.");
  if (JSON.stringify([...manifestPlaceIds].sort()) !== JSON.stringify(canonicalPlaceIds)) throw new Error("Download manifest place IDs must exactly match the registry place-ID set.");
  const ids = new Set();
  const placeIds = new Set();
  for (const entry of manifest.entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate download manifest ID: ${entry.id}.`);
    ids.add(entry.id);
    if (placeIds.has(entry.placeId)) throw new Error(`Duplicate download place ID: ${entry.placeId}.`);
    placeIds.add(entry.placeId);
    if (entry.id !== `${entry.placeId}-download` || entry.href !== `/examples/downloads/${entry.placeId}.csv` || entry.status !== "example" || entry.reviewStatus !== "unapproved" || entry.productionEligible !== false || entry.mediaType !== "text/csv") throw new Error(`${entry.id}: invalid download boundary.`);
    const bytes = await readFile(path.join(publicRoot, entry.href));
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== entry.bytes || digest !== entry.sha256) throw new Error(`${entry.id}: download checksum or byte-length drift.`);
    const text = bytes.toString("utf8");
    if (text !== `status,reviewStatus,productionEligible,placeId\nexample,unapproved,false,${entry.placeId}\n`) throw new Error(`${entry.id}: download content is not the deterministic bounded example.`);
  }
  return { files: ids.size };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(`Phase 3 example downloads passed for ${(await checkPhase3Downloads()).files} checksum-bound files.`);
