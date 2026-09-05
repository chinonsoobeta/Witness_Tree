import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, readFile, readlink, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataRoot, SSD_DATA_ROOT, INTERNAL_DATA_ROOT } from "./data-root.mjs";

export const SCHEMA = "witness-tree/data-root-integrity-manifest/1";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const within = (target, root) => target === root || target.startsWith(`${root}${path.sep}`);
const stable = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const content = ({ path: relative, type, bytes, sha256: digest, target }) => ({ path: relative, type, ...(type === "file" ? { bytes, sha256: digest } : type === "symlink" ? { target, sha256: digest } : {}) });

export function compareInventory(baseline, entries) {
  assert.equal(baseline.schemaVersion, SCHEMA, "Unrecognized baseline manifest");
  assert.equal(baseline.status, "passed", "Only a complete manifest can be a baseline");
  assert.equal(baseline.treeSha256, sha256(JSON.stringify(baseline.entries.map(content))), "Baseline checksum is invalid");
  assert.equal(new Set(baseline.entries.map((entry) => entry.path)).size, baseline.entries.length, "Duplicate baseline path");
  const before = new Map(baseline.entries.map((entry) => [entry.path, content(entry)]));
  const after = new Map(entries.map((entry) => [entry.path, content(entry)]));
  return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap((name) => {
    const kind = !before.has(name) ? "added" : !after.has(name) ? "missing" : JSON.stringify(before.get(name)) !== JSON.stringify(after.get(name)) ? "changed" : null;
    return kind ? [{ path: name, kind }] : [];
  });
}

export async function inventoryDataRoot({ root = resolveDataRoot(), baseline, progress = () => {} }) {
  const startedAt = new Date().toISOString();
  const entries = [];
  let resolvedRoot;
  try {
    resolvedRoot = await realpath(root);
    assert.ok((await lstat(resolvedRoot)).isDirectory(), "Data root is not a directory");
  } catch (error) {
    return { schemaVersion: SCHEMA, status: error.code === "ENOENT" || error.code === "ENOTDIR" ? "unavailable" : "failed", root: path.resolve(root), startedAt, completedAt: new Date().toISOString(), treeSha256: null, entries: null, counts: null, errors: [{ code: error.code ?? "invalid-root" }], claims: { backup: false, recoveryDemonstrated: false } };
  }
  let bytes = 0;
  let files = 0;
  let lastProgress = Date.now();
  async function walk(relative) {
    const absolute = path.join(resolvedRoot, relative);
    const before = await lstat(absolute);
    if (before.isSymbolicLink()) {
      const target = await readlink(absolute);
      entries.push({ path: relative, type: "symlink", target, sha256: sha256(target) });
    } else if (before.isDirectory()) {
      if (relative) entries.push({ path: relative, type: "directory" });
      for (const name of (await readdir(absolute)).sort()) await walk(path.join(relative, name));
    } else if (before.isFile()) {
      // No payload is copied or opened with write access. O_NOFOLLOW prevents
      // a file replaced by a symlink from redirecting a read during this walk.
      const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
      let digest;
      let readBytes = 0;
      try {
        assert.ok(stable(before, await handle.stat()), "File changed before reading");
        const hash = createHash("sha256");
        for await (const chunk of handle.createReadStream({ autoClose: false, highWaterMark: 1024 * 1024 })) {
          hash.update(chunk);
          readBytes += chunk.length;
          if (Date.now() - lastProgress >= 30_000) {
            progress({ files, bytesRead: bytes + readBytes });
            lastProgress = Date.now();
          }
        }
        assert.ok(stable(before, await handle.stat()) && readBytes === before.size, "File changed while reading");
        digest = hash.digest("hex");
      } finally { await handle.close(); }
      entries.push({ path: relative, type: "file", bytes: before.size, sha256: digest, modifiedAt: before.mtime.toISOString() });
      files += 1;
      bytes += readBytes;
    } else {
      throw new Error("Unsupported filesystem entry; manifest is incomplete");
    }
    assert.ok(stable(before, await lstat(absolute)), "Tree changed while reading");
  }
  try {
    await walk("");
    entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const changes = baseline ? compareInventory(baseline, entries) : null;
    return { schemaVersion: SCHEMA, status: changes?.length ? "failed" : "passed", root: resolvedRoot, startedAt, completedAt: new Date().toISOString(), treeSha256: sha256(JSON.stringify(entries.map(content))), entries,
      counts: { files, bytes, directories: entries.filter((entry) => entry.type === "directory").length, symlinks: entries.filter((entry) => entry.type === "symlink").length }, changes,
      errors: [], claims: { backup: false, recoveryDemonstrated: false } };
  } catch (error) {
    return { schemaVersion: SCHEMA, status: "failed", root: resolvedRoot, startedAt, completedAt: new Date().toISOString(), treeSha256: null, entries, counts: null, errors: [{ code: error.code ?? "incomplete-or-changing-tree" }], claims: { backup: false, recoveryDemonstrated: false } };
  }
}

export async function checkedManifestOutput(output, root) {
  assert.ok(output, "--output is required and must be outside the data root");
  const absolute = path.resolve(output);
  // Require an existing parent, resolving aliases before any write. Creating
  // directories inside the only data copy is not part of verification.
  const parent = await realpath(path.dirname(absolute));
  const destination = path.join(parent, path.basename(absolute));
  const protectedRoots = [path.resolve(root), SSD_DATA_ROOT, INTERNAL_DATA_ROOT];
  for (const candidate of [...protectedRoots]) {
    try { protectedRoots.push(await realpath(candidate)); } catch { /* An absent root stays lexically protected. */ }
  }
  assert.ok(protectedRoots.every((candidate) => !within(destination, candidate)), "Manifest output must be outside every data-root alias");
  try { await lstat(destination); throw new Error("Manifest output already exists; never overwrite a manifest"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  return destination;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: node scripts/verify-data-root-inventory.mjs --output FILE [--root DIR] [--baseline FILE]\nRead-only SHA-256 tree inventory. Defaults to the configured SSD root. Output must have an existing parent outside the data root, and must not exist. Symlinks are recorded, never followed. --baseline detects added, missing and changed entries. Exit 0: complete match/inventory; 1: failure/change; 2: unavailable. A manifest is not a backup.");
    return;
  }
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    assert.ok(["--output", "--root", "--baseline"].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith("--"), "Unknown or incomplete option");
    options[args[i].slice(2)] = args[i + 1];
  }
  const root = options.root ?? resolveDataRoot();
  const output = await checkedManifestOutput(options.output, root);
  const baseline = options.baseline ? JSON.parse(await readFile(options.baseline, "utf8")) : undefined;
  const result = await inventoryDataRoot({ root, baseline, progress: (value) => console.error(JSON.stringify({ status: "reading", ...value })) });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ status: result.status, counts: result.counts, treeSha256: result.treeSha256, output }));
  process.exitCode = result.status === "passed" ? 0 : result.status === "unavailable" ? 2 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(`FAIL data-root inventory: ${error.message}`);
  process.exitCode = 1;
});
