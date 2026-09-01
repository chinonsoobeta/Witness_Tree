// Works out which repository files an owner-bound test actually depends on.
//
// The 25 tests that need the owner's SSD and three that need macOS cannot run in
// CI, so nothing tells a reviewer that a pull request has invalidated one. #84 changed
// scripts/run-phase1-ntems-transform.mjs and rewrote four owner-bound execution
// authorizations in the same commit, and it merged green because the only test
// that reads those files is data-root-bound. The drift sat on main for days.
//
// The guarded set is derived, never hand-listed, so it cannot fall behind the
// code it guards. It closes over four kinds of edge:
//
//   1. repository-local imports, followed transitively;
//   2. repository-local file URLs, followed transitively;
//   3. repository-relative path literals any of those modules mention, which is
//      how the JSON evidence records are reached, since they are read by string
//      rather than imported;
//   4. evidence bindings: a { path, sha256 } pair inside a guarded record, whose
//      target is itself guarded, transitively to a fixpoint.
//
// The third edge is the #84 shape exactly. The readback evidence records the
// runner as { path: "scripts/run-phase1-ntems-transform.mjs", sha256 }, and no
// module names that runner by path, so edges 1 and 2 both miss it. It used to be
// covered by a hand-written exception. It is now derived, along with the same
// blind spot in six other data-root-bound tests, where records such as
// data/phase1-federal-electoral-production-admission.json and
// data/phase1-production-transformation-specifications-v1.json bind further
// repository files that nothing imports or names.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const SOURCE_DIRECTORIES = ["scripts", "lib", "data", "tests", "app", "components"];

// Reserved for a dependency no static read can see. It is empty: the evidence
// binding rule below now derives the NTEMS runner that was once listed here.
// Prefer extending the derivation over adding an entry; a hand-written list is
// exactly what falls behind the code it guards.
const EXTRA_GUARDED_PATHS = new Map([]);

const RELATIVE_IMPORT = /(?:^|[\s;])(?:import|export)\s[^;]*?from\s*"(\.[^"]+)"/g;
const DYNAMIC_IMPORT = /import\(\s*"(\.[^"]+)"\s*\)/g;
const RELATIVE_FILE_URL = /new URL\(\s*["'](\.[^"']+)["']\s*,\s*import\.meta\.url\s*\)/g;
const REPO_PATH_LITERAL = new RegExp(`"((?:${SOURCE_DIRECTORIES.join("|")})/[A-Za-z0-9._/-]+)"`, "g");
const SHA256 = /^[0-9a-f]{64}$/;

function isReadableFile(absolute) {
  return existsSync(absolute) && statSync(absolute).isFile();
}

function resolveImport(fromAbsolute, specifier) {
  const base = path.resolve(path.dirname(fromAbsolute), specifier);
  for (const candidate of [base, `${base}.mjs`, `${base}.js`, `${base}.ts`, path.join(base, "index.mjs")]) {
    if (isReadableFile(candidate)) return candidate;
  }
  return null;
}

function repoRelative(absolute) {
  return path.relative(REPO_ROOT, absolute).split(path.sep).join("/");
}

// Yields every { path, sha256 } binding in a record, whatever shape nests it.
// The field names vary across schemas, so all three spellings are accepted.
function* evidenceBindings(node) {
  if (Array.isArray(node)) {
    for (const value of node) yield* evidenceBindings(value);
    return;
  }
  if (!node || typeof node !== "object") return;
  const named = node.path ?? node.file ?? node.relativePath;
  const digest = node.sha256 ?? node.digest ?? node.hash;
  if (typeof named === "string" && typeof digest === "string" && SHA256.test(digest)) yield named;
  for (const value of Object.values(node)) yield* evidenceBindings(value);
}

// A bound path counts only when it names a real file inside this repository.
// Records also bind artifacts on the owner's data root and objects in remote
// buckets; those are not repository files and cannot be fingerprinted here.
function boundRepositoryFile(named) {
  if (typeof named !== "string" || named.length === 0) return null;
  const clean = named.replace(/^\.\//, "");
  if (path.isAbsolute(clean) || clean.split("/").includes("..")) return null;
  const absolute = path.join(REPO_ROOT, clean);
  if (!absolute.startsWith(`${REPO_ROOT}${path.sep}`)) return null;
  return isReadableFile(absolute) ? repoRelative(absolute) : null;
}

// Returns every repository file whose contents can change what `testFile` proves,
// as sorted repository-relative paths. `testFile` is a bare name under tests/.
export function computeGuardedPaths(testFile) {
  const start = path.join(REPO_ROOT, "tests", testFile);
  if (!isReadableFile(start)) {
    throw new Error(`owner-bound test does not exist: tests/${testFile}`);
  }

  const guarded = new Set([repoRelative(start)]);
  const queue = [start];
  const visited = new Set([start]);

  while (queue.length > 0) {
    const current = queue.shift();
    const source = readFileSync(current, "utf8");

    for (const pattern of [RELATIVE_IMPORT, DYNAMIC_IMPORT, RELATIVE_FILE_URL]) {
      for (const match of source.matchAll(pattern)) {
        const resolved = resolveImport(current, match[1]);
        if (!resolved || visited.has(resolved)) continue;
        visited.add(resolved);
        guarded.add(repoRelative(resolved));
        queue.push(resolved);
      }
    }

    for (const match of source.matchAll(REPO_PATH_LITERAL)) {
      const absolute = path.join(REPO_ROOT, match[1]);
      if (!isReadableFile(absolute)) continue;
      const relative = repoRelative(absolute);
      if (guarded.has(relative)) continue;
      guarded.add(relative);
      // Data records are leaves for import and literal purposes: they are read,
      // not executed. Their evidence bindings are followed separately below.
      if (!relative.startsWith("data/") && !visited.has(absolute)) {
        visited.add(absolute);
        queue.push(absolute);
      }
    }
  }

  // Evidence bindings, to a fixpoint. A record that binds another record can
  // bind further files through it, so this repeats until nothing new appears.
  const scanned = new Set();
  for (;;) {
    const pending = [...guarded].filter((relative) => relative.startsWith("data/") && relative.endsWith(".json") && !scanned.has(relative));
    if (pending.length === 0) break;
    for (const relative of pending) {
      scanned.add(relative);
      let record;
      try {
        record = JSON.parse(readFileSync(path.join(REPO_ROOT, relative), "utf8"));
      } catch {
        continue; // A record that does not parse binds nothing; its own digest still guards it.
      }
      for (const named of evidenceBindings(record)) {
        const bound = boundRepositoryFile(named);
        if (bound) guarded.add(bound);
      }
    }
  }

  for (const relative of Object.keys(EXTRA_GUARDED_PATHS.get(testFile) ?? {})) {
    if (!isReadableFile(path.join(REPO_ROOT, relative))) {
      throw new Error(`EXTRA_GUARDED_PATHS names a file that does not exist: ${relative}`);
    }
    guarded.add(relative);
  }

  return [...guarded].sort();
}

export function extraGuardedReasons(testFile) {
  return EXTRA_GUARDED_PATHS.get(testFile) ?? {};
}

export function digestOf(relative) {
  return createHash("sha256").update(readFileSync(path.join(REPO_ROOT, relative))).digest("hex");
}

// The single fingerprint a receipt pins per test: the ordered list of guarded
// paths and each of their digests. Renaming a guarded file changes it too.
export function guardedFingerprint(guardedPaths) {
  const hash = createHash("sha256");
  for (const relative of guardedPaths) {
    hash.update(`${relative} ${digestOf(relative)} `);
  }
  return hash.digest("hex");
}
