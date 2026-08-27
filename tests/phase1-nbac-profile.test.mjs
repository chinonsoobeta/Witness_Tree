import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { validatePhase1NbacProfile, verifyPhase1NbacProfileBytes } from "../scripts/check-phase1-nbac-profile.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase1-nbac-profile-2026-08-27.json", import.meta.url), "utf8"));
const clone = () => structuredClone(record);

test("NBAC profile binds exact bytes, current terms, schema and geometry findings", () => {
  assert.equal(validatePhase1NbacProfile(record), record);
});

test("NBAC profile rejects checksum, feature, schema and invalid-geometry drift", () => {
  for (const mutate of [
    (value) => { value.artifacts.payload.sha256 = "0".repeat(64); },
    (value) => { value.profile.featureCount += 1; },
    (value) => { value.profile.fields.pop(); },
    (value) => { value.profile.invalidGeometryCount = 0; },
  ]) {
    const candidate = clone();
    mutate(candidate);
    assert.throws(() => validatePhase1NbacProfile(candidate));
  }
});

test("NBAC profile rejects publisher, catalogue, edition, ETag, and profile binding drift", () => {
  for (const mutate of [
    (value) => { value.source.publisher = "Another publisher"; },
    (value) => { value.source.catalogueUrl = "https://example.test/catalogue"; },
    (value) => { value.source.metadataUrl = "https://example.test/metadata.pdf"; },
    (value) => { value.source.artifactUrl = "https://example.test/NBAC.zip"; },
    (value) => { value.source.edition = "NBAC 1972-2024, 20240513"; },
    (value) => { value.source.etag = "different-etag"; },
    (value) => { value.artifacts.geospatialProfile.filename = "other-profile.json"; },
    (value) => { value.artifacts.geospatialProfile.byteLength += 1; },
    (value) => { value.artifacts.geospatialProfile.sha256 = "0".repeat(64); },
  ]) {
    const candidate = clone();
    mutate(candidate);
    assert.throws(() => validatePhase1NbacProfile(candidate));
  }
});

test("local evidence cannot claim archive, transformation or admission", () => {
  for (const claim of ["immutableArchive", "transformed", "ingested", "released", "published", "productionAdmitted", "productionEligible"]) {
    const candidate = clone();
    candidate.evidenceState[claim] = true;
    assert.throws(() => validatePhase1NbacProfile(candidate));
  }
});

test("NBAC byte verification rejects relative, arbitrary and symlinked data roots before reading artifacts", () => {
  assert.throws(() => verifyPhase1NbacProfileBytes(record, "relative/root"), /absolute path/);
  const temporary = mkdtempSync(path.join(tmpdir(), "nbac-root-"));
  const link = `${temporary}-link`;
  symlinkSync(temporary, link, "dir");
  try {
    assert.throws(() => verifyPhase1NbacProfileBytes(record, temporary), /approved SSD root/);
    assert.throws(() => verifyPhase1NbacProfileBytes(record, link), /not the approved SSD root|approved SSD root/);
  } finally {
    rmSync(link, { force: true });
    rmSync(temporary, { force: true, recursive: true });
  }
});
