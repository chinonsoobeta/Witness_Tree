import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Repository-only checker for `data/observability-deployment.json`, the Phase 8 `observability`
 * evidence record described in docs/PHASE8_IMPLEMENTATION_PLAN.md section 4 and specified field by
 * field in docs/OBSERVABILITY_EVIDENCE_SCHEMA.md. It reads nothing outside this repository, makes no
 * AWS call, and writes nothing. It fails closed: if the evidence file is absent the check exits
 * non-zero rather than passing silently, because an absent record is exactly the state the gate says
 * is unacceptable. A `partial` record is deliberately a different shape: it binds repository
 * definitions and the read-only synthetic workflow, omits every owner-run AWS evidence field and
 * `syntheticUptime.lastRun`, and keeps every completion claim false. The complete shape below is
 * accepted only with `archive-and-delivery-observed` status.
 *
 * Record shape:
 *
 * {
 *   "schemaVersion": "witness-tree/observability-deployment/1",
 *   "capturedAt": "2026-08-28T00:00:00Z",           // UTC instant, seconds precision
 *   "status": "archive-and-delivery-observed",       // or "partial"
 *   "siteTier": {
 *     "host": "<host product name>",
 *     "externallyHosted": true,
 *     "hostSideMonitoringAvailable": false,          // true is rejected while externally hosted
 *     "monitored": false                             // true is rejected while externally hosted
 *   },
 *   "archive": {
 *     "bucket": "<bucket name>",
 *     "serverAccessLogging": { "enabled": true, "destinationId": "<id>", "reference": "<non-secret>" },
 *     "cloudTrailDataEvents": {
 *       "enabled": true,
 *       "destinationId": "<id>",
 *       "eventSelectorScope": "<what the data-event selector covers>",
 *       "reference": "<non-secret>"
 *     }
 *   },
 *   "delivery": {
 *     "distributionReference": "<non-secret>",
 *     "standardLogging": { "enabled": true, "destinationId": "<id>", "reference": "<non-secret>" }
 *   },
 *   "logDestinations": [
 *     {
 *       "id": "<id>",
 *       "kind": "s3-server-access-log" | "cloudtrail-data-events" | "cloudfront-standard-logs" | "cloudwatch-logs",
 *       "tier": "archive" | "delivery" | "synthetic",   // "site" is rejected
 *       "region": "ca-central-1" | "ca-west-1",         // any other region is rejected
 *       "retentionDays": <positive integer>,            // 0, null, and strings are rejected
 *       "retentionSource": "<how retention is enforced>",
 *       "reference": "<non-secret>",
 *       "reviewerRole": "<role>"
 *     }
 *   ],
 *   "alarms": [
 *     {
 *       "id": "<id>",
 *       "tier": "archive" | "delivery" | "synthetic",   // "site" is rejected
 *       "metric": "<metric name>",
 *       "comparison": "greater-than" | "greater-than-or-equal" | "less-than" | "less-than-or-equal",
 *       "threshold": <finite number>,                   // null, "Unknown", and non-numbers are rejected
 *       "thresholdUnit": "<unit>",
 *       "evaluationPeriods": <positive integer>,
 *       "recipientRole": "<role that receives the alarm>",
 *       "enabled": true,
 *       "reference": "<non-secret>"
 *     }
 *   ],
 *   "dashboard": {
 *     "reference": "<non-secret>",
 *     "region": "ca-central-1" | "ca-west-1",
 *     "panels": [{ "metric": "request-rate" | "cache-hit-ratio" | "error-rate" | ..., "reference": "<non-secret>" }]
 *   },
 *   "syntheticUptime": {
 *     "workflowPath": ".github/workflows/<file>.yml",   // must exist in this repository
 *     "schedule": "<cron expression>",
 *     "writePermissions": false,                        // true is rejected
 *     "substituteForHostSideMonitoring": false,          // true is rejected
 *     "routes": [{ "path": "/<route>", "expectedStatus": <integer 100..599>, "contentMarker": "<marker>" }],
 *     "lastRun": {
 *       "startedAt": "<UTC instant>",
 *       "result": "pass" | "fail",
 *       "observedRoutes": [{ "path": "/<route>", "status": <integer>, "contentMarkerFound": true }]
 *     }
 *   },
 *   "operationalReviews": [
 *     { "reviewedAt": "<UTC instant>", "reviewerRole": "<role>", "scope": "<text>", "findings": "<text>", "reference": "<non-secret>" }
 *   ],
 *   "unobserved": [
 *     {
 *       "tier": "site",                                  // at least one entry must be the site tier
 *       "component": "<what is not observed>",
 *       "monitored": false,                              // true is rejected
 *       "reason": "<why no signal is available>",
 *       "metrics": [{ "name": "<metric>", "value": "unknown" | null }]  // 0 is rejected
 *     }
 *   ],
 *   "claims": { "hostTierMonitored": false, "observabilityComplete": false }
 * }
 */

const SCHEMA_VERSION = "witness-tree/observability-deployment/1";
const RECORD_URL = new URL("../data/observability-deployment.json", import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
/** Only Canadian regions may hold a log destination or the dashboard. */
const CANADIAN_REGIONS = new Set(["ca-central-1", "ca-west-1"]);
const STATUSES = new Set(["partial", "archive-and-delivery-observed"]);
const OBSERVED_TIERS = new Set(["archive", "delivery", "synthetic"]);
const DESTINATION_KINDS = new Set([
  "s3-server-access-log",
  "cloudtrail-data-events",
  "cloudfront-standard-logs",
  "cloudwatch-logs",
]);
const COMPARISONS = new Set([
  "greater-than",
  "greater-than-or-equal",
  "less-than",
  "less-than-or-equal",
]);
const REQUIRED_DASHBOARD_METRICS = ["request-rate", "cache-hit-ratio", "error-rate"];
const REQUIRED_ALARM_METRIC_PATTERNS = [
  { name: "a 5xx rate alarm", pattern: /5xx/i },
  { name: "an origin error rate alarm", pattern: /origin/i },
];
const REQUIRED_SYNTHETIC_ROUTES = [
  "/en",
  "/fr",
  "/en/explore",
  "/fr/explorer",
  "/en/compare",
  "/fr/comparer",
];
const REQUIRED_PENDING_EVIDENCE = [
  "ca-central-1-log-destinations-with-retention",
  "ca-west-1-log-destinations-with-retention",
  "s3-server-access-logging",
  "cloudtrail-data-events",
  "delivery-standard-logging",
  "delivery-metric-publication",
  "alarm-and-dashboard-deployment",
  "synthetic-last-run",
  "operational-review",
];
const PARTIAL_FORBIDDEN_FIELDS = [
  "logDestinations",
  "archive",
  "delivery",
  "alarms",
  "dashboard",
  "operationalReviews",
];
/**
 * "Unknown" must stay unknown. A metric that no signal reports is recorded as null or the string
 * "unknown"; recording it as a number, and above all as 0, would turn an absent measurement into a
 * clean reading and is rejected everywhere it can appear.
 */
const UNKNOWN_TEXT = new Set(["unknown", "not available", "no signal"]);
/** Non-secret means non-secret. Account IDs, ARNs, and signed URLs must not reach Git. */
const SECRET_PATTERNS = [
  { name: "an AWS account ID", pattern: /(?<!\d)\d{12}(?!\d)/ },
  { name: "an ARN", pattern: /\barn:aws[a-z-]*:/i },
  { name: "a signed URL", pattern: /X-Amz-(?:Signature|Credential|Security-Token)/i },
  { name: "an access key ID", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
];

function requiredText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
}

function requiredNonSecretText(value, name) {
  requiredText(value, name);
  for (const secret of SECRET_PATTERNS) {
    if (secret.pattern.test(value)) throw new Error(`${name} looks like ${secret.name}; references in Git must be non-secret.`);
  }
}

function requiredUtcInstant(value, name) {
  if (typeof value !== "string" || !UTC.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${name} must be a UTC instant such as 2026-08-28T00:00:00Z.`);
  if (new Date(value).toISOString() !== value.replace("Z", ".000Z")) throw new Error(`${name} must be a real UTC instant.`);
}

function requiredPositiveInteger(value, name) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer; an unknown value must not be recorded as 0 or as text.`);
}

function requiredBoolean(value, name) {
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean.`);
}

function requiredArray(value, name) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${name} must be a non-empty array.`);
}

function requiredObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} is required.`);
}

function requiredCanadianRegion(value, name) {
  requiredText(value, name);
  if (!CANADIAN_REGIONS.has(value)) throw new Error(`${name} must be a Canadian region; ${value} is not one of ${[...CANADIAN_REGIONS].join(", ")}.`);
}

function repositoryFile(relativePath, name, repoRoot) {
  requiredText(relativePath, name);
  const resolved = path.resolve(repoRoot, relativePath);
  const relative = path.relative(repoRoot, resolved);
  if (path.isAbsolute(relativePath) || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${name} must be a repository-relative path.`);
  }
  if (!existsSync(resolved)) throw new Error(`${name} names ${relativePath}, which does not exist in this repository.`);
  return resolved;
}

function readRepositoryJson(relativePath, name, repoRoot) {
  const file = repositoryFile(relativePath, name, repoRoot);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${name} must name valid JSON: ${error.message}`);
  }
}

/** A threshold is a measurement. Absent, textual, and non-finite thresholds are all unusable. */
function requiredThreshold(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be a finite number; an unstated threshold must not be recorded as 0 or as text.`);
}

/** An unobserved metric carries no number at all, so 0 is a claim rather than a reading. */
function requiredUnknownValue(value, name) {
  if (value === null) return;
  if (typeof value === "string" && UNKNOWN_TEXT.has(value.trim().toLowerCase())) return;
  if (typeof value === "number") throw new Error(`${name} records a number for a metric that is not observed; an unknown value must stay null or "unknown" and must never be coerced to ${value}.`);
  throw new Error(`${name} must be null or one of ${[...UNKNOWN_TEXT].join(", ")}.`);
}

function assertObservedTier(tier, name) {
  requiredText(tier, name);
  if (tier === "site") throw new Error(`${name} claims the externally hosted site tier is monitored; the site tier belongs in unobserved.`);
  if (!OBSERVED_TIERS.has(tier)) throw new Error(`${name} must be one of ${[...OBSERVED_TIERS].join(", ")}.`);
}

function assertLogDestinations(record) {
  requiredArray(record.logDestinations, "logDestinations");
  const byId = new Map();
  for (const destination of record.logDestinations) {
    requiredObject(destination, "Each log destination");
    requiredText(destination.id, "Log destination id");
    if (byId.has(destination.id)) throw new Error(`Log destination ids must be unique; ${destination.id} appears twice.`);
    if (!DESTINATION_KINDS.has(destination.kind)) throw new Error(`Log destination ${destination.id} has an unrecognized kind.`);
    assertObservedTier(destination.tier, `Log destination ${destination.id} tier`);
    requiredCanadianRegion(destination.region, `Log destination ${destination.id} region`);
    requiredPositiveInteger(destination.retentionDays, `Log destination ${destination.id} retentionDays`);
    requiredText(destination.retentionSource, `Log destination ${destination.id} retentionSource`);
    requiredNonSecretText(destination.reference, `Log destination ${destination.id} reference`);
    requiredText(destination.reviewerRole, `Log destination ${destination.id} reviewerRole`);
    byId.set(destination.id, destination);
  }
  return byId;
}

function assertBinding(section, name, destinations, expectedKind) {
  requiredObject(section, name);
  if (section.enabled !== true) throw new Error(`${name} must be recorded as enabled.`);
  requiredText(section.destinationId, `${name} destinationId`);
  const destination = destinations.get(section.destinationId);
  if (!destination) throw new Error(`${name} names log destination ${section.destinationId}, which is not recorded in logDestinations.`);
  if (destination.kind !== expectedKind) throw new Error(`${name} must land in a ${expectedKind} destination; ${section.destinationId} is ${destination.kind}.`);
  requiredNonSecretText(section.reference, `${name} reference`);
  return destination;
}

function assertAlarms(record) {
  requiredArray(record.alarms, "alarms");
  const ids = new Set();
  for (const alarm of record.alarms) {
    requiredObject(alarm, "Each alarm");
    requiredText(alarm.id, "Alarm id");
    if (ids.has(alarm.id)) throw new Error(`Alarm ids must be unique; ${alarm.id} appears twice.`);
    ids.add(alarm.id);
    assertObservedTier(alarm.tier, `Alarm ${alarm.id} tier`);
    requiredText(alarm.metric, `Alarm ${alarm.id} metric`);
    if (!COMPARISONS.has(alarm.comparison)) throw new Error(`Alarm ${alarm.id} comparison must be one of ${[...COMPARISONS].join(", ")}.`);
    requiredThreshold(alarm.threshold, `Alarm ${alarm.id} threshold`);
    requiredText(alarm.thresholdUnit, `Alarm ${alarm.id} thresholdUnit`);
    requiredPositiveInteger(alarm.evaluationPeriods, `Alarm ${alarm.id} evaluationPeriods`);
    requiredText(alarm.recipientRole, `Alarm ${alarm.id} recipientRole`);
    if (alarm.enabled !== true) throw new Error(`Alarm ${alarm.id} must be recorded as enabled.`);
    requiredNonSecretText(alarm.reference, `Alarm ${alarm.id} reference`);
  }
  for (const required of REQUIRED_ALARM_METRIC_PATTERNS) {
    if (!record.alarms.some((alarm) => required.pattern.test(alarm.metric))) throw new Error(`The alarms must include ${required.name}.`);
  }
}

function assertDashboard(record) {
  requiredObject(record.dashboard, "dashboard");
  requiredNonSecretText(record.dashboard.reference, "Dashboard reference");
  requiredCanadianRegion(record.dashboard.region, "Dashboard region");
  requiredArray(record.dashboard.panels, "Dashboard panels");
  const metrics = new Set();
  for (const panel of record.dashboard.panels) {
    requiredObject(panel, "Each dashboard panel");
    requiredText(panel.metric, "Dashboard panel metric");
    requiredNonSecretText(panel.reference, `Dashboard panel ${panel.metric} reference`);
    metrics.add(panel.metric);
  }
  for (const metric of REQUIRED_DASHBOARD_METRICS) {
    if (!metrics.has(metric)) throw new Error(`The dashboard must cover ${metric}.`);
  }
}

function assertMonitoringDefinitions(record, repoRoot) {
  requiredObject(record.repositoryAssets, "repositoryAssets");
  const definitions = readRepositoryJson(
    record.repositoryAssets.monitoringDefinitionsPath,
    "repositoryAssets monitoringDefinitionsPath",
    repoRoot,
  );
  if (definitions.AWSTemplateFormatVersion !== "2010-09-09") {
    throw new Error("The monitoring definitions must be a CloudFormation template with AWSTemplateFormatVersion 2010-09-09.");
  }
  const allowedRegions = definitions?.Parameters?.DeploymentRegion?.AllowedValues;
  if (!Array.isArray(allowedRegions) || allowedRegions.length !== CANADIAN_REGIONS.size) {
    throw new Error("The monitoring definitions must constrain DeploymentRegion to both supported Canadian regions and no others.");
  }
  for (const region of CANADIAN_REGIONS) {
    if (!allowedRegions.includes(region)) throw new Error(`The monitoring definitions omit Canadian region ${region}.`);
  }
  if (allowedRegions.some((region) => !CANADIAN_REGIONS.has(region))) {
    throw new Error("The monitoring definitions permit a non-Canadian DeploymentRegion.");
  }

  requiredObject(definitions.Resources, "Monitoring definition Resources");
  const resources = Object.values(definitions.Resources);
  const alarms = resources.filter((resource) => resource?.Type === "AWS::CloudWatch::Alarm");
  requiredArray(alarms, "Monitoring definition alarms");
  for (const alarm of alarms) {
    requiredObject(alarm.Properties, "Each monitoring definition alarm Properties");
    requiredText(alarm.Properties.MetricName, "Monitoring definition alarm MetricName");
    requiredThreshold(alarm.Properties.Threshold, `Monitoring definition alarm ${alarm.Properties.MetricName} Threshold`);
    requiredPositiveInteger(
      alarm.Properties.EvaluationPeriods,
      `Monitoring definition alarm ${alarm.Properties.MetricName} EvaluationPeriods`,
    );
    if (alarm.Properties.ActionsEnabled !== true) {
      throw new Error(`Monitoring definition alarm ${alarm.Properties.MetricName} must enable its configured recipient action when deployed.`);
    }
    requiredArray(alarm.Properties.AlarmActions, `Monitoring definition alarm ${alarm.Properties.MetricName} AlarmActions`);
    if (alarm.Properties.TreatMissingData !== "missing") {
      throw new Error(`Monitoring definition alarm ${alarm.Properties.MetricName} must preserve missing data as missing.`);
    }
  }
  for (const required of REQUIRED_ALARM_METRIC_PATTERNS) {
    if (!alarms.some((alarm) => required.pattern.test(alarm.Properties.MetricName))) {
      throw new Error(`The monitoring definitions must include ${required.name}.`);
    }
  }

  const dashboards = resources.filter((resource) => resource?.Type === "AWS::CloudWatch::Dashboard");
  if (dashboards.length !== 1) throw new Error("The monitoring definitions must include exactly one CloudWatch dashboard.");
  const dashboardBody = dashboards[0]?.Properties?.DashboardBody?.["Fn::Sub"];
  requiredText(dashboardBody, "Monitoring definition dashboard body");
  for (const metric of REQUIRED_DASHBOARD_METRICS) {
    if (!dashboardBody.includes(metric)) throw new Error(`The monitoring definition dashboard must cover ${metric}.`);
  }

  repositoryFile(
    record.repositoryAssets.syntheticRunnerPath,
    "repositoryAssets syntheticRunnerPath",
    repoRoot,
  );
}

function assertSyntheticDefinition(record, repoRoot) {
  const synthetic = record.syntheticUptime;
  requiredObject(synthetic, "syntheticUptime");
  const workflowFile = repositoryFile(
    synthetic.workflowPath,
    "syntheticUptime workflowPath",
    repoRoot,
  );
  requiredText(synthetic.schedule, "syntheticUptime schedule");
  requiredBoolean(synthetic.writePermissions, "syntheticUptime writePermissions");
  if (synthetic.writePermissions !== false) throw new Error("The synthetic uptime workflow must hold no write permission.");
  requiredBoolean(synthetic.substituteForHostSideMonitoring, "syntheticUptime substituteForHostSideMonitoring");
  if (synthetic.substituteForHostSideMonitoring !== false) {
    throw new Error("A synthetic uptime check is an availability signal from outside; it must not be recorded as a substitute for host-side monitoring.");
  }
  if (Object.hasOwn(synthetic, "lastRun")) {
    throw new Error("A partial repository-preparation record must omit syntheticUptime.lastRun until a real workflow run has been observed.");
  }
  requiredArray(synthetic.routes, "syntheticUptime routes");
  const routes = new Map();
  for (const route of synthetic.routes) {
    requiredObject(route, "Each synthetic route");
    requiredText(route.path, "Synthetic route path");
    if (!route.path.startsWith("/") || route.path.startsWith("//")) {
      throw new Error(`Synthetic route ${route.path} must be an origin-relative path.`);
    }
    if (routes.has(route.path)) throw new Error(`Synthetic route ${route.path} is duplicated.`);
    if (!Number.isSafeInteger(route.expectedStatus) || route.expectedStatus < 100 || route.expectedStatus > 599) {
      throw new Error(`Synthetic route ${route.path} expectedStatus must be an HTTP status code.`);
    }
    requiredText(route.contentMarker, `Synthetic route ${route.path} contentMarker`);
    routes.set(route.path, route);
  }
  if (routes.has("/fr/compare")) throw new Error("The French comparison route is /fr/comparer; /fr/compare is a 404 and must not be probed as a successful route.");
  for (const route of REQUIRED_SYNTHETIC_ROUTES) {
    if (!routes.has(route)) throw new Error(`The synthetic uptime definition must cover real bilingual route ${route}.`);
    if (routes.get(route).expectedStatus !== 200) throw new Error(`Synthetic route ${route} must expect its real 200 status.`);
  }

  const workflow = readFileSync(workflowFile, "utf8");
  if (!/^permissions:\s*\n\s+contents:\s+read\s*$/m.test(workflow)) {
    throw new Error("The synthetic uptime workflow must declare top-level contents: read permission.");
  }
  if (/^\s+[A-Za-z-]+:\s+write\s*$/m.test(workflow)) {
    throw new Error("The synthetic uptime workflow declares a write permission.");
  }
  const escapedSchedule = synthetic.schedule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`cron:\\s*["']${escapedSchedule}["']`).test(workflow)) {
    throw new Error("The synthetic uptime record schedule does not match its workflow cron expression.");
  }
  if (!workflow.includes(`node ${record.repositoryAssets.syntheticRunnerPath}`)) {
    throw new Error("The synthetic uptime workflow does not invoke the runner named by repositoryAssets.syntheticRunnerPath.");
  }
}

function assertOwnerBoundary(record) {
  requiredObject(record.ownerBoundary, "ownerBoundary");
  if (record.ownerBoundary.ownerRunRequired !== true) {
    throw new Error("ownerBoundary.ownerRunRequired must remain true until the owner has produced deployment evidence.");
  }
  if (record.ownerBoundary.awsMutationPerformed !== false) {
    throw new Error("The repository-preparation record cannot claim an AWS mutation was performed.");
  }
  if (record.ownerBoundary.syntheticRunPerformed !== false) {
    throw new Error("The repository-preparation record cannot claim a synthetic run was performed.");
  }
  requiredArray(record.ownerBoundary.pendingEvidence, "ownerBoundary pendingEvidence");
  const pending = new Set();
  for (const item of record.ownerBoundary.pendingEvidence) {
    requiredText(item, "Each ownerBoundary pendingEvidence item");
    if (pending.has(item)) throw new Error(`ownerBoundary pendingEvidence contains duplicate ${item}.`);
    pending.add(item);
  }
  for (const item of REQUIRED_PENDING_EVIDENCE) {
    if (!pending.has(item)) throw new Error(`ownerBoundary pendingEvidence must include ${item}.`);
  }
}

function assertPartialClaims(record) {
  requiredObject(record.claims, "claims");
  for (const claim of [
    "hostTierMonitored",
    "archiveLoggingObserved",
    "deliveryLoggingObserved",
    "syntheticRunObserved",
    "observabilityComplete",
    "phase8CriterionPass",
  ]) {
    requiredBoolean(record.claims[claim], `claims ${claim}`);
    if (record.claims[claim] !== false) throw new Error(`claims.${claim} must remain false in a partial repository-preparation record.`);
  }
}

function assertSyntheticUptime(record, repoRoot) {
  const synthetic = record.syntheticUptime;
  requiredObject(synthetic, "syntheticUptime");
  requiredText(synthetic.workflowPath, "syntheticUptime workflowPath");
  if (path.isAbsolute(synthetic.workflowPath) || synthetic.workflowPath.includes("..")) throw new Error("syntheticUptime workflowPath must be a repository-relative path.");
  if (!existsSync(path.join(repoRoot, synthetic.workflowPath))) throw new Error(`syntheticUptime names ${synthetic.workflowPath}, which does not exist in this repository.`);
  requiredText(synthetic.schedule, "syntheticUptime schedule");
  requiredBoolean(synthetic.writePermissions, "syntheticUptime writePermissions");
  if (synthetic.writePermissions !== false) throw new Error("The synthetic uptime workflow must hold no write permission.");
  requiredBoolean(synthetic.substituteForHostSideMonitoring, "syntheticUptime substituteForHostSideMonitoring");
  if (synthetic.substituteForHostSideMonitoring !== false) throw new Error("A synthetic uptime check is an availability signal from outside; it must not be recorded as a substitute for host-side monitoring.");
  requiredArray(synthetic.routes, "syntheticUptime routes");
  const routes = new Set();
  for (const route of synthetic.routes) {
    requiredObject(route, "Each synthetic route");
    requiredText(route.path, "Synthetic route path");
    if (!Number.isSafeInteger(route.expectedStatus) || route.expectedStatus < 100 || route.expectedStatus > 599) throw new Error(`Synthetic route ${route.path} expectedStatus must be an HTTP status code.`);
    requiredText(route.contentMarker, `Synthetic route ${route.path} contentMarker`);
    routes.add(route.path);
  }
  const lastRun = synthetic.lastRun;
  requiredObject(lastRun, "syntheticUptime lastRun");
  requiredUtcInstant(lastRun.startedAt, "syntheticUptime lastRun startedAt");
  if (!["pass", "fail"].includes(lastRun.result)) throw new Error("syntheticUptime lastRun result must be pass or fail.");
  requiredArray(lastRun.observedRoutes, "syntheticUptime lastRun observedRoutes");
  const observed = new Set();
  for (const entry of lastRun.observedRoutes) {
    requiredObject(entry, "Each observed synthetic route");
    requiredText(entry.path, "Observed synthetic route path");
    if (!routes.has(entry.path)) throw new Error(`The last synthetic run recorded ${entry.path}, which is not one of the configured routes.`);
    if (!Number.isSafeInteger(entry.status) || entry.status < 100 || entry.status > 599) throw new Error(`Observed synthetic route ${entry.path} status must be an HTTP status code.`);
    requiredBoolean(entry.contentMarkerFound, `Observed synthetic route ${entry.path} contentMarkerFound`);
    observed.add(entry.path);
  }
  for (const route of routes) {
    if (!observed.has(route)) throw new Error(`The last synthetic run did not record a result for ${route}.`);
  }
  if (lastRun.result === "pass") {
    for (const entry of lastRun.observedRoutes) {
      const configured = synthetic.routes.find((route) => route.path === entry.path);
      if (entry.status !== configured.expectedStatus || entry.contentMarkerFound !== true) throw new Error(`The last synthetic run is recorded as a pass while ${entry.path} did not meet its expected status and content marker.`);
    }
  }
}

function assertOperationalReviews(record) {
  requiredArray(record.operationalReviews, "operationalReviews");
  for (const review of record.operationalReviews) {
    requiredObject(review, "Each operational review");
    requiredUtcInstant(review.reviewedAt, "Operational review reviewedAt");
    requiredText(review.reviewerRole, "Operational review reviewerRole");
    requiredText(review.scope, "Operational review scope");
    requiredText(review.findings, "Operational review findings");
    requiredNonSecretText(review.reference, "Operational review reference");
  }
}

function assertUnobserved(record) {
  requiredArray(record.unobserved, "unobserved");
  for (const entry of record.unobserved) {
    requiredObject(entry, "Each unobserved entry");
    requiredText(entry.tier, "Unobserved entry tier");
    requiredText(entry.component, "Unobserved entry component");
    requiredBoolean(entry.monitored, `Unobserved entry ${entry.component} monitored`);
    if (entry.monitored !== false) throw new Error(`Unobserved entry ${entry.component} cannot be recorded as monitored.`);
    requiredText(entry.reason, `Unobserved entry ${entry.component} reason`);
    if (entry.metrics !== undefined) {
      requiredArray(entry.metrics, `Unobserved entry ${entry.component} metrics`);
      for (const metric of entry.metrics) {
        requiredObject(metric, "Each unobserved metric");
        requiredText(metric.name, "Unobserved metric name");
        requiredUnknownValue(metric.value, `Unobserved metric ${metric.name} value`);
      }
    }
  }
  if (!record.unobserved.some((entry) => entry.tier === "site")) throw new Error("The unobserved section must name the externally hosted site tier while the site tier is externally hosted.");
}

/**
 * Validates one already-parsed observability record. `repoRoot` exists so the synthetic workflow
 * binding can be checked against a fixture tree in a test as well as against this repository.
 */
export function validateObservabilityDeployment(record, { repoRoot = REPO_ROOT } = {}) {
  requiredObject(record, "The observability deployment record");
  if (record.schemaVersion !== SCHEMA_VERSION) throw new Error(`The observability deployment schemaVersion must be ${SCHEMA_VERSION}.`);
  if (!STATUSES.has(record.status)) throw new Error(`The observability deployment status must be one of ${[...STATUSES].join(", ")}.`);
  requiredUtcInstant(record.capturedAt, "capturedAt");

  const siteTier = record.siteTier;
  requiredObject(siteTier, "siteTier");
  requiredText(siteTier.host, "siteTier host");
  requiredBoolean(siteTier.externallyHosted, "siteTier externallyHosted");
  requiredBoolean(siteTier.hostSideMonitoringAvailable, "siteTier hostSideMonitoringAvailable");
  requiredBoolean(siteTier.monitored, "siteTier monitored");
  if (siteTier.externallyHosted && (siteTier.hostSideMonitoringAvailable || siteTier.monitored)) throw new Error("The externally hosted site tier cannot be recorded as monitored; recent Worker logs do not establish retained request counts, error rates, alerting, or a dashboard.");
  if (!siteTier.externallyHosted) throw new Error("This record describes the externally hosted site tier; set externallyHosted to true or replace this record with one written for a self-hosted site.");

  if (record.status === "partial") {
    for (const field of PARTIAL_FORBIDDEN_FIELDS) {
      if (Object.hasOwn(record, field)) {
        throw new Error(`A partial repository-preparation record must omit ${field}; only observed owner-run evidence belongs in that field.`);
      }
    }
    assertMonitoringDefinitions(record, repoRoot);
    assertSyntheticDefinition(record, repoRoot);
    assertOwnerBoundary(record);
    assertUnobserved(record);
    assertPartialClaims(record);
    return record;
  }

  const destinations = assertLogDestinations(record);

  const archive = record.archive;
  requiredObject(archive, "archive");
  requiredText(archive.bucket, "archive bucket");
  assertBinding(archive.serverAccessLogging, "archive serverAccessLogging", destinations, "s3-server-access-log");
  const trail = assertBinding(archive.cloudTrailDataEvents, "archive cloudTrailDataEvents", destinations, "cloudtrail-data-events");
  requiredText(archive.cloudTrailDataEvents.eventSelectorScope, "archive cloudTrailDataEvents eventSelectorScope");
  if (trail.tier !== "archive") throw new Error("The CloudTrail data-event destination must be recorded against the archive tier.");

  const delivery = record.delivery;
  requiredObject(delivery, "delivery");
  requiredNonSecretText(delivery.distributionReference, "delivery distributionReference");
  assertBinding(delivery.standardLogging, "delivery standardLogging", destinations, "cloudfront-standard-logs");

  assertAlarms(record);
  assertDashboard(record);
  assertSyntheticUptime(record, repoRoot);
  assertOperationalReviews(record);
  assertUnobserved(record);

  const claims = record.claims;
  requiredObject(claims, "claims");
  requiredBoolean(claims.hostTierMonitored, "claims hostTierMonitored");
  requiredBoolean(claims.observabilityComplete, "claims observabilityComplete");
  if (claims.hostTierMonitored) throw new Error("claims.hostTierMonitored cannot be true while the site tier is externally hosted and unobserved.");
  if (claims.observabilityComplete) throw new Error("claims.observabilityComplete cannot be true while a named tier stays unobserved.");

  return record;
}

/** Reads and validates the record, failing closed when the evidence file does not exist. */
export function checkObservabilityDeployment(file = RECORD_URL, options = {}) {
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("No observability record exists: data/observability-deployment.json does not exist. Record either the checked repository-preparation boundary or observed owner-run deployment evidence per docs/OBSERVABILITY_EVIDENCE_SCHEMA.md.");
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`The observability deployment record is not valid JSON: ${error.message}`);
  }
  return validateObservabilityDeployment(parsed, options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const file = process.argv[2] ? path.resolve(process.argv[2]) : RECORD_URL;
    const record = checkObservabilityDeployment(file);
    if (record.status === "partial") {
      console.log(`PASS observability repository boundary: alarm and dashboard definitions plus a read-only synthetic workflow are present; ${record.ownerBoundary.pendingEvidence.length} owner-run evidence item(s) remain pending, no lastRun is claimed, and the Phase 8 criterion remains fail.`);
    } else {
      console.log(`PASS observability deployment: ${record.logDestinations.length} Canadian log destinations, ${record.alarms.length} alarms with thresholds and recipients, a dashboard, a scheduled synthetic uptime check, ${record.operationalReviews.length} recorded operational review(s), and ${record.unobserved.length} explicitly unobserved component(s) including the ${record.siteTier.host} site tier.`);
    }
  } catch (error) {
    console.error(`FAIL observability deployment: ${error.message}`);
    process.exitCode = 1;
  }
}
