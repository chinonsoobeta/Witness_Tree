import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateNrcanCanopyCoverProfile } from "../scripts/check-nrcan-canopy-cover-profile.mjs";

const profile = JSON.parse(readFileSync(new URL("../data/nrcan-canopy-cover-profile.json", import.meta.url), "utf8"));

test("canopy-cover profile is checksum-bound, grid-conformant, and staging-only", () => {
  assert.equal(validateNrcanCanopyCoverProfile(profile), profile);
});

test("canopy-cover profile fails closed on checksum, grid, and production drift", () => {
  assert.throws(() => validateNrcanCanopyCoverProfile({ ...profile, raw: { ...profile.raw, sha256: "a".repeat(64) } }));
  assert.throws(() => validateNrcanCanopyCoverProfile({ ...profile, gridConformance: { ...profile.gridConformance, pixelWidth: 1 } }));
  assert.throws(() => validateNrcanCanopyCoverProfile({ ...profile, productionEligible: true }));
});
