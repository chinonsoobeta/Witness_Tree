import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runOfficialPublishedHarvestComparison } from "../scripts/run-phase2-official-published-harvest-comparison.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dataRoot = process.env.WITNESS_TREE_DATA_ROOT;

test("the real runner creates one validated pair and refuses overwrite", { skip: !dataRoot }, () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "witness-tree-track-b-runner-"));
  const options = {
    contract: path.join(root, "data/phase2-official-published-harvest-contract.json"),
    strictComparison: path.join(dataRoot, "derived/phase2-annual-nfd-comparison-fractional-v1/annual-nfd-comparison-fractional-1985-2022.json"),
    statcanHtml: path.join(dataRoot, "raw/nfd-recovery-official/2026-08-27/canada-legacy/table-2-10-forest-area-harvested-1975-2015.html"),
    output: path.join(temporary, "comparison.json"),
    sidecar: path.join(temporary, "comparison.provenance.json"),
  };
  try {
    const result = runOfficialPublishedHarvestComparison(options);
    assert.equal(result.rows.length, 118);
    const output = JSON.parse(readFileSync(options.output, "utf8"));
    assert.deepEqual(output.summary, { rows: 118, computedRoundedRows: 104, restrictedPendingRows: 14, strictNfdExactTotalsRemainingNull: 118, safeExactNfdReplacementRows: 0 });
    assert.equal(output.claims.formalIndependentComparisonGateComplete, false);
    assert.throws(() => runOfficialPublishedHarvestComparison(options), /overwrite|exist/i);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
