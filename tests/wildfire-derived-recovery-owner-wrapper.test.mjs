import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const wrapperPath = new URL("../scripts/run-wildfire-derived-recovery-owner.sh", import.meta.url).pathname;

function privateFile(path) {
  writeFileSync(path, "{}\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}

test("owner wrapper refuses a stale private state before root/default capture", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-derived-owner-wrapper-"));
  try {
    const dataRoot = join(dir, "data");
    const bin = join(dir, "bin");
    const marker = join(dir, "aws-called");
    mkdirSync(dataRoot);
    mkdirSync(bin);
    const fakeAws = join(bin, "aws");
    writeFileSync(fakeAws, `#!/bin/zsh\ntouch ${JSON.stringify(marker)}\nexit 99\n`, { mode: 0o700 });
    chmodSync(fakeAws, 0o700);

    const approval = join(dir, "approval.json");
    const state = join(dir, "state.json");
    const attestation = join(dir, "attestation.json");
    const evidence = join(dir, "evidence.json");
    privateFile(approval);
    privateFile(attestation);
    privateFile(state);

    const run = spawnSync("zsh", [wrapperPath, "--recover", approval, state, attestation, evidence], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, WITNESS_TREE_DATA_ROOT: dataRoot }
    });

    assert.equal(run.status, 65, run.stdout + run.stderr);
    assert.match(run.stderr, /state path already exists/i);
    assert.equal(run.stdout.includes("TOTP"), false);
    assert.equal(run.stderr.includes("TOTP"), false);
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
