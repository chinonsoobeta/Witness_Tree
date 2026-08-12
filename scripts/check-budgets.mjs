import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

export const SHARED_LIMIT = 100 * 1024;
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

export async function checkBudgets(root = path.resolve("dist/client"), { exploreSource = path.resolve("app/en/explore/page.tsx") } = {}) {
  const manifest = await loadManifest(root);
  const artifacts = await reachableEntries(root, manifest);
  const application = artifacts.filter(({ key, entry }) => !isFramework(key, entry));
  const exploreArtifacts = application.filter(({ key, entry }) => hasExploreName(key, entry));
  const sharedArtifacts = application.filter(({ key, entry }) => !hasExploreName(key, entry));
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkBudgets();
  console.log(`Budget gate passed: shared gzip ${result.gzipShared} bytes (raw ${result.rawShared}); explore gzip ${result.gzipExplore} bytes (raw ${result.rawExplore}).`);
}
