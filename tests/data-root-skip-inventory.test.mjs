// A subtest that skips when the drive is absent reports ok. That is the same
// failure this repository's data-root registry exists to prevent, one level
// down: the file runs in CI, the assertion that needed bytes does not, and the
// suite is green either way.
//
// The four files below are a deliberate compromise. Registering them as
// owner-bound would take their portable assertions out of CI too, so they stay
// and the skip is recorded instead. This pins the set so a fifth cannot appear
// unnoticed.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  REQUIRES_DATA_ROOT,
  REQUIRES_MACOS_RUNNER,
  SKIPS_WITHOUT_DATA_ROOT,
} from "../scripts/lib/data-root-bound-tests.mjs";

const TESTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

// A file skips on the data root when it names the root and hands a skip reason
// that says so. Matching the reason text, not `context.skip` alone, keeps
// skips for other causes out of this inventory.
const SKIP_ON_DATA_ROOT = /context\.skip\(\s*"[^"]*data root is not attached/u;

export function filesThatSkipWithoutDataRoot(dir = TESTS_DIR) {
  return readdirSync(dir)
    .filter((name) => /\.test\.(?:mjs|ts|tsx)$/u.test(name))
    .filter((name) => SKIP_ON_DATA_ROOT.test(readFileSync(path.join(dir, name), "utf8")))
    .sort();
}

test("every test that skips itself without the data root is recorded, with a reason", () => {
  assert.deepEqual(filesThatSkipWithoutDataRoot(), [...SKIPS_WITHOUT_DATA_ROOT.keys()].sort());
  for (const [name, reason] of SKIPS_WITHOUT_DATA_ROOT) {
    assert.ok(reason.length > 60, `${name} needs a reason that says which subtest skips and what still runs`);
    assert.match(reason, /run everywhere\./u, `${name} must say what portable coverage survives`);
  }
});

test("a recorded skip is not also registered as owner-bound, which would remove the file from CI", () => {
  for (const name of SKIPS_WITHOUT_DATA_ROOT.keys()) {
    assert.equal(REQUIRES_DATA_ROOT.has(name), false, `${name} is both skipped and excluded`);
    assert.equal(REQUIRES_MACOS_RUNNER.has(name), false, `${name} is both skipped and excluded`);
  }
});
