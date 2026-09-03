import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ARTIFACT_PATTERNS, DURABLE_TREES, classify, scan } from "../scripts/check-archive-tool-artifacts.mjs";

function archive(files) {
  const root = mkdtempSync(join(tmpdir(), "witness-tree-artifacts-"));
  for (const [relative, body] of Object.entries(files)) {
    const full = join(root, relative);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body ?? "");
  }
  return root;
}

test("the file that actually appeared is caught", () => {
  // The real event: gdalinfo -hist on an owner-admitted output left this beside the raster.
  const root = archive({
    "derived/phase2-real-national-1984-2022-v1/disturbance/recorded-harvest-1985-2022.tif": "",
    "derived/phase2-real-national-1984-2022-v1/disturbance/recorded-harvest-1985-2022.tif.aux.xml": "<PAMDataset/>",
  });
  try {
    assert.deepEqual(scan(root).map((row) => row.path), [
      "derived/phase2-real-national-1984-2022-v1/disturbance/recorded-harvest-1985-2022.tif.aux.xml",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a clean archive reports nothing", () => {
  const root = archive({
    "raw/nfd/2026-08-27/table.csv": "a,b\n",
    "derived/phase3/rollup.json": "{}\n",
    "evidence/receipt.json": "{}\n",
  });
  try {
    assert.deepEqual(scan(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every artifact pattern is caught, and each says what wrote it", () => {
  const root = archive({
    "derived/a/mask.tif.aux.xml": "",
    "derived/a/mask.tif.ovr": "",
    "derived/a/mask.tif.msk": "",
    "derived/a/.DS_Store": "",
    "derived/a/._mask.tif": "",
  });
  try {
    const found = scan(root);
    assert.equal(found.length, ARTIFACT_PATTERNS.length);
    for (const row of found) assert.ok(row.wrote.length > 0, `${row.path} must say what wrote it`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a product whose name merely contains a pattern's letters is not flagged", () => {
  // "aux" and "ovr" appear inside ordinary names. Only the real suffixes count, or the guard
  // becomes noise and gets switched off.
  const root = archive({
    "derived/auxiliary-districts.json": "{}",
    "derived/recovery-overview.json": "{}",
    "derived/mask.tif.aux.xml.notes.md": "#",
  });
  try {
    assert.deepEqual(scan(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the scratch trees are out of scope, because quarantine is where these files are meant to go", () => {
  const root = archive({
    "quarantine/phase2-real-national-pam-sidecar/2026-08-29/recorded-harvest-1985-2022.tif.aux.xml": "<PAMDataset/>",
    "work/scratch.tif.aux.xml": "",
    "diagnostics/probe.tif.ovr": "",
  });
  try {
    assert.deepEqual(scan(root), []);
    assert.deepEqual(DURABLE_TREES, ["raw", "extracted", "derived", "evidence"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a directory that does not exist contributes nothing rather than throwing", () => {
  // The trees are scanned by name, and not every archive layout has all four.
  const root = archive({ "raw/keep.txt": "" });
  try {
    assert.deepEqual(scan(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("classify names the cause, not just the fact", () => {
  assert.match(classify("derived/x.tif.aux.xml").wrote, /GDAL_PAM_ENABLED=NO/);
  assert.equal(classify("derived/x.tif"), null);
});

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { QUARANTINE_RECORD_PATH, validateQuarantineRecord } from "../scripts/check-archive-tool-artifacts.mjs";

const record = JSON.parse(readFileSync(new URL(`../${QUARANTINE_RECORD_PATH}`, import.meta.url), "utf8"));
const body = Buffer.from("<PAMDataset/>");
const digest = createHash("sha256").update(body).digest("hex");

function fixture(overrides = {}) {
  return {
    schemaVersion: "witness-tree/archive-tool-artifact-quarantine/1",
    quarantined: {
      from: "derived/batch/disturbance/raster.tif.aux.xml",
      to: "quarantine/slug/2026-08-29/raster.tif.aux.xml",
      sha256: digest,
      byteLength: body.length,
      modifiedAt: "2026-08-29T01:14 local",
      reasonNotDeleted: "the archive is the only copy",
      ...overrides,
    },
  };
}

const world = (present) => ({
  readBytes: () => body,
  exists: (path) => present.some((suffix) => path.endsWith(suffix)),
});

test("the committed record binds a real move out of a durable tree", () => {
  const moved = record.quarantined;
  assert.match(moved.sha256, /^[0-9a-f]{64}$/);
  assert.ok(moved.from.startsWith("derived/"));
  assert.ok(moved.to.startsWith("quarantine/"));
  assert.equal(record.boundary.admittedBytesChanged, false);
  assert.equal(record.admittedOutputs.mismatches, 0);
});

test("a preserved file with the bound digest passes", () => {
  const moved = validateQuarantineRecord(fixture(), "/root", world(["quarantine/slug/2026-08-29/raster.tif.aux.xml"]));
  assert.equal(moved.byteLength, body.length);
});

test("deleting the quarantined file instead of moving it fails", () => {
  assert.throws(
    () => validateQuarantineRecord(fixture(), "/root", world([])),
    /was preserved deliberately, so its absence means it was deleted rather than moved/,
  );
});

test("the artifact reappearing in the admitted directory fails", () => {
  assert.throws(
    () => validateQuarantineRecord(fixture(), "/root", world([
      "quarantine/slug/2026-08-29/raster.tif.aux.xml",
      "derived/batch/disturbance/raster.tif.aux.xml",
    ])),
    /the archive no longer matches what was admitted/,
  );
});

test("a quarantined file whose bytes changed fails", () => {
  assert.throws(
    () => validateQuarantineRecord(fixture({ sha256: "0".repeat(64) }), "/root", world(["quarantine/slug/2026-08-29/raster.tif.aux.xml"])),
    /no longer matches the digest the record binds/,
  );
});

test("a record that quarantines something that was never in a durable tree fails", () => {
  assert.throws(
    () => validateQuarantineRecord(fixture({ from: "work/scratch.tif.aux.xml" }), "/root", world(["quarantine/slug/2026-08-29/raster.tif.aux.xml"])),
    /is not in a durable tree, so quarantining it explains nothing/,
  );
});
