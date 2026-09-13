#!/usr/bin/env node
// The volume sources this project may analyse but must never redistribute.
//
// Stumpage appraisal parameter sheets and appraisal manuals are Crown copyright
// with an explicit no-redistribution notice. Harvest Billing System reports fall
// under the gov.bc.ca all-rights-reserved terms. BC Timber Sales auction pages
// name bidders and their rights are unverified. All of them live on the data
// root only. See docs/BC_VOLUME_INSTRUMENT_ADMISSION.md.
//
// This check reads the repository and any local build output. It does not read
// the data root, so it runs the same with or without the external SSD.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCAN_ROOTS = ["public", "data", "app", "components", "lib", ".next"];
const SKIP_DIRECTORIES = new Set(["node_modules", "cache"]);
const TEXT_EXTENSIONS = new Set([".json", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".html", ".csv", ".txt", ".md", ".rsc"]);

export const WITHHELD_SOURCE_IDS = ["bc-mps-appraisal-parameters", "bc-interior-appraisal-manual", "bc-hbs-scaling-history", "bc-hbs-scaling-history-region", "bc-hbs-scaling-history-grade", "bc-hbs-scaling-history-restatement-probe", "bc-bcts-timber-sale-results"];

export const FORBIDDEN_FILENAMES = [
  { pattern: /^mps_[a-z]{3}_\d{2}_(?:coast|interior)\.pdf$/i, source: "Market Pricing System appraisal parameters" },
  { pattern: /(?:^|_)iam_.*\.pdf$|^\d{4}_iam_.*\.pdf$|^interior_ece_procedures.*\.pdf$/i, source: "Interior Appraisal Manual" },
  { pattern: /^hbs_.*\.pdf$/i, source: "Harvest Billing System report" },
  { pattern: /^A\d{5}\.html?$/, source: "BC Timber Sales auction page" },
];

export const FORBIDDEN_CONTENT = [
  { pattern: /"bids"\s*:\s*\[\s*\{[^\]]*?"(?:client|bonus)"/, reason: "BC Timber Sales bidder records" },
  { pattern: /\b\d[\d.,]*\s*(?:m³|m3)\s*\/\s*ha\b|\b(?:cubicMetresPerHectare|volumePerHectare|m3PerHa)\b/, reason: "a cubic-metres-per-hectare derivation" },
];

function walk(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const next = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) walk(next, files);
    } else if (entry.isFile()) {
      files.push(next);
    }
  }
  return files;
}

export function findViolations(root = repositoryRoot) {
  const violations = [];
  for (const scanRoot of SCAN_ROOTS) {
    const absolute = path.join(root, scanRoot);
    if (!existsSync(absolute) || !statSync(absolute).isDirectory()) continue;
    for (const file of walk(absolute, [])) {
      const relative = path.relative(root, file).split(path.sep).join("/");
      const name = path.basename(file);
      for (const { pattern, source } of FORBIDDEN_FILENAMES) {
        if (pattern.test(name)) violations.push(`${relative}: filename matches a withheld ${source}.`);
      }
      const head = readFileSync(file).subarray(0, 5).toString("latin1");
      if (head === "%PDF-") violations.push(`${relative}: PDF bytes in a published or build path; appraisal and billing PDFs are not redistributable.`);
      if (!TEXT_EXTENSIONS.has(path.extname(name))) continue;
      const text = readFileSync(file, "utf8");
      for (const { pattern, reason } of FORBIDDEN_CONTENT) {
        if (pattern.test(text)) violations.push(`${relative}: contains ${reason}.`);
      }
    }
  }
  const manifestPath = path.join(root, "data/staged-acquisitions.json");
  if (existsSync(manifestPath)) {
    for (const entry of JSON.parse(readFileSync(manifestPath, "utf8")).entries ?? []) {
      if (WITHHELD_SOURCE_IDS.includes(entry.sourceId) && entry.redistributable !== false) violations.push(`data/staged-acquisitions.json: ${entry.id} must carry redistributable: false.`);
    }
  }
  const indicatorPath = path.join(root, "data/bc-timber-harvest-aac-indicator.json");
  if (existsSync(indicatorPath)) {
    const indicator = JSON.parse(readFileSync(indicatorPath, "utf8"));
    if (indicator.source?.licenceId !== "ogl-bc") violations.push("data/bc-timber-harvest-aac-indicator.json: the only published volume source must be the OGL-BC indicator.");
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = findViolations();
  if (violations.length) {
    console.error(violations.join("\n"));
    process.exit(1);
  }
  console.log("Volume source redistribution check passed: no withheld appraisal, billing or auction material in published or build paths.");
}
