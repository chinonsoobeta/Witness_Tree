// Keeps the operator-facing shell runner exit contract explicit. This is a
// deliberately small static inventory, not a shell parser: unfamiliar status
// expressions fail the check instead of being silently classified.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
export const TAXONOMY_PATH = "data/exit-code-taxonomy.json";
export const TAXONOMY_SCHEMA = "witness-tree/operator-runner-exit-taxonomy/1";

function repositoryPath(path) {
  return new URL(path, root);
}

function readJson(path) {
  return JSON.parse(readFileSync(repositoryPath(path), "utf8"));
}

function runnerPaths() {
  return readdirSync(repositoryPath("scripts"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^run-.*\.sh$/.test(entry.name))
    .map((entry) => `scripts/${entry.name}`)
    .sort();
}

function increment(target, code) {
  target[code] = (target[code] ?? 0) + 1;
}

function normalizeSource(value) {
  return value.trim().replace(/\s+/g, " ");
}

function failCalls(line, defaultFailCode) {
  const calls = [];
  const pattern = /\bfail\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')(?=\s|;|$)/g;
  for (const match of line.matchAll(pattern)) {
    const suffix = line.slice(match.index + match[0].length);
    const explicitCode = suffix.match(/^\s+(\d{1,3})(?=\s*(?:;|$))/)?.[1];
    assert.ok(explicitCode || defaultFailCode !== null, `fail call has no declared default status: ${line.trim()}`);
    calls.push({ code: Number(explicitCode ?? defaultFailCode), message: match[1].replace(/\s+/g, " ") });
  }
  return calls;
}

function inlinePredicate(line, path, lineNumber) {
  if (!line.includes("node -e") || !line.includes("process.exit(")) return null;
  const body = line.slice(line.indexOf("process.exit("));
  const childCodes = [...new Set([...body.matchAll(/\b([01])\b/g)].map((match) => Number(match[1])))].sort();
  assert.ok(childCodes.length > 0, `${path}:${lineNumber} has an unclassified inline Node exit`);
  return { line: lineNumber, childCodes, source: normalizeSource(line) };
}

export function collectRunnerInventory(readFile = (path) => readFileSync(repositoryPath(path), "utf8")) {
  const runners = runnerPaths();
  const inventory = {};
  for (const path of runners) {
    const lines = readFile(path).split("\n");
    const codes = {};
    const siteDescriptors = [];
    const inlineNodePredicates = [];
    let defaultFailCode = null;
    for (const [index, line] of lines.entries()) {
      const lineNumber = index + 1;
      const defaultMatch = line.match(/^fail\(\)\s*\{.*\$\{2:-(\d{1,3})\}/);
      if (defaultMatch) defaultFailCode = Number(defaultMatch[1]);
      if (!/^fail\(\)/.test(line)) {
        for (const match of line.matchAll(/(?:^|[;{\s])exit\s+(\d{1,3})(?=\s*(?:;|$))/g)) {
          const code = Number(match[1]);
          increment(codes, code);
          siteDescriptors.push(`exit:${lineNumber}:${code}:${normalizeSource(`${lines[index - 1] ?? ""} ${line}`)}`);
        }
      }
      if (!/^fail\(\)/.test(line)) {
        for (const { code, message } of failCalls(line, defaultFailCode)) {
          increment(codes, code);
          siteDescriptors.push(`fail:${lineNumber}:${code}:${message}`);
        }
      }
      if (!/^fail\(\)/.test(line) && /(?:^|[;{\s])exit\s+"?\$[A-Za-z_][A-Za-z0-9_]*/.test(line)) {
        siteDescriptors.push(`forwarded-status:${lineNumber}:${normalizeSource(line)}`);
      }
      const predicate = inlinePredicate(line, path, lineNumber);
      if (predicate) inlineNodePredicates.push(predicate);
    }
    for (const predicate of inlineNodePredicates) {
      const parent = [lines[predicate.line - 1], ...lines.slice(predicate.line, predicate.line + 3)]
        .flatMap((line) => failCalls(line, defaultFailCode))[0];
      const parentCode = parent?.code ?? null;
      assert.notEqual(parentCode, null, `${path}:${predicate.line} has no mapped shell refusal`);
      siteDescriptors.push(`inline-node-predicate:${predicate.line}:${predicate.childCodes.join(",")}:${parentCode}:${predicate.source}`);
    }
    inventory[path] = {
      codes,
      defaultFailCode,
      siteContractSha256: createHash("sha256").update(siteDescriptors.join("\n")).digest("hex"),
    };
  }
  return { runners, inventory };
}

function exact(value, expected, label) {
  assert.deepEqual(value, expected, label);
}

export function validateTaxonomy(document, observed = collectRunnerInventory()) {
  assert.deepEqual(Object.keys(document).sort(), ["boundary", "codes", "runners", "schemaVersion", "status"], "taxonomy has unexpected fields");
  assert.equal(document.schemaVersion, TAXONOMY_SCHEMA, "taxonomy schema differs");
  assert.equal(document.status, "engineering-derived-static-inventory", "taxonomy status differs");
  assert.equal(document.boundary, "Explicit shell refusals, literal exits, forwarded-status exits, and inline Node predicates in the nineteen scripts/run-*.sh operator runners. Native child statuses propagated by errexit or pipefail are outside the intentional taxonomy and require the child diagnostic.", "taxonomy boundary differs");
  assert.ok(Array.isArray(document.codes), "taxonomy codes are required");
  assert.ok(document.runners && typeof document.runners === "object" && !Array.isArray(document.runners), "taxonomy runners are required");
  const declaredCodes = document.codes.map(({ code, meaning }) => {
    assert.ok(Number.isInteger(code) && code >= 0 && code <= 255, "taxonomy code must be an exit status");
    assert.ok(typeof meaning === "string" && meaning.length > 0, `taxonomy code ${code} needs a meaning`);
    return code;
  }).sort((a, b) => a - b);
  assert.deepEqual(declaredCodes, [...new Set(declaredCodes)], "taxonomy codes must be unique");
  exact(Object.keys(document.runners).sort(), observed.runners, "runner scope drifted");
  for (const path of observed.runners) {
    const declared = document.runners[path];
    assert.deepEqual(Object.keys(declared).sort(), ["codes", "defaultFailCode", "siteContractSha256"], `${path} taxonomy entry differs`);
    for (const code of Object.keys(observed.inventory[path].codes).map(Number)) {
      assert.ok(declaredCodes.includes(code), `${path} uses undocumented exit code ${code}`);
    }
    exact(declared, observed.inventory[path], `${path} exit-code sites or meanings drifted`);
  }
  return { runners: observed.runners.length, codes: declaredCodes };
}

function main() {
  const observed = collectRunnerInventory();
  if (process.argv.includes("--print")) {
    console.log(JSON.stringify(observed, null, 2));
    return;
  }
  const result = validateTaxonomy(readJson(TAXONOMY_PATH), observed);
  console.log(`${TAXONOMY_PATH}: ${result.runners} operator runners; documented codes ${result.codes.join(", ")}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
