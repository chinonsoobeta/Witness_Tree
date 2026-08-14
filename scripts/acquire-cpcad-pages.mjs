import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const source = "https://maps-cartes.ec.gc.ca/arcgis/rest/services/CWS_SCF/CPCAD/MapServer/0/query";
const stage = process.argv[2];
if (!stage) throw new Error("Usage: node scripts/acquire-cpcad-pages.mjs <external-staging-directory>");
const manifest = JSON.parse(await readFile(join(stage, "object-id-manifest.json"), "utf8"));
const ids = manifest.objectIds;
if (!Array.isArray(ids) || ids.length !== 22438 || new Set(ids).size !== ids.length) throw new Error("Authoritative ID manifest is not the expected unique 22,438 IDs.");
const pages = join(stage, "pages");
await mkdir(pages, { recursive: true });
const hashes = [];
for (let offset = 0; offset < ids.length; offset += 500) {
  const batch = ids.slice(offset, offset + 500);
  const name = `${String(offset / 500).padStart(3, "0")}.geojson`;
  const target = join(pages, name);
  let bytes;
  try { bytes = await readFile(target); } catch {
    const params = new URLSearchParams({ objectIds: batch.join(","), outFields: "*", returnGeometry: "true", outSR: "3978", f: "geojson" });
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { const response = await fetch(`${source}?${params}`); if (!response.ok) throw new Error(`HTTP ${response.status}`); bytes = Buffer.from(await response.arrayBuffer()); break; } catch (error) { last = error; }
    }
    if (!bytes) throw last;
    const parsed = JSON.parse(bytes);
    const returned = parsed.features?.map((feature) => feature.id).sort((a, b) => a - b);
    if (parsed.exceededTransferLimit || !Array.isArray(returned) || returned.length !== batch.length || returned.some((id, i) => id !== batch[i])) throw new Error(`Invalid exact response for ${name}.`);
    const temp = `${target}.tmp`; await writeFile(temp, bytes, { flag: "wx" }); await rename(temp, target);
  }
  const parsed = JSON.parse(bytes);
  const returned = parsed.features?.map((feature) => feature.id).sort((a, b) => a - b);
  if (parsed.exceededTransferLimit || returned?.length !== batch.length || returned.some((id, i) => id !== batch[i])) throw new Error(`Existing page ${name} fails exact validation.`);
  hashes.push({ name, sha256: createHash("sha256").update(bytes).digest("hex"), ids: batch.length });
  console.log(`${name} ${batch.length}`);
}
await writeFile(join(stage, "page-manifest.json"), `${JSON.stringify({ source, pageSize: 500, expectedIds: ids.length, pages: hashes }, null, 2)}\n`, { flag: "w" });
