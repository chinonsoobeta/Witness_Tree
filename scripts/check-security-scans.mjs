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
  assert.match(ci, /gitleaks" git --config \.gitleaks\.toml --redact=100 --no-banner --exit-code 1 --report-format json --report-path \/tmp\/gitleaks-results\.json --log-opts="--all" \./);
  assert.match(ci, /run: node scripts\/check-secret-scan-canary\.mjs "\$RUNNER_TEMP\/gitleaks"/, "The configured scan must be proved against planted credentials");
  assert.doesNotMatch(ci, /continue-on-error: true|gitleaks[^\n]*(?:\|\| true|--exit-code 0)/);
  return { status: "passed", scope: "security-scan-configuration", externalReview: false };
}

/*
 * A secret scanner reading a config file can be silenced without the workflow
 * changing at all, so the config carries its own conditions. Allowlists must be
 * scoped to a named rule, must match on the captured secret rather than a path,
 * and must be anchored, which together mean an entry can only clear the exact
 * shape it names. The bundled rule set has to stay on, and nothing here may
 * redefine a bundled rule, because a redeclared rule replaces the original
 * instead of extending it.
 */
export function validateSecretScanConfig(config) {
  const lines = config.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  assert.ok(lines.includes("useDefault = true"), "The bundled gitleaks rules must stay enabled");
  assert.ok(!lines.includes("[[rules]]"), "Redeclaring a bundled rule replaces it; extend through an allowlist instead");
  assert.ok(!lines.includes("[allowlist]"), "An unscoped allowlist would quiet every rule");
  const blocks = [];
  for (const line of lines) {
    if (line.startsWith("[")) blocks.push({ header: line, body: [] });
    else if (blocks.length > 0) blocks.at(-1).body.push(line);
  }
  const allowlists = blocks.filter((block) => block.header === "[[allowlists]]");
  assert.ok(allowlists.length > 0, "The config declares no allowlists and so explains nothing");
  for (const { body } of allowlists) {
    const text = body.join("\n");
    assert.match(text, /^targetRules = \[/m, "Every allowlist must name the rules it quiets");
    assert.match(text, /^regexTarget = "secret"$/m, "Allowlists must match the captured secret, never a path or the surrounding line");
    for (const key of ["paths", "stopwords", "commits"]) assert.ok(!body.some((line) => line.startsWith(`${key} =`)), `Allowlisting by ${key} clears more than a shape`);
    const patterns = [...text.matchAll(/'''(.*?)'''/gs)].map((match) => match[1]);
    assert.ok(patterns.length > 0, "An allowlist with no pattern quiets its rules entirely");
    for (const pattern of patterns) {
      assert.ok(pattern.startsWith("^") && pattern.endsWith("$"), `Allowlist pattern ${pattern} is unanchored, so it would clear any secret containing it`);
      assert.ok(!pattern.includes(".*") && !pattern.includes(".+"), `Allowlist pattern ${pattern} is open-ended`);
    }
  }
  return { status: "passed", scope: "secret-scan-allowlist", allowlists: allowlists.length, externalReview: false };
}

/*
 * Findings that have been read and are being kept, with the reason written
 * down. Everything not listed here fails the build, and a listed entry whose
 * count no longer matches fails too, in both directions: one more finding of
 * that rule in that file is a new finding nobody has read, and one fewer means
 * the reason has stopped applying and the entry should go.
 *
 * A path is not a blanket. Each entry names one rule in one file and says how
 * many occurrences were read.
 *
 * The language is the matrix job that produces the finding. CodeQL runs one job
 * per language and hands each its own SARIF, so an entry is only expected to
 * occur in the analysis it belongs to.
 */
export const ACCEPTED_CODEQL_FINDINGS = Object.freeze([
  {
    ruleId: "js/incomplete-url-substring-sanitization",
    path: "scripts/check-address-lookup.mts",
    count: 3,
    language: "javascript-typescript",
    reason:
      "The three checks read the text of a source file and a Content-Security-Policy directive to answer whether either mentions the address provider's host. Nothing here parses or validates a URL, so the query's remedy, comparing a parsed host, has nothing to apply to. A partial match is the intent: a mention of the host anywhere in shipped code is the thing being forbidden.",
  },
]);

function acceptanceKey(ruleId, path) {
  return `${ruleId} @ ${path}`;
}

export function validateCodeqlResults(documents, acceptedFindings = ACCEPTED_CODEQL_FINDINGS) {
  assert.ok(documents.length > 0, "CodeQL produced no SARIF evidence");
  const counted = new Map();
  const analysed = new Set();
  for (const document of documents) {
    assert.equal(document.version, "2.1.0", "Unrecognized SARIF version");
    assert.ok(Array.isArray(document.runs) && document.runs.length > 0, "SARIF has no runs");
    for (const run of document.runs) {
      assert.ok(run.tool?.driver?.name?.includes("CodeQL"), "SARIF is not from CodeQL");
      assert.ok(Array.isArray(run.results), "SARIF results are missing");
      assert.ok((run.invocations ?? []).every((invocation) => invocation.executionSuccessful !== false), "CodeQL invocation failed");
      // The category the workflow passes to codeql-action/analyze, which is the
      // matrix language. A run that declares none is treated as covering
      // everything, so an unlabelled SARIF cannot excuse a missing entry.
      const language = /^\/language:(.+)\/$/.exec(run.automationDetails?.id ?? "")?.[1];
      analysed.add(language ?? "*");
      for (const result of run.results) {
        const path = result.locations?.[0]?.physicalLocation?.artifactLocation?.uri ?? "<unlocated>";
        const key = acceptanceKey(result.ruleId, path);
        counted.set(key, (counted.get(key) ?? 0) + 1);
      }
    }
  }

  const accepted = new Map(acceptedFindings.map((entry) => [acceptanceKey(entry.ruleId, entry.path), entry]));
  const unread = [...counted].filter(([key]) => !accepted.has(key));
  assert.equal(unread.length, 0, `CodeQL reported findings nobody has read: ${unread.map(([key, count]) => `${key} x${count}`).join("; ")}. Fix them, or record the reason for keeping them.`);
  for (const [key, entry] of accepted) {
    if (!analysed.has("*") && !analysed.has(entry.language)) continue;
    const found = counted.get(key) ?? 0;
    assert.ok(entry.reason.length > 120, `${key} is accepted without a reason worth reading`);
    assert.equal(found, entry.count, `${key} was accepted at ${entry.count} finding(s) and CodeQL now reports ${found}. ${found > entry.count ? "The extra one has not been read." : "The reason no longer applies; drop the entry."}`);
  }
  const findings = [...counted.values()].reduce((total, count) => total + count, 0);
  return { status: "passed", documents: documents.length, findings, accepted: accepted.size, analysed: [...analysed].sort(), unread: 0, externalReview: false };
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
    console.log(JSON.stringify(validateSecretScanConfig(readFileSync(new URL("../.gitleaks.toml", import.meta.url), "utf8"))));
  }
}
