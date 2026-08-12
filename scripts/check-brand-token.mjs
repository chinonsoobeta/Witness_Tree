import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_ROOTS = ["app", "components", "lib"];
const BRAND_FILE = path.normalize("lib/domain/brand.ts");
const PRODUCT_NAMES = ["Witness Tree", "Arbre témoin"];

async function sourceFiles(root) {
  const files = [];
  async function walk(relative) {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (/\.tsx?$/.test(entry.name)) files.push(child);
    }
  }
  for (const directory of SOURCE_ROOTS) await walk(directory);
  return files;
}

export async function checkBrandToken(root = process.cwd()) {
  const files = await sourceFiles(root);
  const violations = [];
  for (const relative of files) {
    const source = await readFile(path.join(root, relative), "utf8");
    if (path.normalize(relative) === BRAND_FILE) {
      if (!PRODUCT_NAMES.every((name) => source.includes(name))) violations.push(`${relative}: localized product-name pair is incomplete`);
      continue;
    }
    for (const name of PRODUCT_NAMES) if (source.includes(name)) violations.push(`${relative}: hard-coded product name ${JSON.stringify(name)}`);
  }
  if (violations.length) throw new Error(`Brand-token gate failed:\n${violations.join("\n")}`);
  return { files: files.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkBrandToken();
  console.log(`Brand-token gate passed for ${result.files} source files.`);
}
