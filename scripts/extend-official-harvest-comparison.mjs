import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extendOfficialPublishedHarvestComparison } from "../lib/phase2/official-published-harvest-comparator.mjs";
import { transformNfdCsv } from "../lib/phase2/nfd-harvest-statistics.mjs";
import { validateStagedAcquisitions } from "./check-staged-acquisitions.mjs";
import { resolveDataRoot } from "./data-root.mjs";
import { atomicCreate } from "./run-phase2-annual-nfd-comparator.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relative) => JSON.parse(readFileSync(path.join(repository, relative), "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function prepareNfdHarvestExtension({ output, dataRoot = resolveDataRoot() }) {
  const root = realpathSync(dataRoot);
  const manifest = validateStagedAcquisitions(readJson("data/staged-acquisitions.json"));
  const source = manifest.entries.find((entry) => entry.sourceId === "nfd-5.2-undeclared");
  assert.ok(source, "WP1 blocked: the exact NFD acquisition must pass the staging checker before row generation");
  const relative = source.localPath.replace(/^\.\.\/Witness_Tree-data\//, "");
  const sourcePath = realpathSync(path.join(root, relative));
  assert.ok(sourcePath.startsWith(`${root}${path.sep}`), "NFD source must remain on the data root");
  const sourceBytes = readFileSync(sourcePath);
  assert.equal(sourceBytes.length, source.byteLength);
  assert.equal(sha256(sourceBytes), source.sha256, "NFD source checksum differs");
  const contract = readJson("data/phase2-official-published-harvest-contract.json");
  const strictBinding = contract.witnessTreeInput.strictComparisonOutput;
  const strictPath = realpathSync(path.join(root, strictBinding.relativePath));
  assert.ok(strictPath.startsWith(`${root}${path.sep}`), "Imagery input must remain on the data root");
  const strictBytes = readFileSync(strictPath);
  assert.equal(strictBytes.length, strictBinding.byteLength);
  assert.equal(sha256(strictBytes), strictBinding.sha256, "Imagery input checksum differs");
  const receipt = readJson("data/phase2-official-published-harvest-comparison-receipt-2026-08-27.json");
  const historicalPath = realpathSync(path.join(root, receipt.externalOutput.relativePath));
  assert.ok(historicalPath.startsWith(`${root}${path.sep}`), "Historical input must remain on the data root");
  const historicalBytes = readFileSync(historicalPath);
  assert.equal(historicalBytes.length, receipt.externalOutput.byteLength);
  assert.equal(sha256(historicalBytes), receipt.externalOutput.sha256, "Historical publication checksum differs");
  const historical = JSON.parse(historicalBytes);
  const rows = extendOfficialPublishedHarvestComparison(historical.rows, JSON.parse(strictBytes), transformNfdCsv(sourceBytes.toString("utf8")), source);
  const document = {
    ...historical,
    status: "prepared-nfd-extension-not-published",
    recordedAt: new Date().toISOString(),
    summary: {
      ...historical.summary, rows: rows.length,
      nfdRows: rows.length - historical.rows.length,
      computedNfdRows: rows.filter((row) => row.comparisonStatus === "computed-nfd-reference").length,
      incompleteInputRows: rows.filter((row) => row.comparisonStatus === "pending-incomplete-input").length,
      strictNfdExactTotalsRemainingNull: rows.filter((row) => row.strictNfdExactTotalHectares === null).length,
    },
    publicationBoundary: {
      ...historical.publicationBoundary,
      entitlement: {
        en: "The extended rows compare a Witness Tree observed-loss interval against a published harvest figure for the same labelled interval. They compare two independent instruments, neither correcting the other. Neither series may be summed across intervals. The fixed province aggregate ignores the year control. A year-label join does not establish identical reporting periods.",
        fr: "Les lignes ajoutées comparent un intervalle de perte observée par Witness Tree à une superficie récoltée publiée pour le même intervalle libellé. Elles comparent deux instruments indépendants, sans correction de l’un par l’autre. Aucune série ne peut être additionnée entre les intervalles. L’agrégat provincial fixe ne tient pas compte du sélecteur d’année. Une jointure par année ne prouve pas que les périodes de déclaration sont identiques.",
      },
    },
    nfdSource: { sourceId: source.sourceId, sourceVersion: source.sourceVersion, sourceUrl: source.sourceUrl, localPath: source.localPath, byteLength: source.byteLength, sha256: source.sha256, crc64nvme: source.crc64nvme, retrievedAt: source.retrievedAt, licenceId: source.licenceId, licenceUrl: source.licenceUrl },
    rows,
  };
  const target = path.resolve(output);
  const parent = realpathSync(path.dirname(target));
  assert.ok(parent.startsWith(`${root}${path.sep}derived${path.sep}`), "Prepared data must stay under the SSD derived tree");
  const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
  atomicCreate(target, bytes);
  assert.equal(sha256(readFileSync(target)), sha256(bytes), "Prepared output readback differs");
  return { output: target, byteLength: bytes.length, sha256: sha256(bytes), summary: document.summary };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv[2], "--output", "Usage: node scripts/extend-official-harvest-comparison.mjs --output <new SSD derived file>");
  assert.equal(process.argv.length, 4, "Exactly one output path is required");
  console.log(JSON.stringify(prepareNfdHarvestExtension({ output: process.argv[3] })));
}
