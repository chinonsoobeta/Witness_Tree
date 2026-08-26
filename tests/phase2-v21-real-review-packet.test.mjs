import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
test("real review packet is checksum-bound and has no fabricated reviewer result", () => {
  const output = execFileSync("node", ["scripts/check-phase2-v21-real-review-packet.mjs"], { encoding: "utf8" });
  assert.match(output, /400 candidates, zero review results, nonproduction/);
});
