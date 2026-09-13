import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { findViolations } from "../scripts/check-volume-source-redistribution.mjs";

test("the repository carries no withheld appraisal, billing or auction material", () => {
  assert.deepEqual(findViolations(), []);
});

test("withheld filenames, PDF bytes, bidder records, per-hectare volumes and unflagged manifest entries are all refused", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "volume-redistribution-"));
  try {
    const put = (relative, content) => {
      mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      writeFileSync(path.join(root, relative), content);
    };
    put("public/mps_apr_20_coast.pdf", "synthetic");
    put(".next/static/iam_2024_master_b.pdf", "synthetic");
    put("public/hbs_grade_201101_region1903.pdf", "synthetic");
    put("data/A40411.html", "synthetic");
    put("public/renamed.bin", "%PDF-1.7 synthetic");
    put("data/auctions.json", JSON.stringify({ sales: [{ id: "S1", bids: [{ client: "000", bonus: 1 }] }] }));
    put("components/Yield.tsx", "const label = '412 m³/ha';");
    put("data/staged-acquisitions.json", JSON.stringify({ entries: [{ id: "mps-1", sourceId: "bc-mps-appraisal-parameters", redistributable: true }] }));
    put("data/bc-timber-harvest-aac-indicator.json", JSON.stringify({ source: { licenceId: "unverified" } }));
    const violations = findViolations(root).join("\n");
    for (const expected of [/mps_apr_20_coast\.pdf/, /iam_2024_master_b\.pdf/, /hbs_grade_201101_region1903\.pdf/, /A40411\.html/, /renamed\.bin: PDF bytes/, /bidder records/, /per-hectare/, /mps-1 must carry redistributable: false/, /only published volume source/]) {
      assert.match(violations, expected);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prohibition prose that names the derivation is not itself a derivation", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "volume-redistribution-"));
  try {
    mkdirSync(path.join(root, "components"), { recursive: true });
    writeFileSync(path.join(root, "components/Copy.tsx"), "No cubic-metres-per-hectare figure is shown. Aucun chiffre en mètres cubes par hectare.");
    assert.deepEqual(findViolations(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
