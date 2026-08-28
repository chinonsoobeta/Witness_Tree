#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const RELEASE_ID = "316af633de6a259554a79f46653481b5876ebed3be749e78b700e4aeeea0ee1f";
const AUTHORIZATION_PATH = "data/phase8-bulk-download-owner-authorization-v2-2026-08-28.json";
const BASE_URL = `https://d3g1406o0uekin.cloudfront.net/releases/phase8-bulk-download-v1/${RELEASE_ID}`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function preparePhase8BulkDownloadPublicManifest({ dataRoot = DEFAULT_DATA_ROOT } = {}) {
  const releaseDir = join(dataRoot, "derived/phase8-bulk-download-v1", RELEASE_ID);
  const candidateBytes = readFileSync(join(releaseDir, "manifest.json"));
  const candidate = JSON.parse(candidateBytes);
  const authorizationBytes = readFileSync(join(ROOT, AUTHORIZATION_PATH));
  const authorization = JSON.parse(authorizationBytes);
  assert.equal(candidate.releaseId, RELEASE_ID);
  assert.equal(sha256(candidateBytes), authorization.release.candidateManifestSha256);
  assert.equal(authorization.status, "owner-authorized-bounded-public-release");
  assert.equal(authorization.supersession.decision, "supersede-for-this-exact-bounded-release");
  assert.equal(authorization.supersession.priorAdmissionRecord.sha256, candidate.inputs.admissionRecord.sha256);
  assert.equal(authorization.supersession.doesNotCompletePhase2FormalGate, true);
  assert.equal(authorization.decisions.releaseAuthorized, true);
  assert.equal(authorization.decisions.productionAdmissionAuthorizedForThisBoundedRelease, true);
  assert.equal(candidate.geometryTransform.allOutputGeometriesValid, true);
  assert.equal(authorization.release.releaseId, RELEASE_ID);
  assert.deepEqual(authorization.release.artifacts.map(({ sha256, byteLength }) => ({ sha256, byteLength })), [candidate.outputs.csv, candidate.outputs.geopackage].map(({ sha256, byteLength }) => ({ sha256, byteLength })));
  assert.deepEqual(authorization.release.artifacts.map(({ objectKey }) => objectKey), [`releases/phase8-bulk-download-v1/${RELEASE_ID}/downloads/${candidate.outputs.csv.fileName}`, `releases/phase8-bulk-download-v1/${RELEASE_ID}/downloads/${candidate.outputs.geopackage.fileName}`]);
  assert.equal(authorization.release.publicManifestObjectKey, `releases/phase8-bulk-download-v1/${RELEASE_ID}/manifest.json`);
  const document = {
    schemaVersion: "witness-tree/phase8-bulk-download-public-manifest/1",
    status: "owner-authorized-public-technical-preview",
    releaseId: RELEASE_ID,
    releasedDate: "2026-08-28",
    scope: candidate.scope,
    methodVersion: candidate.methodVersion,
    inputs: candidate.inputs,
    geometryTransform: candidate.geometryTransform,
    modificationNotice: candidate.modificationNotice,
    artifacts: {
      csv: { ...candidate.outputs.csv, publicUrl: `${BASE_URL}/downloads/${candidate.outputs.csv.fileName}` },
      geopackage: { ...candidate.outputs.geopackage, publicUrl: `${BASE_URL}/downloads/${candidate.outputs.geopackage.fileName}` },
    },
    licences: candidate.licences,
    sources: candidate.sources,
    authorization: { path: AUTHORIZATION_PATH, sha256: sha256(authorizationBytes), status: authorization.status, supersession: authorization.supersession },
    citation: {
      en: `Witness Tree. Province forest-loss technical preview, 2020-2022. Release ${RELEASE_ID}. Statistics Canada 2021 province and territory cartographic boundaries; method ${candidate.methodVersion}.`,
      fr: `Witness Tree. Aperçu technique de la perte de forêt par province, 2020-2022. Version ${RELEASE_ID}. Limites cartographiques des provinces et territoires de Statistique Canada de 2021; méthode ${candidate.methodVersion}.`
    },
    claims: candidate.claims,
    claimLimit: candidate.claimLimit,
    claimLimitFr: candidate.claimLimitFr,
  };
  const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
  const outputPath = join(releaseDir, "public-manifest.json");
  if (existsSync(outputPath)) assert.deepEqual(readFileSync(outputPath), bytes, "immutable public manifest drift");
  else writeFileSync(outputPath, bytes, { flag: "wx" });
  return { outputPath, sha256: sha256(bytes), byteLength: bytes.length, document };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const index = process.argv.indexOf("--data-root");
  if (process.argv.some((value, offset) => offset > 1 && value !== "--data-root" && offset !== index + 1)) throw new Error("Usage: prepare-phase8-bulk-download-public-manifest.mjs [--data-root PATH]");
  console.log(JSON.stringify(preparePhase8BulkDownloadPublicManifest({ dataRoot: index === -1 ? undefined : process.argv[index + 1] }), null, 2));
}
