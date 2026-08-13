import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateRecordedLocalAdmissions } from "../scripts/check-local-staging-admission.mjs";

const acquisitions = JSON.parse(readFileSync(new URL("../data/staged-acquisitions.json", import.meta.url), "utf8"));
const profile = JSON.parse(readFileSync(new URL("../data/staged-geospatial-profile.json", import.meta.url), "utf8"));

test("admission joins only the two recorded local staging manifests", () => {
  const admissions = validateRecordedLocalAdmissions(acquisitions, profile);
  assert.equal(admissions.length, 2);
  assert.equal(admissions.every((entry) => entry.release.production === false && entry.release.ingested === false), true);
});

test("recorded admission fails closed when staged metadata disagrees", () => {
  assert.throws(() => validateRecordedLocalAdmissions({ ...acquisitions, entries: acquisitions.entries.map((entry) => entry.sourceId === "alberta-avi-crown" ? { ...entry, sha256: "a".repeat(64) } : entry) }, profile), /geometry evidence checksum/i);
  assert.throws(() => validateRecordedLocalAdmissions(acquisitions, { ...profile, sources: profile.sources.filter((source) => source.sourceId !== "alberta-avi-crown") }), /exact staged sources/i);
  assert.throws(() => validateRecordedLocalAdmissions({ ...acquisitions, entries: [...acquisitions.entries, { ...acquisitions.entries[0], id: "unprofiled-source", sourceId: "unprofiled-source" }] }, profile), /unexpected staged acquisition/i);
  assert.throws(() => validateRecordedLocalAdmissions(acquisitions, { ...profile, sources: [...profile.sources, { ...profile.sources[0], sourceId: "unmatched-profile" }] }), /exact staged sources/i);
  assert.throws(() => validateRecordedLocalAdmissions(acquisitions, { ...profile, sources: [...profile.sources, profile.sources[0]] }), /exact staged sources/i);
});
