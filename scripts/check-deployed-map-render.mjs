#!/usr/bin/env node
/**
 * Fails when nothing current says the map client renders where it is served.
 *
 * scripts/verify-deployed-map-render.mjs drives a real browser against a
 * deployment and writes what it saw. That run needs the network and a live
 * origin, so it cannot be a CI step. This is the half CI can run: it reads the
 * committed records only.
 *
 * Staleness is the point. A record binds lib/explore/map-style.ts and
 * components/explore/ExploreMapClient.tsx by SHA-256. Change the archive URL or
 * the client and the observation no longer describes the page that was
 * measured, so this fails and names the file that moved. Clearing it means
 * re-running the harness, never editing the record: a record written by hand
 * asserts a measurement that did not happen.
 *
 * Three things can satisfy the gate, and they are not equivalent:
 *
 *   1. A current observation of the deployed Site. This is the only one that
 *      says the Site itself renders, and it is the only one that leaves no debt.
 *   2. A current observation of a preview or branch deployment. The client is
 *      proved to render where it was served from, but the Site has not been
 *      measured, so the Site observation stays owed.
 *   3. A break-glass record. Nothing was measured at all. It names a reason, who
 *      authorized it, the exact digests it covers and the date the debt must be
 *      settled by, and it expires. It records the debt; it does not hide it.
 *
 * Tiers 2 and 3 exist because the gate was otherwise circular: a map fix could
 * not merge without being deployed and could not be deployed without merging.
 * PR #134 broke that circle by hand, once, with no artifact. This makes the same
 * move leave a record behind.
 *
 * Read-only. It admits, releases and deploys nothing.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const RENDER_EVIDENCE_PATH = "data/deployed-map-render-evidence-2026-09-03.json";
export const RENDER_EVIDENCE_SCHEMA = "witness-tree/deployed-map-render-evidence/1";
export const BRANCH_EVIDENCE_PATH = "data/deployed-map-render-branch-observation.json";
export const BREAK_GLASS_PATH = "data/deployed-map-render-break-glass.json";
export const BREAK_GLASS_SCHEMA = "witness-tree/deployed-map-render-break-glass/1";
export const DEPLOYED_ORIGIN = "https://www.witnesstree.ca";

/** How long a break-glass record may stand before the Site observation is overdue. */
export const BREAK_GLASS_MAX_DAYS = 14;

/** The origin of a recorded url, or null when the record holds something that is not a url. */
export function safeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/** Whether a url names a live remote deployment rather than a machine-local server. */
export function isRemoteDeployment(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  return !LOCAL_HOSTS.has(host) && !host.endsWith(".localhost");
}

const REQUIRED_CHECKS = Object.freeze([
  "pmtiles-range-responses",
  "no-geojson-fallback",
  "ready-from-pmtiles",
  "status-copy-is-not-a-fallback",
  "canvas-painted-loss-ramp",
]);

/** The current SHA-256 of a repository-relative file, or null when it cannot be read. */
function digestOf(root, relative) {
  try {
    return createHash("sha256").update(readFileSync(path.join(root, relative))).digest("hex");
  } catch {
    return null;
  }
}

/** Reads a committed record, distinguishing "absent" from "unreadable". */
function readRecord(root, relative) {
  let raw;
  try {
    raw = readFileSync(path.join(root, relative), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { present: false };
    return { present: true, error: error.message };
  }
  try {
    return { present: true, record: JSON.parse(raw) };
  } catch (error) {
    return { present: true, error: error.message };
  }
}

// `record` is injectable so the tests can exercise every rejection path without
// overwriting the real record, which describes a run that actually happened.
export function validateDeployedMapRender({ record: supplied, root = REPO_ROOT } = {}) {
  const failures = [];
  const add = (message) => failures.push(message);

  let record = supplied;
  if (record === undefined) {
    try {
      record = JSON.parse(readFileSync(path.join(root, RENDER_EVIDENCE_PATH), "utf8"));
    } catch (error) {
      return [`${RENDER_EVIDENCE_PATH} is missing or unreadable: ${error.message}. Run \`npm run verify:deployed-map-render\` against the deployed Site.`];
    }
  }

  if (record.schemaVersion !== RENDER_EVIDENCE_SCHEMA) add(`record schemaVersion is ${record.schemaVersion}, expected ${RENDER_EVIDENCE_SCHEMA}.`);
  if (record.status !== "deployed-site-browser-observation") add(`record status is ${record.status}, expected deployed-site-browser-observation.`);
  // A harness run against a preview writes scope and siteObservationOwed itself.
  // Filing one of those here would let a preview answer the Site-scoped claim.
  if (record.scope !== undefined && record.scope !== "deployed-site") add(`record scope is ${record.scope}; ${RENDER_EVIDENCE_PATH} holds observations of the deployed Site only.`);
  if (record.siteObservationOwed === true) add("record says the Site observation is still owed, so it is not one.");
  for (const claim of ["published", "productionEligible", "admissionClaim", "productionAdmission"]) {
    if (record[claim] !== false) add(`record claims ${claim} is not false; a browser observation admits and publishes nothing.`);
  }

  // The criterion is scoped to the deployed Site. A run against localhost or a
  // preview origin proves the code works, not that the Site does.
  // startsWith would accept a host that merely begins with the origin, so the
  // record's url is parsed and its origin compared outright.
  if (typeof record.url !== "string" || safeOrigin(record.url) !== DEPLOYED_ORIGIN) {
    add(`record url is ${record.url}, which is not on the deployed origin ${DEPLOYED_ORIGIN}. This criterion is scoped to the deployed Site.`);
  }

  failures.push(...validateObservationBody(record, root));
  return failures;
}

/**
 * The part of an observation that means the same thing whatever origin was
 * measured: the checks all ran, all passed, the archive answered range requests,
 * the fallback was never touched, and the bound sources still match the tree.
 */
function validateObservationBody(record, root) {
  const failures = [];
  const add = (message) => failures.push(message);

  if (!Array.isArray(record.checks)) return [...failures, "record has no checks array."];
  const byId = new Map(record.checks.map((entry) => [entry.id, entry]));
  for (const id of REQUIRED_CHECKS) {
    const entry = byId.get(id);
    if (!entry) {
      add(`record does not report the ${id} check.`);
      continue;
    }
    if (entry.pass !== true) add(`${id} did not pass: ${entry.observed}. A failing observation is a real failure, not a stale record.`);
  }
  for (const id of [...byId.keys()].filter((name) => !REQUIRED_CHECKS.includes(name))) {
    add(`record reports an unknown check ${id}; the required set changed without this checker being updated.`);
  }
  if (record.allChecksPassed !== true) add("record does not assert allChecksPassed.");

  // A 206 is the whole point: it proves range requests reached the archive
  // rather than a whole-object download or a cached fallback.
  if (!(record.requestCounts?.pmtilesRange > 0)) add("record shows no HTTP 206 range responses from the PMTiles archive.");
  if (record.requestCounts?.geojsonFallback !== 0) add(`record shows ${record.requestCounts?.geojsonFallback} GeoJSON fallback fetches; the deployed page must not fall back.`);

  if (!Array.isArray(record.sources) || record.sources.length === 0) {
    add("record binds no source files, so staleness cannot be detected.");
    return failures;
  }
  for (const { path: relative, sha256 } of record.sources) {
    const current = digestOf(root, relative);
    if (current === null) {
      add(`record binds ${relative}, which cannot be read.`);
      continue;
    }
    if (current !== sha256) {
      add(`${relative} changed since the deployed Site was observed at ${record.observedAt}. Re-run the harness against the deployed Site.`);
    }
  }

  return failures;
}

/**
 * A preview or branch deployment observation. It carries the same measurement as
 * a Site observation and is held to the same checks, but it must say which
 * origin it measured, that origin must be a real remote deployment rather than a
 * developer's laptop, and it must not claim to be the Site.
 */
export function validateBranchObservation({ record: supplied, root = REPO_ROOT } = {}) {
  const failures = [];
  const add = (message) => failures.push(message);

  let record = supplied;
  if (record === undefined) {
    const read = readRecord(root, BRANCH_EVIDENCE_PATH);
    if (!read.present) return [`${BRANCH_EVIDENCE_PATH} is absent.`];
    if (read.error) return [`${BRANCH_EVIDENCE_PATH} is unreadable: ${read.error}`];
    record = read.record;
  }

  if (record.schemaVersion !== RENDER_EVIDENCE_SCHEMA) add(`branch record schemaVersion is ${record.schemaVersion}, expected ${RENDER_EVIDENCE_SCHEMA}.`);
  if (record.status !== "branch-deployment-browser-observation") add(`branch record status is ${record.status}, expected branch-deployment-browser-observation.`);
  if (record.scope !== "branch-deployment") add(`branch record scope is ${record.scope}, expected branch-deployment.`);
  if (record.siteObservationOwed !== true) add("branch record must state siteObservationOwed: true; measuring a preview does not measure the Site.");
  for (const claim of ["published", "productionEligible", "admissionClaim", "productionAdmission"]) {
    if (record[claim] !== false) add(`branch record claims ${claim} is not false; a browser observation admits and publishes nothing.`);
  }

  const origin = typeof record.url === "string" ? safeOrigin(record.url) : null;
  if (origin === DEPLOYED_ORIGIN) {
    add(`branch record url is on the deployed origin ${DEPLOYED_ORIGIN}. An observation of the Site belongs in ${RENDER_EVIDENCE_PATH}, where it clears the gate outright.`);
  } else if (!isRemoteDeployment(record.url)) {
    add(`branch record url is ${record.url}, which is not an https origin outside this machine. A localhost run proves the code works, not that any deployment does.`);
  }

  // A preview observation is only worth reading if it says which revision was
  // deployed to the origin it measured.
  if (typeof record.revision !== "string" || !/^[0-9a-f]{40}$/.test(record.revision)) {
    add(`branch record revision is ${record.revision}, expected the 40-character commit the preview was built from.`);
  }

  failures.push(...validateObservationBody(record, root));
  return failures;
}

/** Whole days from `from` to `to`, positive when `to` is later. */
function daysBetween(from, to) {
  return (to.getTime() - from.getTime()) / 86_400_000;
}

/**
 * A break-glass record. Nothing was measured, so every constraint here is about
 * keeping the debt narrow, attributable and short-lived: it covers exactly the
 * digests it names, it says who accepted it and why, and it stops working on a
 * date chosen when it was opened.
 */
export function validateBreakGlass({ record: supplied, root = REPO_ROOT, now = new Date() } = {}) {
  const failures = [];
  const add = (message) => failures.push(message);

  let record = supplied;
  if (record === undefined) {
    const read = readRecord(root, BREAK_GLASS_PATH);
    if (!read.present) return [`${BREAK_GLASS_PATH} is absent.`];
    if (read.error) return [`${BREAK_GLASS_PATH} is unreadable: ${read.error}`];
    record = read.record;
  }

  if (record.schemaVersion !== BREAK_GLASS_SCHEMA) add(`break-glass schemaVersion is ${record.schemaVersion}, expected ${BREAK_GLASS_SCHEMA}.`);
  if (record.status !== "gate-debt-not-an-observation") add(`break-glass status is ${record.status}, expected gate-debt-not-an-observation. This record must never read as a measurement.`);
  if (record.siteObservationOwed !== true) add("break-glass record must state siteObservationOwed: true.");
  for (const claim of ["published", "productionEligible", "admissionClaim", "productionAdmission", "allChecksPassed"]) {
    if (record[claim] !== false) add(`break-glass record claims ${claim} is not false; nothing was observed.`);
  }
  if (record.checks !== undefined) add("break-glass record reports checks; nothing was run, so there is nothing to report.");

  // Free text, but it has to be an argument someone can disagree with.
  if (typeof record.reason !== "string" || record.reason.trim().length < 120) {
    add("break-glass reason must be a written explanation of why no deployment could be measured, not a label.");
  }
  if (typeof record.authorizedBy !== "string" || record.authorizedBy.trim().length === 0) {
    add("break-glass record must name who accepted the debt.");
  }

  const authorizedAt = new Date(record.authorizedAt ?? "");
  const settleBy = new Date(record.settleBy ?? "");
  if (Number.isNaN(authorizedAt.getTime())) {
    add(`break-glass authorizedAt is ${record.authorizedAt}, which is not a date.`);
  }
  if (Number.isNaN(settleBy.getTime())) {
    add(`break-glass settleBy is ${record.settleBy}, which is not a date.`);
  }
  if (!Number.isNaN(authorizedAt.getTime()) && !Number.isNaN(settleBy.getTime())) {
    const window = daysBetween(authorizedAt, settleBy);
    if (window <= 0) add("break-glass settleBy is not after authorizedAt.");
    if (window > BREAK_GLASS_MAX_DAYS) {
      add(`break-glass settleBy is ${window.toFixed(1)} days after it was opened; the limit is ${BREAK_GLASS_MAX_DAYS}. A longer debt is a decision to stop measuring.`);
    }
  }
  if (!Number.isNaN(settleBy.getTime()) && settleBy.getTime() <= now.getTime()) {
    add(`break-glass expired at ${record.settleBy}. Re-run the harness against the deployed Site, or open a new record with a current reason.`);
  }

  // The record covers one change. Binding the digests stops it being left in
  // place to wave through every later edit to the same files.
  if (!Array.isArray(record.sources) || record.sources.length === 0) {
    add("break-glass record binds no source files, so it would cover every later change too.");
    return failures;
  }
  for (const { path: relative, sha256 } of record.sources) {
    const current = digestOf(root, relative);
    if (current === null) {
      add(`break-glass record binds ${relative}, which cannot be read.`);
      continue;
    }
    if (current !== sha256) {
      add(`${relative} changed since the break-glass record was written. It covers the change it names and no other; open a new record or measure a deployment.`);
    }
  }

  return failures;
}

/**
 * Resolves the gate across all three tiers and reports which one answered.
 * Returns `{ satisfiedBy, failures, notes }`; `failures` is empty exactly when
 * the gate passes.
 */
export function resolveDeployedMapRender({ root = REPO_ROOT, now = new Date() } = {}) {
  const notes = [];
  const siteFailures = validateDeployedMapRender({ root });
  const breakGlassPresent = readRecord(root, BREAK_GLASS_PATH).present;

  if (siteFailures.length === 0) {
    // A settled debt must not be left lying around: the next stale record would
    // find a break-glass already sitting there and quietly reuse it.
    if (breakGlassPresent) {
      return {
        satisfiedBy: null,
        notes,
        failures: [`The deployed Site observation is current, so ${BREAK_GLASS_PATH} is a debt that has already been settled. Delete it.`],
      };
    }
    return { satisfiedBy: "deployed-site", notes, failures: [] };
  }

  const branchPresent = readRecord(root, BRANCH_EVIDENCE_PATH).present;
  if (branchPresent) {
    const branchFailures = validateBranchObservation({ root });
    if (branchFailures.length === 0) {
      notes.push(`The deployed Site observation is stale, so the gate was answered by a preview deployment instead. The Site observation is still owed: ${siteFailures.join(" ")}`);
      if (breakGlassPresent) {
        return {
          satisfiedBy: null,
          notes,
          failures: [`A preview deployment was measured, so ${BREAK_GLASS_PATH} is not needed. Delete it rather than keeping an unused break-glass on the branch.`],
        };
      }
      return { satisfiedBy: "branch-deployment", notes, failures: [] };
    }
    return {
      satisfiedBy: null,
      notes,
      failures: [`The deployed Site observation is stale and ${BRANCH_EVIDENCE_PATH} does not stand in its place:`, ...branchFailures.map((message) => `  ${message}`)],
    };
  }

  if (breakGlassPresent) {
    const breakGlassFailures = validateBreakGlass({ root, now });
    if (breakGlassFailures.length === 0) {
      const record = readRecord(root, BREAK_GLASS_PATH).record;
      notes.push(`Nothing was measured. ${BREAK_GLASS_PATH} accepts the debt until ${record.settleBy}, authorized by ${record.authorizedBy}.`);
      notes.push(`Still owed: ${siteFailures.join(" ")}`);
      return { satisfiedBy: "break-glass", notes, failures: [] };
    }
    return {
      satisfiedBy: null,
      notes,
      failures: [`The deployed Site observation is stale and ${BREAK_GLASS_PATH} does not stand in its place:`, ...breakGlassFailures.map((message) => `  ${message}`)],
    };
  }

  return { satisfiedBy: null, notes, failures: siteFailures };
}

function main() {
  const { satisfiedBy, failures, notes } = resolveDeployedMapRender();
  if (failures.length > 0) {
    console.error("Deployed-Site map render evidence is not current:");
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(
      `  Clear it by re-running \`npm run verify:deployed-map-render\` against the deployed Site, or against a preview deployment written to ${BRANCH_EVIDENCE_PATH}. If neither origin exists yet, ${BREAK_GLASS_PATH} records the debt instead of hiding it.`,
    );
    process.exit(1);
  }

  if (satisfiedBy === "deployed-site") {
    const record = JSON.parse(readFileSync(path.join(REPO_ROOT, RENDER_EVIDENCE_PATH), "utf8"));
    console.log(
      `Deployed Site observed at ${record.observedAt}: ${record.requestCounts.pmtilesRange} PMTiles range responses, ` +
        `${record.requestCounts.geojsonFallback} fallback fetches, ${record.canvas.rampPixels} loss-ramp pixels. All ${REQUIRED_CHECKS.length} checks passed.`,
    );
    return;
  }

  if (satisfiedBy === "branch-deployment") {
    const record = JSON.parse(readFileSync(path.join(REPO_ROOT, BRANCH_EVIDENCE_PATH), "utf8"));
    console.log(`Preview deployment ${record.url} observed at ${record.observedAt} from ${record.revision.slice(0, 12)}. All ${REQUIRED_CHECKS.length} checks passed.`);
  }
  for (const note of notes) console.log(note);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
