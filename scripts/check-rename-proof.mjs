import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const PRODUCT_DISPLAY_NAMES = Object.freeze(["Witness Tree", "Arbre témoin"]);

const durableKey = /(id|identifier|slug|path|url|key|filename|route|release|snapshot|archive)$/i;
const durableSourceField = /(?:id|identifier|slug|path|url|key|filename|route|release|snapshot|archive)(?:Id|Key|Path|Url|Filename)?\s*:\s*[`'"]([^`'"]+)[`'"]/g;

function containsProductName(value) {
  return PRODUCT_DISPLAY_NAMES.find((name) => value.includes(name));
}

export function assertDurableIdentifiersAreBrandNeutral(values) {
  for (const value of values) {
    const name = containsProductName(String(value));
    if (name) throw new Error(`Durable identifier contains product display name: ${name}`);
  }
}

function collectJsonDurableValues(value, values = []) {
  if (Array.isArray(value)) {
    for (const child of value) collectJsonDurableValues(child, values);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (durableKey.test(key) && typeof child === "string") values.push(child);
      collectJsonDurableValues(child, values);
    }
  }
  return values;
}

async function filesBelow(root, relative) {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(root, child));
    else files.push(child);
  }
  return files;
}

export async function checkRenameProof(root = process.cwd()) {
  const appFiles = await filesBelow(root, "app");
  assertDurableIdentifiersAreBrandNeutral(appFiles.map((file) => file.replaceAll(path.sep, "/")));

  const durableValues = [];
  for (const relative of await filesBelow(root, "data")) {
    if (!relative.endsWith(".json")) continue;
    collectJsonDurableValues(JSON.parse(await readFile(path.join(root, relative), "utf8")), durableValues);
  }
  for (const relative of await filesBelow(root, "lib")) {
    if (!/\.(?:ts|tsx|js|mjs)$/.test(relative)) continue;
    const source = await readFile(path.join(root, relative), "utf8");
    for (const match of source.matchAll(durableSourceField)) durableValues.push(match[1]);
  }
  assertDurableIdentifiersAreBrandNeutral(durableValues);
  return Object.freeze({ routeFiles: appFiles.length, durableValues: durableValues.length });
}

export function simulateProductNameOverride(image, oldName, newName) {
  assertDurableIdentifiersAreBrandNeutral([image.id, image.filename]);
  const svg = image.svg.replaceAll(oldName, newName);
  return Object.freeze({ ...image, svg });
}

export function assertRenameOutput(image, oldName) {
  assertDurableIdentifiersAreBrandNeutral([image.id, image.filename]);
  if (image.svg.includes(oldName)) throw new Error(`Generated share image retains old display name: ${oldName}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkRenameProof();
  console.log(`Rename-proof gate passed for ${result.routeFiles} route files and ${result.durableValues} durable values.`);
}
