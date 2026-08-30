import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runner = await readFile(
  new URL("../scripts/run-phase2-annual-province-zonal-v2.sh", import.meta.url),
  "utf8",
);
const ridingRunner = await readFile(
  new URL("../scripts/run-phase2-annual-riding-zonal.sh", import.meta.url),
  "utf8",
);

test("province v2 runner binds the mapped extent and preserves v1", () => {
  assert.match(runner, /phase2_annual_zonal_aggregate_v2\.py/u);
  assert.match(runner, /--mapped-extent "\$EXTENT"/u);
  assert.match(runner, /phase2-annual-province-zonal-v2/u);
  assert.match(runner, /--boundary-id-field PRUID/u);
  assert.match(runner, /--boundary-name-field PRENAME/u);
  assert.match(runner, /--boundary-classification illustrative/u);
  assert.match(runner, /refusing to replace an existing province v2 artifact/u);
  assert.doesNotMatch(runner, /phase2-annual-province-zonal-v1/u);
});

test("riding v2 runner resumes only complete output pairs", () => {
  assert.match(ridingRunner, /complete\.sha256/u);
  assert.match(ridingRunner, /recorded="\$\(tr -d '\\n' < "\$marker"\)"/u);
  assert.match(ridingRunner, /actual="\$\(pair_digest "\$output" "\$sidecar"\)"/u);
  assert.match(ridingRunner, /has an incomplete output set; refusing to overwrite or skip it/u);
  assert.match(ridingRunner, /has a symlinked output, sidecar, or completion marker/u);
});
