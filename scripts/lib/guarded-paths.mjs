// Works out which repository files a data-root-bound test actually depends on.
//
// The 25 tests that need the owner's SSD cannot run in CI, so nothing tells a
// reviewer that a pull request has invalidated one of them. #84 changed
// scripts/run-phase1-ntems-transform.mjs and rewrote four owner-bound execution
// authorizations in the same commit, and it merged green because the only test
// that reads those files is data-root-bound. The drift sat on main for days.
//
// The guarded set is derived, never hand-listed, so it cannot fall behind the
// code it guards: start at the test file, follow every repository-local import
// transitively, and collect every repository-relative path literal any of those
// modules mention. That second half is what reaches the JSON evidence records,
// which are referenced by string rather than imported.
//
// EXTRA_GUARDED_PATHS covers the one thing a static read cannot see: a file that
// a module names only indirectly. Each entry states why.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const SOURCE_DIRECTORIES = ["scripts", "lib", "data", "tests", "app", "components"];

const EXTRA_GUARDED_PATHS = new Map([
  [
    "phase1-ntems-readback-bytes.test.mjs",
    {
      "scripts/run-phase1-ntems-transform.mjs":
        "The readback evidence records the SHA-256 of the runner that produced the bytes, so a runner edit invalidates the evidence without any module naming the runner by path.",
    },
  ],
]);

const RELATIVE_IMPORT = /(?:^|[\s;])(?:import|export)\s[^;]*?from\s*"(\.[^"]+)"/g;
const DYNAMIC_IMPORT = /import\(\s*"(\.[^"]+)"\s*\)/g;
const REPO_PATH_LITERAL = new RegExp(`"((?:${SOURCE_DIRECTORIES.join("|")})/[A-Za-z0-9._/-]+)"`, "g");

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

// Returns every repository file whose contents can change what `testFile` proves,
// as sorted repository-relative paths. `testFile` is a bare name under tests/.
export function computeGuardedPaths(testFile) {
  const start = path.join(REPO_ROOT, "tests", testFile);
  if (!isReadableFile(start)) {
    throw new Error(`data-root-bound test does not exist: tests/${testFile}`);
  }

  const guarded = new Set([repoRelative(start)]);
  const queue = [start];
  const visited = new Set([start]);

  while (queue.length > 0) {
    const current = queue.shift();
    const source = readFileSync(current, "utf8");

    for (const pattern of [RELATIVE_IMPORT, DYNAMIC_IMPORT]) {
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
      // Data records are leaves: they are read, not executed, so they add no edges.
      if (!relative.startsWith("data/") && !visited.has(absolute)) {
        visited.add(absolute);
        queue.push(absolute);
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
