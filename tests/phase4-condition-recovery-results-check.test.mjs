import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// The RESULTS agreement worker's own test drives it over hand-built polygons
// whose calls were worked out by hand, including the exactly-half case, a
// repeated OBJECTID and a polygon off the raster.
test("RESULTS agreement worker passes its hand-built polygons", () => {
  const result = spawnSync("python3", [path.join(root, "scripts/test_phase4_condition_recovery_results_check.py")], {
    encoding: "utf8",
    timeout: 300_000,
  });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /^PASS: /m);
});
