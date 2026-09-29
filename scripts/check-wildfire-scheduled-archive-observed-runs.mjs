import { readFile } from "node:fs/promises";
import { ARCHIVE_FEEDS } from "./wildfire/archive-plan.mjs";

export const OBSERVED_RUNS_EVIDENCE_PATH = "data/wildfire-scheduled-archive-observed-runs-2026-09-14.json";
const OBSERVED_RUNS_PATH = new URL(`../${OBSERVED_RUNS_EVIDENCE_PATH}`, import.meta.url);
const IAM_READBACK_PATH = new URL("../data/current-wildfire-scheduled-archive-iam-applied-readback-2026-09-13.json", import.meta.url);
const WORKFLOW_PATH = ".github/workflows/wildfire-refresh.yml";
const RETENTION_DAYS_FLOOR = 729;
const DAY_MS = 86_400_000;

function fail(message) {
  throw new Error(message);
}

function instant(value, name) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) fail(`${name} must be an ISO timestamp.`);
  return Date.parse(value);
}

// Derived from the step conclusions, never taken from the record, so a run cannot be
// counted as a real refresh because someone labelled it one.
function classify(run) {
  const { gate, refresh, delayedRefresh, assumeRole, archive } = run.steps ?? {};
  if (run.conclusion === "failure") return "attemptedRefreshFailure";
  if (run.conclusion !== "success" || gate !== "success" || delayedRefresh !== "skipped") fail(`Run ${run.runId} has steps no classification rule covers.`);
  if (refresh === "skipped" && assumeRole === "skipped" && archive === "skipped") return "dstGatedNoOp";
  if (refresh === "success" && assumeRole === "success" && archive === "success") return "realRefreshSuccess";
  fail(`Run ${run.runId} has steps no classification rule covers.`);
}

function vancouverOffset(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", timeZoneName: "shortOffset" })
    .formatToParts(new Date(ms)).find(({ type }) => type === "timeZoneName").value;
}

function verifyArchived(run, roleId) {
  if (run.assumedRoleId !== `${roleId}:wildfire-refresh-${run.runId}-1`) fail(`Run ${run.runId} must record the approved role's session.`);
  const refreshedAt = instant(run.refreshedAt, `Run ${run.runId} refreshedAt`);
  if (run.retention?.mode !== "COMPLIANCE" || run.retention?.period !== "P2Y") fail(`Run ${run.runId} must archive under COMPLIANCE for P2Y.`);
  if (!Array.isArray(run.archived)) fail(`Run ${run.runId} must list what it archived.`);
  const feeds = run.archived.map(({ feed }) => feed).sort();
  if (feeds.join(",") !== [...ARCHIVE_FEEDS].sort().join(",")) fail(`Run ${run.runId} must archive exactly the four owner-approved feeds.`);
  const folder = new Date(refreshedAt).toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll(":", "-");
  for (const item of run.archived) {
    const match = /^raw\/([a-z-]+)\/undeclared\/([0-9TZ-]+)\/([a-f0-9]{64})\/payload\/[^/]+$/.exec(item.key ?? "");
    if (!match || match[1] !== item.feed || match[2] !== folder) fail(`Run ${run.runId} ${item.feed} key is not a payload of this refresh.`);
    if (match[3] !== item.sha256) fail(`Run ${run.runId} ${item.feed} key does not carry its payload SHA-256.`);
    for (const field of ["versionId", "manifestVersionId"]) if (typeof item[field] !== "string" || !item[field]) fail(`Run ${run.runId} ${item.feed} ${field} is required.`);
    for (const field of ["byteLength", "manifestByteLength"]) if (!Number.isInteger(item[field]) || item[field] <= 0) fail(`Run ${run.runId} ${item.feed} ${field} must be a positive integer.`);
    const retainUntil = instant(item.retainUntil, `Run ${run.runId} ${item.feed} retainUntil`);
    if (retainUntil - refreshedAt < RETENTION_DAYS_FLOOR * DAY_MS) fail(`Run ${run.runId} ${item.feed} is locked for less than ${RETENTION_DAYS_FLOOR} days.`);
    const { readback } = item;
    if (readback?.retentionMode !== "COMPLIANCE" || readback.retainUntil !== item.retainUntil) fail(`Run ${run.runId} ${item.feed} readback must show the COMPLIANCE lock that was written.`);
    if (readback.sha256Matches !== true) fail(`Run ${run.runId} ${item.feed} readback must match the payload SHA-256.`);
  }
  if (typeof run.status?.versionId !== "string" || !/^[a-f0-9]{64}$/.test(run.status?.sha256 ?? "")) fail(`Run ${run.runId} must record the status version it published.`);
  if (instant(run.status.lastModified, `Run ${run.runId} status lastModified`) < refreshedAt) fail(`Run ${run.runId} status cannot predate its refresh.`);
}

export async function validateWildfireScheduledArchiveObservedRuns(record, { iamReadback } = {}) {
  const iam = iamReadback ?? JSON.parse(await readFile(IAM_READBACK_PATH, "utf8"));
  if (record?.schemaVersion !== "witness-tree/wildfire-scheduled-archive-observed-runs/1") fail("Observed runs must be a witness-tree/wildfire-scheduled-archive-observed-runs/1 record.");
  if (record.repository !== "chinonsoobeta/Witness_Tree" || record.workflowPath !== WORKFLOW_PATH) fail("Observed runs must describe the wildfire refresh workflow in this repository.");
  if (!/^[a-f0-9]{40}$/.test(record.headSha ?? "")) fail("Observed runs must name the exact head commit.");
  const observedAt = instant(record.observedAt, "observedAt");
  if (!Array.isArray(record.runs) || record.runs.length === 0) fail("Observed runs must list at least one run.");

  const derived = { realRefreshSuccess: [], dstGatedNoOp: [], attemptedRefreshFailure: [] };
  const seen = new Set();
  for (const run of record.runs) {
    if (!Number.isInteger(run?.runId) || seen.has(run.runId)) fail("Each run needs a unique numeric run ID.");
    seen.add(run.runId);
    if (run.event !== "schedule" || run.headSha !== record.headSha) fail(`Run ${run.runId} must be a scheduled run on the recorded head.`);
    if (instant(run.createdAt, `Run ${run.runId} createdAt`) > observedAt) fail(`Run ${run.runId} cannot be created after the observation.`);
    const kind = classify(run);
    if (run.gateOpened !== (kind !== "dstGatedNoOp")) fail(`Run ${run.runId} gateOpened contradicts its steps.`);
    if (kind === "realRefreshSuccess") verifyArchived(run, iam.role.roleId);
    else if (run.archived !== undefined || run.status !== undefined) fail(`Run ${run.runId} did not refresh and cannot record archived objects.`);
    derived[kind].push(run.runId);
  }

  const expected = { realRefreshSuccesses: derived.realRefreshSuccess, dstGatedNoOpSuccesses: derived.dstGatedNoOp, attemptedRefreshFailures: derived.attemptedRefreshFailure };
  for (const [name, runIds] of Object.entries(expected)) {
    const entry = record.classifications?.[name];
    if (entry?.count !== runIds.length || JSON.stringify(entry.runIds) !== JSON.stringify(runIds)) fail(`${name} must equal the classification derived from each run's steps.`);
  }

  const successes = record.runs.filter((run) => derived.realRefreshSuccess.includes(run.runId));
  const statusVersions = new Set(successes.map(({ status }) => status.versionId));
  if (statusVersions.size !== successes.length || record.statusObject?.versionCount !== successes.length) fail("Each real refresh must publish its own status version.");
  if (record.statusObject.versioning !== "Enabled") fail("The status object must be read from a versioned bucket.");

  const created = record.runs.map(({ createdAt }) => Date.parse(createdAt));
  const crosses = vancouverOffset(Math.min(...created)) !== vancouverOffset(Math.max(...created));
  const claims = record.claims ?? {};
  const wrote = successes.length > 0;
  for (const name of ["tokenClaimsObservedInRealRun", "scheduledWriteExecuted", "retentionApplied", "archiveReadBackIndependently", "statusPublished"]) {
    if (claims[name] !== wrote) fail(`${name} must be ${wrote} for the runs this record lists.`);
  }
  if (claims.crossesDaylightSavingTransition !== crosses) fail("crossesDaylightSavingTransition must match the run window.");
  for (const name of ["transformed", "ingested", "released", "productionEligible"]) {
    if (claims[name] !== false) fail(`Observed scheduled runs cannot claim ${name}.`);
  }
  if (!Array.isArray(record.limitations) || record.limitations.length === 0) fail("Observed runs must state their limitations.");
  return record;
}

export async function checkWildfireScheduledArchiveObservedRuns(file = OBSERVED_RUNS_PATH) {
  return validateWildfireScheduledArchiveObservedRuns(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = await checkWildfireScheduledArchiveObservedRuns();
  const { realRefreshSuccesses, dstGatedNoOpSuccesses, attemptedRefreshFailures } = record.classifications;
  console.log(`Observed scheduled wildfire runs: ${realRefreshSuccesses.count} real refreshes, ${dstGatedNoOpSuccesses.count} gated no-ops, ${attemptedRefreshFailures.count} failures; production remains false.`);
}
