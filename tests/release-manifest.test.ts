import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compareArtifacts, validateReleaseManifest }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/releases/manifest.ts";
import { verifyRelease } from "../scripts/verify-release.mjs";

const checksum = (text: string) => createHash("sha256").update(text).digest("hex");
const fixture = () => ({
  releaseId: "2026-08-11.1",
  releaseDate: "2026-08-11",
  latestDataEndYear: 2025,
  boundaryEdition: "2023-representation-order",
  methodVersion: "1.0.0",
  artifacts: [{ id: "events", sha256: checksum("release data"), licenceId: "OGL-Canada-2.0", localPath: "events.json" }],
  note: { en: "Updated official records.", fr: "Registres officiels mis à jour." },
  correctionsUrl: "https://example.test/corrections",
  degraded: false,
  stale: false,
});

test("validates a complete versioned release and compares artifacts", () => {
  const first = validateReleaseManifest(fixture(), 2026);
  const next = validateReleaseManifest({ ...fixture(), releaseId: "2026-08-12.1", artifacts: [{ ...fixture().artifacts[0], sha256: checksum("new data") }] }, 2026);
  assert.deepEqual(compareArtifacts(first, next), [{ id: "events", change: "changed" }]);
});

test("rejects missing licence, bilingual note, checksum, future data, and Unknown numeric zero", () => {
  assert.throws(() => validateReleaseManifest({ ...fixture(), artifacts: [{ ...fixture().artifacts[0], licenceId: "" }] }, 2026), /licence/i);
  assert.throws(() => validateReleaseManifest({ ...fixture(), note: { en: "", fr: "Note" } }, 2026), /bilingual note|note.en/i);
  assert.throws(() => validateReleaseManifest({ ...fixture(), artifacts: [{ ...fixture().artifacts[0], sha256: "missing" }] }, 2026), /SHA-256/i);
  assert.throws(() => validateReleaseManifest({ ...fixture(), latestDataEndYear: 2027 }, 2026), /beyond the current year/i);
  assert.throws(() => validateReleaseManifest({ ...fixture(), note: { en: "Unknown 0", fr: "Note" } }, 2026), /Unknown numeric zero/i);
});

test("verifier checks local artifact hashes and rejects a mismatch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "release-manifest-"));
  await writeFile(path.join(root, "events.json"), "release data");
  const manifestPath = path.join(root, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(fixture()));
  await verifyRelease(manifestPath);
  await writeFile(path.join(root, "events.json"), "tampered");
  await assert.rejects(() => verifyRelease(manifestPath), /SHA-256 mismatch/);
});
