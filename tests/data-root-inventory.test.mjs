import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { checkedManifestOutput, inventoryDataRoot } from "../scripts/verify-data-root-inventory.mjs";

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "integrity-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, "source");
  await mkdir(root);
  await mkdir(path.join(root, "empty"));
  await writeFile(path.join(root, ".hidden"), "measured bytes");
  return { directory, root, file: path.join(root, ".hidden") };
}

test("hashes every file including hidden entries and leaves source bytes and metadata intact", async (t) => {
  const { root, file } = await fixture(t);
  await chmod(file, 0o444);
  const before = await lstat(file);
  const result = await inventoryDataRoot({ root });
  const after = await lstat(file);
  assert.equal(result.status, "passed");
  assert.equal(result.counts.files, 1);
  assert.equal(result.counts.bytes, 14);
  assert.equal(result.entries[0].sha256, createHash("sha256").update("measured bytes").digest("hex"));
  assert.deepEqual(result.entries.map(({ path, type }) => ({ path, type })), [{ path: ".hidden", type: "file" }, { path: "empty", type: "directory" }]);
  assert.equal(before.mtimeMs, after.mtimeMs);
  assert.equal(before.ctimeMs, after.ctimeMs);
  assert.equal(await readFile(file, "utf8"), "measured bytes");
  assert.deepEqual(result.claims, { backup: false, recoveryDemonstrated: false });
  assert.equal((await inventoryDataRoot({ root, baseline: result })).changes.length, 0);
});

test("detects changed bytes, deleted files and additions against a checksummed baseline", async (t) => {
  const { root, file } = await fixture(t);
  const baseline = await inventoryDataRoot({ root });
  await writeFile(file, "corrupted bytes");
  let result = await inventoryDataRoot({ root, baseline });
  assert.equal(result.status, "failed");
  assert.deepEqual(result.changes, [{ path: ".hidden", kind: "changed" }]);
  await rm(file);
  await writeFile(path.join(root, "new"), "new");
  result = await inventoryDataRoot({ root, baseline });
  assert.deepEqual(result.changes, [{ path: ".hidden", kind: "missing" }, { path: "new", kind: "added" }]);
  assert.equal((await inventoryDataRoot({ root, baseline: { ...baseline, treeSha256: "0".repeat(64) } })).status, "failed");
});

test("symlinks are recorded without following an external target", async (t) => {
  const { root, directory } = await fixture(t);
  const outside = path.join(directory, "absent-target");
  await symlink(outside, path.join(root, "link"));
  const result = await inventoryDataRoot({ root });
  assert.equal(result.status, "passed");
  assert.equal(result.counts.symlinks, 1);
  assert.equal(result.entries.find((entry) => entry.path === "link").target, outside);
});

test("absent roots are unavailable with unknown counts, never empty successful manifests", async (t) => {
  const { directory } = await fixture(t);
  const result = await inventoryDataRoot({ root: path.join(directory, "not-mounted") });
  assert.equal(result.status, "unavailable");
  assert.equal(result.treeSha256, null);
  assert.equal(result.entries, null);
  assert.equal(result.counts, null);
});

test("refuses output inside the source or an alias, and never overwrites an existing file", async (t) => {
  const { directory, root, file } = await fixture(t);
  await assert.rejects(() => checkedManifestOutput(path.join(root, "manifest.json"), root), /outside/);
  const alias = path.join(directory, "alias");
  await symlink(root, alias);
  await assert.rejects(() => checkedManifestOutput(path.join(alias, "manifest.json"), root), /outside/);
  await assert.rejects(() => checkedManifestOutput(file, root), /outside/);
  const output = path.join(directory, "manifest.json");
  assert.equal(await checkedManifestOutput(output, root), path.join(await realpath(directory), "manifest.json"));
  await writeFile(output, "keep this receipt");
  await assert.rejects(() => checkedManifestOutput(output, root), /never overwrite/);
  assert.equal(await readFile(output, "utf8"), "keep this receipt");
});
