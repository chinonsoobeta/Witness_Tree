import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function validateSecurityScans(workflow) {
  const ci = workflow.split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n");
  assert.match(ci, /verify:\s*\n\s+needs: \[codeql, secrets\]/, "The required verify job must depend on security scans");
  assert.ok(ci.includes("if: ${{ always() && !cancelled() }}"), "Verify must run even when a prerequisite fails");
  assert.match(ci, /verify:[\s\S]*?permissions:\n\s+contents: read\n\s+runs-on:/, "Verify needs only read access to repository contents");
  assert.ok(ci.includes("CODEQL_RESULT: ${{ needs.codeql.result }}") && ci.includes("SECRETS_RESULT: ${{ needs.secrets.result }}"));
  for (const result of ["CODEQL_RESULT", "SECRETS_RESULT"]) assert.ok(ci.includes(`test "$${result}" = success`), "Verify must fail for unsuccessful security scans");
  assert.match(ci, /npm audit --omit=dev --audit-level=high/, "Production dependency audit must remain blocking");
  assert.match(ci, /language: \[javascript-typescript, python, actions\]/);
  for (const action of ["init", "analyze"]) assert.match(ci, new RegExp(`uses: github/codeql-action/${action}@[0-9a-f]{40}`));
  assert.match(ci, /run: node scripts\/check-security-scans\.mjs --sarif outputs\/codeql/);
  assert.match(ci, /fetch-depth: 0/, "Secret scans must include history");
  assert.match(ci, /gitleaks_8\.30\.1_linux_x64\.tar\.gz/);
  assert.match(ci, /551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb/);
  assert.match(ci, /sha256sum --check/);
  assert.match(ci, /gitleaks" git --redact=100 --no-banner --exit-code 1 --report-format json --report-path \/tmp\/gitleaks-results\.json --log-opts="--all" \./);
  assert.doesNotMatch(ci, /continue-on-error: true|gitleaks[^\n]*(?:\|\| true|--exit-code 0)/);
  return { status: "passed", scope: "security-scan-configuration", externalReview: false };
}

export function validateCodeqlResults(documents) {
  assert.ok(documents.length > 0, "CodeQL produced no SARIF evidence");
  let results = 0;
  for (const document of documents) {
    assert.equal(document.version, "2.1.0", "Unrecognized SARIF version");
    assert.ok(Array.isArray(document.runs) && document.runs.length > 0, "SARIF has no runs");
    for (const run of document.runs) {
      assert.ok(run.tool?.driver?.name?.includes("CodeQL"), "SARIF is not from CodeQL");
      assert.ok(Array.isArray(run.results), "SARIF results are missing");
      assert.ok((run.invocations ?? []).every((invocation) => invocation.executionSuccessful !== false), "CodeQL invocation failed");
      results += run.results.length;
    }
  }
  assert.equal(results, 0, `CodeQL reported ${results} finding(s); inspect the preserved SARIF`);
  return { status: "passed", documents: documents.length, findings: results, externalReview: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--sarif") {
    const directory = process.argv[3];
    assert.ok(directory && process.argv.length === 4);
    const documents = readdirSync(directory).filter((name) => name.endsWith(".sarif")).map((name) => JSON.parse(readFileSync(path.join(directory, name), "utf8")));
    console.log(JSON.stringify(validateCodeqlResults(documents)));
  } else {
    assert.equal(process.argv.length, 2, "Unknown security gate argument");
    console.log(JSON.stringify(validateSecurityScans(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"))));
  }
}
