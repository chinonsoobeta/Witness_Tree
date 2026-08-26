import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Plan section 1.4 and the Phase 0 exit criteria: the product name lives in one token, and no persistent
// identifier carries it, so a citation survives a rename without a redirect. This gate gives that second half
// a test. It reads the name from lib/domain/brand.ts rather than repeating it, so renaming the product renames
// what this gate looks for.
const BRAND_FILE = "lib/domain/brand.ts";
const ROUTE_ROOT = "app";
// Local filesystem paths are deliberately out of scope. The repository directory and the data root carry the
// product name and are not published identifiers; a citation never resolves through them.
const IDENTIFIER_SOURCES = ["app", "lib", "components"];
const PATH_LITERAL = /["'`](\/[A-Za-z0-9\-_/.[\]{}$:]*)["'`]/g;

const strip = (value) => value.normalize("NFD").replace(/[̀-ͯ]/g, "");

export function identifierForms(productNames) {
  const forms = new Set();
  for (const name of productNames) {
    const plain = strip(name).toLowerCase();
    const words = plain.split(/\s+/).filter(Boolean);
    for (const joiner of ["", "-", "_", "."]) forms.add(words.join(joiner));
  }
  return [...forms].filter((form) => form.length > 2);
}

async function productNames(root) {
  const source = await readFile(path.join(root, BRAND_FILE), "utf8");
  const names = [...source.matchAll(/(?:en|fr):\s*"([^"]+)"/g)].map((match) => match[1]);
  const declared = names.slice(0, 2);
  if (declared.length !== 2) throw new Error("The brand token must declare an English and a French product name.");
  return declared;
}

async function walk(root, relative, collect) {
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      collect.segments.push({ segment: entry.name, where: child });
      await walk(root, child, collect);
    } else if (/\.(tsx?|mts)$/.test(entry.name)) {
      collect.files.push(child);
    }
  }
}

export async function checkPersistentIdentifiers(root = process.cwd()) {
  const forms = identifierForms(await productNames(root));
  const carries = (value) => { const flat = strip(value).toLowerCase(); return forms.some((form) => flat.includes(form)); };

  const routes = { segments: [], files: [] };
  await walk(root, ROUTE_ROOT, routes);
  const violations = routes.segments.filter((entry) => carries(entry.segment))
    .map((entry) => `${entry.where}: route segment carries the product name`);

  const literals = { segments: [], files: [] };
  for (const directory of IDENTIFIER_SOURCES) await walk(root, directory, literals);
  let checked = 0;
  for (const relative of literals.files) {
    const source = await readFile(path.join(root, relative), "utf8");
    for (const match of source.matchAll(PATH_LITERAL)) {
      checked += 1;
      if (carries(match[1])) violations.push(`${relative}: path ${JSON.stringify(match[1])} carries the product name`);
    }
  }

  if (violations.length) throw new Error(`Persistent-identifier gate failed:\n${violations.join("\n")}`);
  return { routeSegments: routes.segments.length, pathLiterals: checked, forms };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkPersistentIdentifiers();
  console.log(`Persistent-identifier gate passed for ${result.routeSegments} route segments and ${result.pathLiterals} path literals.`);
}
