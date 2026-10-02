import { readFile, stat, readdir } from "node:fs/promises";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { gzipSync } from "node:zlib";

export const SHARED_LIMIT = 128 * 1024;
export const EXPLORE_LIMIT = 400 * 1024;

const manifestPath = (root) => path.join(root, ".vite", "manifest.json");
const hasExploreName = (key, entry) => /explore/i.test(`${key} ${entry.name ?? ""} ${entry.src ?? ""}`);
const isFramework = (_key, entry) => entry.name === "framework" || entry.isFramework === true;

async function loadManifest(root) {
  let text;
  try {
    text = await readFile(manifestPath(root), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Budget manifest is required: ${manifestPath(root)}.`);
    throw error;
  }
  try {
    const manifest = JSON.parse(text);
    if (!manifest || Array.isArray(manifest) || Object.keys(manifest).length === 0) throw new Error("Manifest is empty.");
    return manifest;
  } catch (error) {
    throw new Error(`Budget manifest is invalid: ${error.message}`);
  }
}

async function serverOnlyExplore(exploreSource) {
  let source;
  try {
    source = await readFile(exploreSource, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Explore source is required to justify a zero Explore budget: ${exploreSource}.`);
    throw error;
  }
  if (/^[\t ]*["']use client["'];?/m.test(source)) throw new Error("Explore budget is zero but the Explore route is a client component.");
}

async function reachableEntries(root, manifest) {
  const entryKeys = Object.entries(manifest).filter(([, entry]) => entry?.isEntry).map(([key]) => key);
  if (!entryKeys.length) throw new Error("Budget manifest has no attributable entry.");
  const seen = new Set();
  const stack = [...entryKeys];
  while (stack.length) {
    const key = stack.pop();
    if (seen.has(key)) continue;
    const entry = manifest[key];
    if (!entry?.file || typeof entry.file !== "string") throw new Error(`Budget manifest entry is unattributable: ${key}.`);
    seen.add(key);
    for (const dependency of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) {
      if (!manifest[dependency]) throw new Error(`Budget manifest dependency is unattributable: ${dependency}.`);
      stack.push(dependency);
    }
  }
  return Promise.all([...seen].map(async (key) => {
    const entry = manifest[key];
    const file = path.join(root, entry.file);
    try {
      const bytes = await readFile(file);
      return { key, entry, file, rawSize: (await stat(file)).size, gzipSize: gzipSync(bytes).length };
    } catch (error) {
      if (error.code === "ENOENT") throw new Error(`Budget artifact is required: ${file}.`);
      throw error;
    }
  }));
}

function dependencyClosure(manifest, roots) {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const key = stack.pop();
    if (seen.has(key) || !manifest[key]) continue;
    seen.add(key);
    const entry = manifest[key];
    stack.push(...(entry.imports ?? []), ...(entry.dynamicImports ?? []));
  }
  return seen;
}

function staticDependencyClosure(manifest, roots) {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const key = stack.pop();
    if (seen.has(key) || !manifest[key]) continue;
    seen.add(key);
    stack.push(...(manifest[key].imports ?? []));
  }
  return seen;
}

export async function checkBudgets(root = path.resolve("dist/client"), { exploreSource = path.resolve("app/en/explore/page.tsx"), manifest: suppliedManifest } = {}) {
  const manifest = suppliedManifest ?? await loadManifest(root);
  const artifacts = await reachableEntries(root, manifest);
  const application = artifacts.filter(({ key, entry }) => !isFramework(key, entry));
  const entryKeys = Object.entries(manifest).filter(([, entry]) => entry?.isEntry).map(([key]) => key);
  const sharedRoots = staticDependencyClosure(manifest, entryKeys);
  const exploreRoots = Object.entries(manifest).filter(([key, entry]) => hasExploreName(key, entry)).map(([key]) => key);
  const exploreClosure = dependencyClosure(manifest, exploreRoots);
  const exploreArtifacts = application.filter(({ key }) => exploreClosure.has(key) && (!sharedRoots.has(key) || exploreRoots.includes(key)));
  const exploreKeys = new Set(exploreArtifacts.map(({ key }) => key));
  const sharedArtifacts = application.filter(({ key }) => !exploreKeys.has(key));
  const rawShared = sharedArtifacts.reduce((sum, artifact) => sum + artifact.rawSize, 0);
  const rawExplore = exploreArtifacts.reduce((sum, artifact) => sum + artifact.rawSize, 0);
  const gzipShared = sharedArtifacts.reduce((sum, artifact) => sum + artifact.gzipSize, 0);
  const gzipExplore = exploreArtifacts.reduce((sum, artifact) => sum + artifact.gzipSize, 0);
  if (gzipExplore === 0) await serverOnlyExplore(exploreSource);
  if (gzipShared >= SHARED_LIMIT || gzipExplore >= EXPLORE_LIMIT) {
    throw new Error(`Budget gate failed: shared gzip ${gzipShared}/${SHARED_LIMIT} bytes (raw ${rawShared}); explore gzip ${gzipExplore}/${EXPLORE_LIMIT} bytes (raw ${rawExplore}).`);
  }
  return { status: "measured", rawShared, rawExplore, gzipShared, gzipExplore, files: application.length };
}

// Next.js lists the chunks needed by each client module. Follow emitted chunk
// references too, so lazy map imports count against the same Explore budget.
export async function nextBudgetManifest(root) {
  const build = JSON.parse(await readFile(path.join(root, "build-manifest.json"), "utf8"));
  const appPaths = JSON.parse(await readFile(path.join(root, "server/app-paths-manifest.json"), "utf8"));
  const sources = new Map();
  const add = (file, source) => {
    if (!file.endsWith(".js")) return;
    const normalized = file.replace(/^\/_next\//, "");
    if (!sources.has(normalized)) sources.set(normalized, new Set());
    sources.get(normalized).add(source);
  };
  for (const file of [...build.rootMainFiles, ...build.polyfillFiles]) add(file, "framework");
  for (const [route, serverFile] of Object.entries(appPaths)) {
    if (!route.endsWith("/page")) continue;
    const file = path.join(root, "server", serverFile.replace(/\.js$/, "_client-reference-manifest.js"));
    const context = {};
    runInNewContext(await readFile(file, "utf8"), context);
    for (const manifest of Object.values(context.__RSC_MANIFEST ?? {})) {
      for (const [module, entry] of Object.entries(manifest.clientModules)) {
        const framework = module.includes("/node_modules/next/");
        for (const chunk of entry.chunks) add(chunk, framework ? "framework" : route);
      }
    }
  }
  const files = (await readdir(path.join(root, "static/chunks"))).filter((file) => file.endsWith(".js"));
  const dependencies = new Map();
  for (const file of files) {
    const key = `static/chunks/${file}`;
    const source = await readFile(path.join(root, key), "utf8");
    dependencies.set(key, files.filter((name) => name !== file && source.includes(name)).map((name) => `static/chunks/${name}`));
  }
  // A module's lazy dependencies inherit its route attribution.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [file, owners] of [...sources]) {
      for (const dependency of dependencies.get(file) ?? []) {
        const before = sources.get(dependency)?.size ?? 0;
        for (const owner of owners) add(dependency, owner);
        if (sources.get(dependency).size !== before) changed = true;
      }
    }
  }
  const manifest = {};
  for (const file of files) {
    const key = `static/chunks/${file}`;
    const owners = sources.get(key);
    if (!owners) throw new Error(`Budget chunk is unattributable: ${key}.`);
    const routes = [...owners].filter((owner) => owner !== "framework");
    manifest[key] = { file: key, isEntry: true,
      isFramework: routes.length === 0,
      name: routes.length > 0 && routes.every((route) => /\/(explore|explorer)(\/|$)/.test(route)) ? "Explore" : "shared" };
  }
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(".next");
  const result = await checkBudgets(root, { manifest: await nextBudgetManifest(root) });
  console.log(`Budget gate passed: shared gzip ${result.gzipShared} bytes (raw ${result.rawShared}); explore gzip ${result.gzipExplore} bytes (raw ${result.rawExplore}).`);
}
