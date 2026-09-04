import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const INCIDENT_MARKER = "<!-- witness-tree-synthetic-uptime-incident -->";
const TITLE = "Synthetic uptime: public routes unavailable";
const FAILURE_CONCLUSIONS = new Set(["failure", "timed_out", "startup_failure"]);

function trustedRun(run, repository) {
  return run?.head_repository?.full_name === repository && run.head_branch === "main" &&
    ["schedule", "workflow_dispatch"].includes(run.event) && run.status === "completed";
}

function observation(receipt, routes, run) {
  // Missing or invalid evidence can never close an incident. Do not copy raw
  // response bodies or exception text into a public issue.
  if (!receipt || receipt.schemaVersion !== "witness-tree/synthetic-uptime-run/1" ||
      receipt.origin !== "https://www.witnesstree.ca" ||
      !Number.isFinite(Date.parse(receipt.startedAt)) || !Number.isFinite(Date.parse(receipt.completedAt)) ||
      Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt) ||
      Date.parse(receipt.startedAt) < Date.parse(run.run_started_at) ||
      Date.parse(receipt.completedAt) > Date.parse(run.updated_at) ||
      !Array.isArray(receipt.observedRoutes) || receipt.observedRoutes.length !== routes.length) {
    return { healthy: false, lines: ["Probe receipt unavailable or invalid; route status is unknown."] };
  }
  const lines = [];
  for (const route of routes) {
    const matches = receipt.observedRoutes.filter((entry) => entry.path === route.path);
    if (matches.length !== 1) return { healthy: false, lines: ["Probe receipt has incomplete route coverage; route status is unknown."] };
    const observed = matches[0];
    if (observed.status !== route.expectedStatus || observed.contentMarkerFound !== true || observed.error !== null) {
      const status = Number.isInteger(observed.status) && observed.status >= 100 && observed.status <= 599 ? observed.status : "unknown";
      lines.push(`- ${route.path}: HTTP ${status}; expected ${route.expectedStatus}; content marker ${observed.contentMarkerFound === true ? "found" : "not verified"}.`);
    }
  }
  return { healthy: receipt.result === "pass" && lines.length === 0, lines };
}

export async function updateUptimeIssue({ repository, run, receipt, routes, request }) {
  assert.match(repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
  assert.ok(trustedRun(run, repository), "Only a completed, trusted main-branch probe can update an issue");
  assert.ok(Number.isSafeInteger(run.id) && Number.isSafeInteger(run.workflow_id));
  const prefix = `/repos/${repository}`;
  const history = await request("GET", `${prefix}/actions/workflows/${run.workflow_id}/runs?branch=main&status=completed&per_page=100`);
  const runs = history.workflow_runs.filter((entry) => trustedRun(entry, repository))
    .sort((a, b) => b.run_number - a.run_number);
  assert.ok(runs.length > 0, "No trusted probe history is available");
  // A late completion event must not reopen or close an incident after a newer run.
  if (runs[0].id !== run.id || runs[0].run_attempt !== run.run_attempt) return { action: "obsolete" };
  const observed = observation(receipt, routes, run);
  const recovery = run.conclusion === "success" && observed.healthy;
  const failures = runs.findIndex((entry) => !FAILURE_CONCLUSIONS.has(entry.conclusion));
  const consecutiveFailures = failures === -1 ? runs.length : failures;

  const incidents = [];
  for (let page = 1; ; page += 1) {
    const issues = await request("GET", `${prefix}/issues?state=all&creator=github-actions%5Bbot%5D&per_page=100&page=${page}`);
    incidents.push(...issues.filter((issue) => !issue.pull_request && issue.user?.login === "github-actions[bot]" && issue.body?.startsWith(INCIDENT_MARKER)));
    if (issues.length < 100) break;
  }
  assert.ok(incidents.length <= 1, "Multiple incident issues exist; refusing to pick one silently");
  const incident = incidents[0];
  if (!recovery && consecutiveFailures < 2) return { action: "waiting", consecutiveFailures };
  if (recovery && (!incident || incident.state === "closed")) return { action: "healthy" };

  const runMarker = `<!-- run:${run.id}:${run.run_attempt} -->`;
  if (incident?.body?.includes(runMarker)) return { action: "unchanged" };
  const state = recovery ? "closed" : "open";
  const body = [
    INCIDENT_MARKER, runMarker, "",
    recovery ? "All configured public routes recovered." : `Consecutive failed probe runs: ${consecutiveFailures}.`,
    `Observed at: ${run.updated_at}.`, "",
    ...(recovery ? ["Every configured route returned its expected status and content marker."] : observed.lines.length ? observed.lines : ["The probe workflow failed; route availability is not confirmed."]),
    "", `[Probe run](https://github.com/${repository}/actions/runs/${run.id})`, "",
    "This is an external availability signal. It does not establish host-tier monitoring or Phase 8 readiness.",
  ].join("\n");
  if (incident) await request("PATCH", `${prefix}/issues/${incident.number}`, { title: TITLE, state, body });
  else await request("POST", `${prefix}/issues`, { title: TITLE, body });
  return { action: incident ? state === "closed" ? "closed" : "updated" : "opened", consecutiveFailures };
}

async function main() {
  assert.equal(process.argv[2], "--receipt");
  assert.equal(process.argv.length, 4);
  assert.ok(process.env.GH_TOKEN, "GH_TOKEN is required");
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  let receipt = null;
  try { receipt = JSON.parse(readFileSync(process.argv[3], "utf8")); } catch { /* Unknown is not recovered. */ }
  const routes = JSON.parse(readFileSync(new URL("../data/observability-deployment.json", import.meta.url), "utf8")).syntheticUptime.routes;
  const result = await updateUptimeIssue({
    repository: process.env.GITHUB_REPOSITORY, run: event.workflow_run, receipt, routes,
    request: async (method, endpoint, body) => {
      const response = await fetch(`https://api.github.com${endpoint}`, {
        method, redirect: "error", signal: AbortSignal.timeout(30_000),
        headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: "application/vnd.github+json", "content-type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new Error(`GitHub ${method} failed with HTTP ${response.status}`);
      return response.json();
    },
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(`FAIL uptime alert: ${error.message}`);
  process.exitCode = 1;
});
