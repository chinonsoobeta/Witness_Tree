import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// The tile builder decides what is drawn and what each shape says in its strip
// step, so that step is driven over one strip whose shapes were counted by hand.
test("condition-and-recovery tile builder draws a hand-built strip as worked out by hand", () => {
  const result = spawnSync("python3", [path.join(root, "scripts/test_phase4_condition_recovery_tiles.py")], {
    encoding: "utf8",
    timeout: 300_000,
  });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /^PASS: /m);
});
