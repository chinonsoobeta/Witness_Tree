#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseCsv } from "../lib/phase2/nfd-harvest-statistics.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_AUDIT = path.join(ROOT, "data", "phase2-nfd-official-recovery-audit-2026-08-27.json");
const SHA256 = /^[a-f0-9]{64}$/;
const PROVINCES = ["BC", "AB", "ON", "QC"];
const EXPECTED_PERIODS = [
  ["BC", 1990, 2015, 26, "statcan-table-2.10-2018", "provincial-private-federal", 50],
  ["AB", 1990, 2015, 26, "statcan-table-2.10-2018", "provincial-private-federal", 50],
  ["ON", 1990, 2015, 26, "statcan-table-2.10-2018", "provincial-private-federal", 50],
  ["QC", 1990, 2015, 26, "statcan-table-2.10-2018", "provincial-private-federal", 50],
  ["BC", 2016, 2019, 4, "nrcan-forest-statistical-profile-f1e8c437", "provincial-territorial-crown-private-displayed", 0.5],
  ["AB", 2016, 2019, 4, "nrcan-forest-statistical-profile-f1e8c437", "provincial-territorial-crown-private-displayed", 0.5],
  ["ON", 2016, 2018, 3, "nrcan-forest-statistical-profile-f1e8c437", "provincial-territorial-crown-private-displayed", 0.5],
  ["QC", 2016, 2018, 3, "nrcan-forest-statistical-profile-f1e8c437", "provincial-territorial-crown-private-displayed", 0.5],
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function exactKeys(value, keys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} keys drifted`);
}

function descriptor(filePath, label) {
  const info = lstatSync(filePath);
  assert(info.isFile() && !info.isSymbolicLink(), `${label} must be a regular non-symlink file`);
  const bytes = readFileSync(filePath);
  return { bytes, byteLength: info.size, sha256: sha256(bytes) };
}

function validateBinding(binding, pathKey, label) {
  exactKeys(binding, [pathKey, "byteLength", "sha256"], label);
  const value = binding[pathKey];
  assert(typeof value === "string" && value && !path.isAbsolute(value) && !value.split(/[\\/]/).includes(".."), `${label} path must be relative and traversal-free`);
  assert(Number.isSafeInteger(binding.byteLength) && binding.byteLength > 0, `${label} byteLength must be positive`);
  assert.match(binding.sha256, SHA256, `${label} sha256 must be lowercase SHA-256`);
}

function verifyBinding(filePath, binding, label) {
  const actual = descriptor(filePath, label);
  assert.equal(actual.byteLength, binding.byteLength, `${label} byte length differs`);
  assert.equal(actual.sha256, binding.sha256, `${label} SHA-256 differs`);
  return actual.bytes;
}

export function validateAudit(audit) {
  exactKeys(audit, ["claims", "dataRoot", "decision", "officialSources", "periodFindings", "recordedAt", "rejectedProvincialSubstitutes", "schemaVersion", "status", "summary", "target"], "audit");
  assert.equal(audit.schemaVersion, "witness-tree/phase2-nfd-official-recovery-audit/1");
  assert.equal(audit.status, "completed-no-safe-exact-replacements");
  assert.equal(audit.recordedAt, "2026-08-27");
  assert.equal(audit.dataRoot, "Witness_Tree-data");

  exactKeys(audit.target, ["byProvince", "fractionalComparisonReceipt", "nfdProfile", "pendingRows", "years"], "target");
  validateBinding(audit.target.nfdProfile, "repositoryPath", "target NFD profile");
  validateBinding(audit.target.fractionalComparisonReceipt, "repositoryPath", "target receipt");
  assert.equal(audit.target.pendingRows, 118);
  assert.deepEqual(audit.target.byProvince, { BC: 30, AB: 30, ON: 29, QC: 29 });
  assert.deepEqual(audit.target.years, { BC: "1990-2019", AB: "1990-2019", ON: "1990-2018", QC: "1990-2018" });

  assert(Array.isArray(audit.officialSources) && audit.officialSources.length === 5, "five official source groups are required");
  const sourceIds = new Set();
  for (const [index, source] of audit.officialSources.entries()) {
    const sourceKeys = ["files", "finding", "id", "licence", "publisher", "sourceUrl"];
    if (source.id === "nfd-zenodo-3.0.0") sourceKeys.push("versionFindings");
    exactKeys(source, sourceKeys, `official source ${index}`);
    assert(!sourceIds.has(source.id), `duplicate official source ${source.id}`);
    sourceIds.add(source.id);
    for (const key of ["id", "publisher", "sourceUrl", "licence", "finding"]) assert(typeof source[key] === "string" && source[key].length > 10, `official source ${source.id} ${key} is required`);
    assert(/^https:\/\//.test(source.sourceUrl), `official source ${source.id} URL must use HTTPS`);
    assert(Array.isArray(source.files) && source.files.length > 0, `official source ${source.id} files are required`);
    source.files.forEach((file, fileIndex) => validateBinding(file, "relativePath", `official source ${source.id} file ${fileIndex}`));
  }
  assert.deepEqual([...sourceIds], ["nfd-zenodo-3.0.0", "statcan-table-3.52-2009", "statcan-table-2.10-2018", "nrcan-forest-statistical-profile-f1e8c437", "ontario-managed-crown-harvest-area"]);
  const historical = audit.officialSources[0];
  assert(Array.isArray(historical.versionFindings) && historical.versionFindings.length === 3, "three historical NFD version findings are required");
  for (const finding of historical.versionFindings) {
    exactKeys(finding, ["absentRows", "archiveMember", "archiveRelativePath", "completeRowKeys", "completeRowTotals", "completeRows", "extractedFileRelativePath", "partialUnknownRows", "presentTargetRows", "safeExactReplacementRows", "unknownCellCount", "version"], `historical NFD ${finding.version}`);
    assert(historical.files.some((file) => file.relativePath === finding.archiveRelativePath), `historical NFD ${finding.version} archive is not bound`);
    assert(historical.files.some((file) => file.relativePath === finding.extractedFileRelativePath), `historical NFD ${finding.version} extracted file is not bound`);
    assert(typeof finding.archiveMember === "string" && finding.archiveMember.endsWith(".csv") && !finding.archiveMember.includes("/"), `historical NFD ${finding.version} archive member is invalid`);
    assert.equal(finding.presentTargetRows + finding.absentRows, 118, `historical NFD ${finding.version} target coverage differs`);
    assert.equal(finding.partialUnknownRows + finding.completeRows, finding.presentTargetRows, `historical NFD ${finding.version} row classification differs`);
    assert.equal(finding.completeRowKeys.length, finding.completeRows, `historical NFD ${finding.version} complete keys differ`);
    assert.deepEqual(Object.keys(finding.completeRowTotals), finding.completeRowKeys, `historical NFD ${finding.version} complete totals differ`);
    assert.equal(finding.safeExactReplacementRows, 0, `historical NFD ${finding.version} must not claim safe exact replacements`);
  }
  assert.deepEqual(historical.versionFindings.map((finding) => finding.version), ["1.0.0", "2.0.0", "3.0.0"]);
  assert.deepEqual(historical.versionFindings.map((finding) => [finding.version, path.basename(finding.archiveRelativePath), finding.archiveMember, path.basename(path.dirname(finding.extractedFileRelativePath))]), [
    ["1.0.0", "NFD-BDNF_1_0_0.zip", "EN FR - Data - NFD - Area harvested by ownership and harvesting method.csv", "extracted-v1"],
    ["2.0.0", "NFD-BDNF_2_0_0.zip", "NFD - Area harvested by ownership and harvesting method - EN FR.csv", "extracted-v2"],
    ["3.0.0", "NFD-BDNF_3_0_0.zip", "NFD - Area harvested by ownership and harvesting method - EN FR.csv", "extracted-v3"],
  ], "historical NFD archive-member associations drifted");
  assert.deepEqual(historical.versionFindings.map((finding) => [finding.presentTargetRows, finding.partialUnknownRows, finding.completeRows, finding.absentRows, finding.unknownCellCount]), [[112, 112, 0, 6, 1096], [116, 116, 0, 2, 1000], [118, 117, 1, 0, 1005]]);
  assert.deepEqual(historical.versionFindings[2].completeRowTotals, { "BC:2019": 137243 });

  assert(Array.isArray(audit.periodFindings) && audit.periodFindings.length === 8, "eight period findings are required");
  const periodKeys = new Set();
  let periodRows = 0;
  let historicalRows = 0;
  let laterRows = 0;
  for (const period of audit.periodFindings) {
    exactKeys(period, ["candidate", "candidateScope", "endYear", "precisionHectares", "province", "rowCount", "safeExactReplacement", "startYear"], "period finding");
    assert(PROVINCES.includes(period.province), "period province is invalid");
    const key = `${period.province}:${period.startYear}-${period.endYear}`;
    assert(!periodKeys.has(key), `duplicate period ${key}`);
    periodKeys.add(key);
    assert.equal(period.rowCount, period.endYear - period.startYear + 1, `${key} row count differs`);
    assert.equal(period.safeExactReplacement, false, `${key} must not claim an exact replacement`);
    assert(typeof period.precisionHectares === "number" && period.precisionHectares > 0, `${key} precision is required`);
    assert(sourceIds.has(period.candidate), `${key} candidate is not bound`);
    periodRows += period.rowCount;
    if (period.candidate === "statcan-table-2.10-2018") historicalRows += period.rowCount;
    else laterRows += period.rowCount;
  }
  assert.deepEqual(
    audit.periodFindings.map((period) => [period.province, period.startYear, period.endYear, period.rowCount, period.candidate, period.candidateScope, period.precisionHectares]),
    EXPECTED_PERIODS,
    "period recovery contract drifted",
  );
  assert.equal(periodRows, 118);
  assert.equal(historicalRows, 104);
  assert.equal(laterRows, 14);

  assert(Array.isArray(audit.rejectedProvincialSubstitutes) && audit.rejectedProvincialSubstitutes.length === 4, "four provincial source verdicts are required");
  assert.deepEqual(audit.rejectedProvincialSubstitutes.map((entry) => entry.province), PROVINCES);
  audit.rejectedProvincialSubstitutes.forEach((entry) => {
    exactKeys(entry, ["province", "reason", "source"], `provincial source ${entry.province}`);
    assert(entry.source.length > 10 && entry.reason.length > 40, `provincial source ${entry.province} verdict is incomplete`);
  });

  assert.deepEqual(audit.summary, {
    officialCandidateCoverageRows: 118,
    historicalAllTenureRoundedCandidateRows: 104,
    laterLimitedScopeCandidateRows: 14,
    safeExactReplacementRows: 0,
    remainingPendingRows: 118,
  });
  assert.match(audit.decision, /No candidate is inserted.*118 rows remain null/i);
  assert.deepEqual(audit.claims, {
    recoveryPassComplete: true,
    missingValuesImputed: false,
    nfdRowsReplaced: false,
    comparisonRecomputed: false,
    formalIndependentComparisonGateComplete: false,
    published: false,
    admitted: false,
    released: false,
    productionEligible: false,
  });
  return audit;
}

function repositoryPath(binding) {
  const resolved = path.resolve(ROOT, binding.repositoryPath);
  assert(resolved.startsWith(`${ROOT}${path.sep}`), "repository binding escapes the repository");
  return resolved;
}

function externalPath(dataRoot, binding) {
  const resolved = path.resolve(dataRoot, binding.relativePath);
  assert(resolved.startsWith(`${dataRoot}${path.sep}`), "external binding escapes the data root");
  const real = realpathSync(resolved);
  assert(real.startsWith(`${dataRoot}${path.sep}`), "external binding resolves outside the data root");
  return real;
}

function findSource(audit, id) {
  const source = audit.officialSources.find((candidate) => candidate.id === id);
  assert(source, `missing source ${id}`);
  return source;
}

function findFile(source, suffix) {
  const file = source.files.find((candidate) => candidate.relativePath.endsWith(suffix));
  assert(file, `${source.id} is missing ${suffix}`);
  return file;
}

function statcanRoundedCandidates(html) {
  const columnByProvince = { QC: "6", ON: "7", AB: "10", BC: "11" };
  const candidates = new Map();
  for (const match of html.matchAll(/<tr class="highlight-row">([\s\S]*?)<\/tr>/g)) {
    const block = match[1];
    const yearMatch = block.match(/class="row-stub">(\d{4})<\/th>/);
    if (!yearMatch) continue;
    const year = Number(yearMatch[1]);
    if (year < 1990 || year > 2015) continue;
    for (const [province, column] of Object.entries(columnByProvince)) {
      const cell = block.match(new RegExp(`<td headers="[^"]*h_469_1-${column}[^>]*>([\\s\\S]*?)<\\/td>`));
      assert(cell, `StatCan ${province}:${year} cell is missing`);
      const visible = cell[1]
        .replace(/<span class="wb-inv">[\s\S]*?<\/span>/g, "")
        .replace(/<sup[\s\S]*?<\/sup>/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|&#160;/g, " ");
      const number = visible.match(/\d[\d,]*/);
      assert(number, `StatCan ${province}:${year} rounded value is missing`);
      candidates.set(`${province}:${year}`, Number(number[0].replaceAll(",", "")) * 100);
    }
  }
  assert.equal(candidates.size, 104, "StatCan rounded target candidate count differs");
  return candidates;
}

export function historicalNfdOutcome(bytes) {
  const records = parseCsv(bytes.toString("latin1"));
  assert(records.length > 1, "historical NFD harvest CSV is empty");
  const header = records[0].map((value) => value.trim());
  const required = ["Year", "ISO", "Area (hectares)", "Data qualifier"];
  const indexes = Object.fromEntries(required.map((name) => [name, header.indexOf(name)]));
  for (const name of required) {
    assert(indexes[name] >= 0 && header.indexOf(name, indexes[name] + 1) < 0, `historical NFD header ${name} is missing or duplicated`);
  }

  const targetKeys = new Set();
  for (const [province, startYear, endYear] of [["BC", 1990, 2019], ["AB", 1990, 2019], ["ON", 1990, 2018], ["QC", 1990, 2018]]) {
    for (let year = startYear; year <= endYear; year += 1) targetKeys.add(`${province}:${year}`);
  }
  const groups = new Map();
  for (const [offset, record] of records.slice(1).entries()) {
    assert.equal(record.length, header.length, `historical NFD record ${offset + 2} width differs`);
    const province = record[indexes.ISO].trim();
    const yearText = record[indexes.Year].trim();
    if (!PROVINCES.includes(province) || !/^\d{4}$/.test(yearText)) continue;
    const key = `${province}:${Number(yearText)}`;
    if (!targetKeys.has(key)) continue;
    const group = groups.get(key) ?? { total: 0, unknownCells: 0 };
    const area = record[indexes["Area (hectares)"]].trim();
    const qualifier = record[indexes["Data qualifier"]].trim();
    if (area === "") {
      if (qualifier !== "n") group.unknownCells += 1;
    } else {
      assert(/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(area), `${key} historical area is invalid`);
      group.total += Number(area);
      assert(Number.isSafeInteger(group.total * 10), `${key} historical total is outside the supported precision`);
    }
    groups.set(key, group);
  }
  const completeRowKeys = [...groups.entries()].filter(([, group]) => group.unknownCells === 0).map(([key]) => key).sort();
  return {
    presentTargetRows: groups.size,
    partialUnknownRows: [...groups.values()].filter((group) => group.unknownCells > 0).length,
    completeRows: completeRowKeys.length,
    absentRows: targetKeys.size - groups.size,
    unknownCellCount: [...groups.values()].reduce((sum, group) => sum + group.unknownCells, 0),
    completeRowKeys,
    completeRowTotals: Object.fromEntries(completeRowKeys.map((key) => [key, groups.get(key).total])),
  };
}

function validateExternalSemantics(audit, dataRoot) {
  const profile = JSON.parse(verifyBinding(repositoryPath(audit.target.nfdProfile), audit.target.nfdProfile, "NFD profile").toString("utf8"));
  verifyBinding(repositoryPath(audit.target.fractionalComparisonReceipt), audit.target.fractionalComparisonReceipt, "fractional comparison receipt");
  const pending = profile.frame.rows.filter((row) => row.areaHectares === null);
  assert.equal(pending.length, 118, "current NFD pending-row count differs");
  assert.deepEqual(Object.fromEntries(PROVINCES.map((province) => [province, pending.filter((row) => row.province === province).length])), audit.target.byProvince);

  const bytesByPath = new Map();
  for (const source of audit.officialSources) {
    for (const file of source.files) {
      bytesByPath.set(file.relativePath, verifyBinding(externalPath(dataRoot, file), file, `${source.id}:${path.basename(file.relativePath)}`));
    }
  }

  const historical = findSource(audit, "nfd-zenodo-3.0.0");
  for (const finding of historical.versionFindings) {
    const archiveBinding = historical.files.find((file) => file.relativePath === finding.archiveRelativePath);
    const extractedBinding = historical.files.find((file) => file.relativePath === finding.extractedFileRelativePath);
    const archivePath = externalPath(dataRoot, archiveBinding);
    const memberNames = execFileSync("unzip", ["-Z1", archivePath], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim().split(/\r?\n/);
    assert.equal(memberNames.filter((name) => name === finding.archiveMember).length, 1, `historical NFD ${finding.version} archive member must occur exactly once`);
    const memberBytes = execFileSync("unzip", ["-p", archivePath, finding.archiveMember], { encoding: null, maxBuffer: 16 * 1024 * 1024 });
    assert.equal(memberBytes.byteLength, extractedBinding.byteLength, `historical NFD ${finding.version} archive member byte length differs`);
    assert.equal(sha256(memberBytes), extractedBinding.sha256, `historical NFD ${finding.version} archive member SHA-256 differs`);
    assert.deepEqual(memberBytes, bytesByPath.get(finding.extractedFileRelativePath), `historical NFD ${finding.version} extracted bytes differ from archive member`);
    const outcome = historicalNfdOutcome(memberBytes);
    assert.deepEqual(outcome, {
      presentTargetRows: finding.presentTargetRows,
      partialUnknownRows: finding.partialUnknownRows,
      completeRows: finding.completeRows,
      absentRows: finding.absentRows,
      unknownCellCount: finding.unknownCellCount,
      completeRowKeys: finding.completeRowKeys,
      completeRowTotals: finding.completeRowTotals,
    }, `historical NFD ${finding.version} semantic outcome differs`);
  }
  const currentBc2019 = profile.frame.rows.find((row) => row.province === "BC" && row.year === 2019);
  assert(currentBc2019 && currentBc2019.areaHectares === null, "current BC:2019 must remain pending");
  assert.equal(currentBc2019.knownAreaHectaresExact, "155573.8", "current BC:2019 revised known subtotal differs");
  assert.deepEqual(currentBc2019.missingness.unknownQualifiers, ["r"], "current BC:2019 revised unknown evidence differs");

  const statcan = findSource(audit, "statcan-table-2.10-2018");
  const statcanHtml = bytesByPath.get(findFile(statcan, "table-2-10-forest-area-harvested-1975-2015.html").relativePath).toString("utf8");
  assert.match(statcanHtml, /square kilometers/);
  assert.match(statcanHtml, /As of 1990, figures include provincial and private lands and federal land\./);
  assert.match(statcanHtml, /National Forestry Database<\/a>,&nbsp;2017/);
  for (const year of [1990, 2015]) assert.match(statcanHtml, new RegExp(`class="row-stub">${year}<\\/th>`));
  const roundedCandidates = statcanRoundedCandidates(statcanHtml);
  for (const row of pending.filter((candidate) => candidate.year >= 1990 && candidate.year <= 2015)) {
    assert(roundedCandidates.has(`${row.province}:${row.year}`), `${row.province}:${row.year} rounded candidate is missing`);
  }

  const legacy = findSource(audit, "statcan-table-3.52-2009");
  const legacyHtml = bytesByPath.get(findFile(legacy, "table-3-52-forest-area-harvested.html").relativePath).toString("utf8");
  assert.match(legacyHtml, /Table 3\.52/);
  assert.match(legacyHtml, /Canadian Council of Forest Ministers,[\s\S]{0,80}2008/);

  const federal = findSource(audit, "nrcan-forest-statistical-profile-f1e8c437");
  const readme = bytesByPath.get(findFile(federal, "README.md").relativePath).toString("utf8");
  const licence = bytesByPath.get(findFile(federal, "LICENSE.md").relativePath).toString("utf8");
  assert.match(readme, /personal use only/i);
  assert.match(licence, /All rights reserved/i);
  const aggregateText = bytesByPath.get(findFile(federal, "StatProfile_Management_harvest_EN.csv").relativePath).toString("utf8");
  const records = parseCsv(aggregateText);
  assert.deepEqual(records[0], ["Year", "Jurisdiction", "Area (hectares)"]);
  assert.equal(records.length, 345, "federal aggregate row count differs");
  const provinceByName = { Alberta: "AB", "British Columbia": "BC", Ontario: "ON", Quebec: "QC" };
  const aggregate = new Map();
  for (const record of records.slice(1)) {
    const province = provinceByName[record[1]];
    if (province) aggregate.set(`${province}:${record[0]}`, Number(record[2]));
  }
  assert.equal(aggregate.size, 100, "federal aggregate target row count differs");
  let matchingPendingSubtotals = 0;
  for (const row of pending) {
    const candidate = aggregate.get(`${row.province}:${row.year}`);
    if (candidate === undefined) continue;
    assert.equal(candidate, Math.round(row.knownAreaHectares), `${row.province}:${row.year} aggregate is not the rounded known-area subtotal`);
    matchingPendingSubtotals += 1;
  }
  assert.equal(matchingPendingSubtotals, 78, "federal aggregate pending-subtotal overlap differs");
  for (const period of audit.periodFindings.filter((candidate) => candidate.candidate === federal.id)) {
    for (let year = period.startYear; year <= period.endYear; year += 1) {
      assert(aggregate.has(`${period.province}:${year}`), `${period.province}:${year} later candidate is missing`);
    }
  }
  return { pendingRows: pending.length, matchingPendingSubtotals, roundedCandidateRows: roundedCandidates.size };
}

export function verifyAudit({ auditPath = DEFAULT_AUDIT, dataRoot = null, verifyExternal = false } = {}) {
  const audit = validateAudit(JSON.parse(descriptor(auditPath, "audit").bytes.toString("utf8")));
  verifyBinding(repositoryPath(audit.target.nfdProfile), audit.target.nfdProfile, "NFD profile");
  verifyBinding(repositoryPath(audit.target.fractionalComparisonReceipt), audit.target.fractionalComparisonReceipt, "fractional comparison receipt");
  if (!verifyExternal) return { audit, externalVerified: false };
  assert(typeof dataRoot === "string", "--data-root is required with --verify-external");
  const root = realpathSync(path.resolve(dataRoot));
  const rootInfo = lstatSync(root);
  assert(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), "data root must be a real directory");
  return { audit, externalVerified: true, ...validateExternalSemantics(audit, root) };
}

function parseArguments(argv) {
  const result = { auditPath: DEFAULT_AUDIT, dataRoot: null, verifyExternal: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--verify-external") result.verifyExternal = true;
    else if (argv[index] === "--audit") result.auditPath = path.resolve(argv[++index] ?? "");
    else if (argv[index] === "--data-root") result.dataRoot = path.resolve(argv[++index] ?? "");
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  if (result.verifyExternal && !result.dataRoot) throw new Error("--data-root is required with --verify-external");
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyAudit(parseArguments(process.argv.slice(2)));
    console.log(`Phase 2 NFD official recovery audit passed${result.externalVerified ? " with exact external readback" : " structurally"}.`);
  } catch (error) {
    console.error(`Stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
