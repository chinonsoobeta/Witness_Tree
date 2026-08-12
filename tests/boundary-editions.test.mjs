import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateBoundaryEditions } from "../scripts/check-boundary-editions.mjs";

const record = JSON.parse(readFileSync(new URL("../data/boundary-editions.json", import.meta.url), "utf8"));
const statcanLicence = record.licences.find((licence) => licence.id === "statcan-open-licence");
const oglLicence = record.licences.find((licence) => licence.id === "ogl-canada-2.0");
const fed2023 = record.editions.find((edition) => edition.id === "elections-canada-fed-2023");
const fed2013 = record.editions.find((edition) => edition.id === "statcan-2021-fed-2013-order-cbf");

const replaceLicence = (replacement) => record.licences.map((licence) => licence.id === replacement.id ? replacement : licence);
const replaceEdition = (replacement) => record.editions.map((edition) => edition.id === replacement.id ? replacement : edition);

test("the staged boundary record reproduces the verified acquisition evidence", () => {
  assert.equal(validateBoundaryEditions(record), record);
  assert.equal(record.editions.reduce((total, edition) => total + edition.byteLength, 0), 578421880);
  assert.equal(record.totalByteLength, 578421880);
  assert.equal(record.editions.every((edition) => edition.productionEligible === false), true);
  assert.equal(fed2023.featureCount, 343);
  assert.equal(fed2013.featureCount, 338);
  assert.equal(fed2013.supersededBy, "elections-canada-fed-2023");
});

test("the unversioned Statistics Canada licence stays Unknown with a reason and is never given a number", () => {
  assert.equal(statcanLicence.version.kind, "unknown");
  assert.equal("value" in statcanLicence.version, false);
  assert.match(statcanLicence.version.reason, /no version number/i);
  assert.deepEqual(oglLicence.version, { kind: "known", value: "2.0" });

  assert.throws(
    () => validateBoundaryEditions({ ...record, licences: replaceLicence({ ...statcanLicence, version: { kind: "known", value: "1.0" } }) }),
    /licence version kind changed/,
  );
  assert.throws(
    () => validateBoundaryEditions({ ...record, licences: replaceLicence({ ...statcanLicence, version: { kind: "unknown", reason: "", } }) }),
    /unknown-version reason is required/,
  );
  assert.throws(
    () => validateBoundaryEditions({ ...record, licences: replaceLicence({ ...statcanLicence, version: { kind: "unknown", reason: statcanLicence.version.reason, value: "2.0" } }) }),
    /carries no version number/,
  );
});

test("both publishers keep their own required attribution and neither substitutes for the other", () => {
  assert.equal(record.licences.length, 2);
  assert.notEqual(statcanLicence.publisher, oglLicence.publisher);
  assert.throws(
    () => validateBoundaryEditions({ ...record, licences: [statcanLicence] }),
    /both licences, from both publishers/,
  );
  assert.throws(
    () => validateBoundaryEditions({ ...record, editions: replaceEdition({ ...fed2023, requiredAttribution: statcanLicence.requiredAttributionTemplate }) }),
    /must carry the Open Government Licence attribution/,
  );
  assert.throws(
    () => validateBoundaryEditions({ ...record, editions: replaceEdition({ ...fed2013, requiredAttribution: oglLicence.requiredAttributionTemplate }) }),
    /Adapted from/,
  );
  assert.throws(
    () => validateBoundaryEditions({ ...record, licences: replaceLicence({ ...oglLicence, requiredAttributionTemplate: "Contains open data." }) }),
    /attribution wording changed/,
  );
});

test("the record rejects byte, checksum, feature-count, and production-eligibility drift", () => {
  assert.throws(
    () => validateBoundaryEditions({ ...record, editions: replaceEdition({ ...fed2023, byteLength: fed2023.byteLength + 1 }) }),
    /byte length changed/,
  );
  assert.throws(
    () => validateBoundaryEditions({ ...record, totalByteLength: 1 }),
    /does not equal the recomputed total/,
  );
  assert.throws(
    () => validateBoundaryEditions({ ...record, editions: replaceEdition({ ...fed2023, sha256: "a".repeat(64) }) }),
    /checksum changed/,
  );
  assert.throws(
    () => validateBoundaryEditions({ ...record, editions: replaceEdition({ ...fed2023, featureCount: 338 }) }),
    /feature count changed/,
  );
  assert.throws(
    () => validateBoundaryEditions({ ...record, editions: replaceEdition({ ...fed2023, productionEligible: true }) }),
    /production eligibility/,
  );
  assert.throws(
    () => validateBoundaryEditions({ ...record, editions: [fed2023, ...record.editions.slice(1)] }),
    /must be unique/,
  );
});

test("the superseded 2013 riding edition can never present itself as current", () => {
  assert.equal(fed2013.currentForRankings, false);
  assert.equal(fed2023.currentForRankings, true);
  assert.throws(
    () => validateBoundaryEditions({ ...record, editions: replaceEdition({ ...fed2013, currentForRankings: true }) }),
    /must not be marked current for rankings/,
  );
  assert.throws(
    () => validateBoundaryEditions({ ...record, editions: replaceEdition({ ...fed2013, supersededBy: null }) }),
    /must record what supersedes it/,
  );
  assert.throws(
    () => validateBoundaryEditions({ ...record, editions: replaceEdition({ ...fed2013, representationOrder: "2023" }) }),
    /representation order changed/,
  );
});

test("the record keeps its unvalidated-geometry and missing-French limitations", () => {
  assert.throws(
    () => validateBoundaryEditions({ ...record, notice: "Boundary archives staged." }),
    /missing-GDAL limitation/,
  );
  assert.throws(
    () => validateBoundaryEditions({ ...record, limitations: record.limitations.filter((limitation) => !/French-language/.test(limitation)) }),
    /French-language editions are not staged/,
  );
  assert.throws(
    () => validateBoundaryEditions({ ...record, featureCountMethod: "Counted by opening each layer." }),
    /\.shx index/,
  );
  assert.throws(() => validateBoundaryEditions({ ...record, status: "verified" }), /local-staging-record/);
});
