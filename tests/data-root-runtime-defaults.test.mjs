import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const OLD_INTERNAL_ROOT = "/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data";
const ACTIVE_RUNTIME_SCRIPTS = [
  "run-phase1-ntems-transform.mjs",
  "verify-phase1-ntems-transform.mjs",
  "run-qc-stand-copy.mjs",
  "verify-qc-stand-copy-readback.mjs",
];

test("active runtime scripts resolve their default data root through the shared helper", () => {
  for (const name of ACTIVE_RUNTIME_SCRIPTS) {
    const source = readFileSync(new URL(`../scripts/${name}`, import.meta.url), "utf8");
    assert.match(source, /from ["']\.\/data-root\.mjs["']/u, `${name} must import data-root.mjs`);
    assert.match(source, /(?:DEFAULT_DATA_ROOT|DATA_ROOT)\s*=\s*path\.resolve\(resolveDataRoot\(\)\)/u, `${name} must derive its default from resolveDataRoot()`);
    assert.doesNotMatch(source, new RegExp(OLD_INTERNAL_ROOT.replaceAll("/", "\\/"), "u"), `${name} retains the retired internal default`);
  }
});
