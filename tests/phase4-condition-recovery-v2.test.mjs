import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// The worker's own test drives it over hand-built trajectories whose expected
// states were worked out by hand, at three strip heights, so a strip seam that
// changes a count fails here rather than in a province-scale run.
test("condition-and-recovery v2 worker passes its hand-built trajectories", () => {
  const result = spawnSync("python3", [path.join(root, "scripts/test_phase4_condition_recovery_v2.py")], {
    encoding: "utf8",
    timeout: 300_000,
  });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /^PASS: /m);
});
