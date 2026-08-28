#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildOfficialPublishedHarvestComparison, parseStatCanTable210, validateOfficialPublishedHarvestComparison } from "../lib/phase2/official-published-harvest-comparator.mjs";
import { atomicCreate } from "./run-phase2-annual-nfd-comparator.mjs";
import { validateOfficialPublishedHarvestContract } from "./check-phase2-official-published-harvest-contract.mjs";

const SELF = fileURLToPath(import.meta.url);

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fail(message) {
  throw new Error(message);
}

function readInput(inputPath, label, json = false) {
  const resolved = path.resolve(inputPath);
  const info = lstatSync(resolved);
  if (!info.isFile() || info.isSymbolicLink()) fail(`${label} must be a regular non-symlink file`);
  const bytes = readFileSync(resolved);
  return { path: resolved, bytes, value: json ? JSON.parse(bytes.toString("utf8")) : bytes.toString("utf8") };
}

function descriptor(input) {
  return { path: input.path, byteLength: input.bytes.length, sha256: digest(input.bytes) };
}

function assertBinding(input, binding, label) {
  if (input.bytes.length !== binding.byteLength || digest(input.bytes) !== binding.sha256) fail(`${label} differs from the contract binding`);
}

function parseArguments(argv) {
  const options = {};
  const names = { "--contract": "contract", "--strict-comparison": "strictComparison", "--statcan-html": "statcanHtml", "--output": "output", "--sidecar": "sidecar" };
  for (let index = 0; index < argv.length; index += 1) {
    const key = names[argv[index]];
    if (!key) fail(`unknown argument: ${argv[index]}`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) fail(`${argv[index - 1]} requires a path`);
    if (options[key]) fail(`${argv[index - 1]} was provided more than once`);
    options[key] = value;
  }
  for (const key of Object.values(names)) if (!options[key]) fail(`${key} is required`);
  return options;
}

function outputDocument(contract, rows) {
  const computedRows = rows.filter((row) => row.comparisonStatus === "computed-rounded-reference").length;
  const pendingRows = rows.filter((row) => row.comparisonStatus === "pending-restricted-source").length;
  return {
    schemaVersion: "witness-tree/phase2-official-published-harvest-comparison/1",
    status: "computed-rounded-with-restricted-pending",
    trackId: contract.trackId,
    recordedAt: contract.recordedAt,
    purpose: contract.purpose,
    summary: {
      rows: rows.length,
      computedRoundedRows: computedRows,
      restrictedPendingRows: pendingRows,
      strictNfdExactTotalsRemainingNull: rows.filter((row) => row.strictNfdExactTotalHectares === null).length,
      safeExactNfdReplacementRows: 0,
    },
    method: {
      join: contract.witnessTreeInput.join,
      witnessTreeQuantity: contract.witnessTreeInput.quantity,
      referenceQuantity: "official published forest area harvested",
      differenceType: contract.outputContract.differenceType,
      uncertaintyTreatment: contract.outputContract.uncertaintyTreatment,
    },
    publicationBoundary: {
      statcanRows: "publishable with attribution and rounding disclosure",
      restrictedRows: "numeric reference values withheld",
      strictNfdTrack: "unchanged; all 118 target exact totals remain null",
      formalPhase2Gate: "not completed by this track",
    },
    claims: { ...contract.claims },
    rows,
  };
}

export function runOfficialPublishedHarvestComparison({ contract: contractPath, strictComparison: strictPath, statcanHtml: statcanPath, output: outputPath, sidecar: sidecarPath }) {
  const contractInput = readInput(contractPath, "contract", true);
  const strictInput = readInput(strictPath, "strict comparison", true);
  const statcanInput = readInput(statcanPath, "StatCan HTML");
  const contract = validateOfficialPublishedHarvestContract(contractInput.value);
  assertBinding(strictInput, contract.witnessTreeInput.strictComparisonOutput, "strict comparison");
  assertBinding(statcanInput, contract.referenceSources[0].raw, "StatCan HTML");
  const rows = buildOfficialPublishedHarvestComparison(strictInput.value, parseStatCanTable210(statcanInput.value));
  validateOfficialPublishedHarvestComparison(rows);
  const output = outputDocument(contract, rows);
  const outputBytes = Buffer.from(`${JSON.stringify(output, null, 2)}\n`);
  const outputDescriptor = { path: path.resolve(outputPath), byteLength: outputBytes.length, sha256: digest(outputBytes) };
  const sidecar = {
    schemaVersion: "witness-tree/phase2-official-published-harvest-comparison-run/1",
    status: "executed-validated",
    executedAt: new Date().toISOString(),
    runner: { path: path.relative(path.dirname(SELF), SELF), byteLength: readFileSync(SELF).length, sha256: digest(readFileSync(SELF)) },
    inputs: { contract: descriptor(contractInput), strictComparison: descriptor(strictInput), statcanHtml: descriptor(statcanInput) },
    output: outputDescriptor,
    summary: output.summary,
    claims: { ...contract.claims },
  };
  const sidecarBytes = Buffer.from(`${JSON.stringify(sidecar, null, 2)}\n`);
  if (path.resolve(outputPath) === path.resolve(sidecarPath)) fail("output and sidecar must differ");
  atomicCreate(path.resolve(outputPath), outputBytes);
  try {
    atomicCreate(path.resolve(sidecarPath), sidecarBytes);
  } catch (error) {
    try { unlinkSync(path.resolve(outputPath)); } catch { /* preserve the original failure */ }
    throw error;
  }
  return { output: outputDescriptor, sidecar: { path: path.resolve(sidecarPath), byteLength: sidecarBytes.length, sha256: digest(sidecarBytes) }, rows };
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  try {
    const result = runOfficialPublishedHarvestComparison(parseArguments(process.argv.slice(2)));
    console.log(JSON.stringify({ status: "executed-validated", rows: result.rows.length, output: result.output, sidecar: result.sidecar }));
  } catch (error) {
    console.error(`Stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
