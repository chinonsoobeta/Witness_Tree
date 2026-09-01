import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  checkObservabilityDeployment,
  validateObservabilityDeployment,
} from "../scripts/check-observability-deployment.mjs";
import { runSyntheticUptime } from "../scripts/run-synthetic-uptime.mjs";

/**
 * These tests exercise both accepted states. The canonical partial record binds repository assets
 * and forbids owner-run evidence. The fixture below models a later observed deployment and is
 * mutated one field at a time to prove the strict evidence rules still bite.
 */

const WORKFLOW_PATH = ".github/workflows/synthetic-uptime.yml";
const CANONICAL_PARTIAL = JSON.parse(
  readFileSync(new URL("../data/observability-deployment.json", import.meta.url), "utf8"),
);
const partialFixture = () => structuredClone(CANONICAL_PARTIAL);

async function fixtureRoot(t) {
  const root = await mkdtemp(path.join(tmpdir(), "observability-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
  await writeFile(path.join(root, WORKFLOW_PATH), "name: synthetic uptime\n", "utf8");
  await mkdir(path.join(root, "data"), { recursive: true });
  return root;
}

function fixture(overrides = {}) {
  return {
    schemaVersion: "witness-tree/observability-deployment/1",
    capturedAt: "2026-08-28T00:00:00Z",
    status: "archive-and-delivery-observed",
    siteTier: {
      host: "the external site host",
      externallyHosted: true,
      hostSideMonitoringAvailable: false,
      monitored: false,
    },
    logDestinations: [
      {
        id: "archive-access-logs",
        kind: "s3-server-access-log",
        tier: "archive",
        region: "ca-central-1",
        retentionDays: 365,
        retentionSource: "lifecycle expiration rule on the log destination bucket",
        reference: "private configuration record: archive access log destination",
        reviewerRole: "archive owner",
      },
      {
        id: "archive-data-events",
        kind: "cloudtrail-data-events",
        tier: "archive",
        region: "ca-central-1",
        retentionDays: 365,
        retentionSource: "trail log file retention on the destination bucket",
        reference: "private configuration record: archive data event trail",
        reviewerRole: "archive owner",
      },
      {
        id: "delivery-standard-logs",
        kind: "cloudfront-standard-logs",
        tier: "delivery",
        region: "ca-central-1",
        retentionDays: 90,
        retentionSource: "lifecycle expiration rule on the delivery log bucket",
        reference: "private configuration record: delivery standard log destination",
        reviewerRole: "delivery owner",
      },
    ],
    archive: {
      bucket: "the raw archive bucket",
      serverAccessLogging: {
        enabled: true,
        destinationId: "archive-access-logs",
        reference: "console read-back: server access logging enabled",
      },
      cloudTrailDataEvents: {
        enabled: true,
        destinationId: "archive-data-events",
        eventSelectorScope: "all object-level read and write events on the raw archive bucket",
        reference: "console read-back: data event selector",
      },
    },
    delivery: {
      distributionReference: "private configuration record: delivery distribution",
      standardLogging: {
        enabled: true,
        destinationId: "delivery-standard-logs",
        reference: "console read-back: standard logging enabled",
      },
    },
    alarms: [
      {
        id: "delivery-5xx-rate",
        tier: "delivery",
        metric: "delivery 5xx error rate",
        comparison: "greater-than",
        threshold: 1,
        thresholdUnit: "percent of requests",
        evaluationPeriods: 2,
        recipientRole: "delivery owner",
        enabled: true,
        reference: "private configuration record: 5xx rate alarm",
      },
      {
        id: "delivery-origin-error-rate",
        tier: "delivery",
        metric: "origin error rate",
        comparison: "greater-than",
        threshold: 0.5,
        thresholdUnit: "percent of origin requests",
        evaluationPeriods: 2,
        recipientRole: "delivery owner",
        enabled: true,
        reference: "private configuration record: origin error rate alarm",
      },
    ],
    dashboard: {
      reference: "private configuration record: delivery dashboard",
      region: "ca-central-1",
      panels: [
        { metric: "request-rate", reference: "dashboard panel: request rate" },
        { metric: "cache-hit-ratio", reference: "dashboard panel: cache hit ratio" },
        { metric: "error-rate", reference: "dashboard panel: error rate" },
      ],
    },
    syntheticUptime: {
      workflowPath: WORKFLOW_PATH,
      schedule: "0 */6 * * *",
      writePermissions: false,
      substituteForHostSideMonitoring: false,
      routes: [
        { path: "/", expectedStatus: 200, contentMarker: "Witness Tree" },
        { path: "/explore", expectedStatus: 200, contentMarker: "Explore" },
      ],
      lastRun: {
        startedAt: "2026-08-27T18:00:00Z",
        result: "pass",
        observedRoutes: [
          { path: "/", status: 200, contentMarkerFound: true },
          { path: "/explore", status: 200, contentMarkerFound: true },
        ],
      },
    },
    operationalReviews: [
      {
        reviewedAt: "2026-08-27T20:00:00Z",
        reviewerRole: "archive owner",
        scope: "archive access logs, data events, delivery logs, alarms, and the synthetic run history",
        findings: "no deletion attempts and no alarm transitions in the reviewed window",
        reference: "review record: first operational review",
      },
    ],
    unobserved: [
      {
        tier: "site",
        component: "externally hosted site tier",
        monitored: false,
        reason: "the host exposes no logs, no error rate, no request count, and no alerting hook",
        metrics: [
          { name: "requestCount", value: "unknown" },
          { name: "errorRate", value: null },
        ],
      },
    ],
    claims: { hostTierMonitored: false, observabilityComplete: false },
    ...overrides,
  };
}

const withSite = (overrides) => {
  const record = fixture();
  return { ...record, siteTier: { ...record.siteTier, ...overrides } };
};

const withSynthetic = (overrides) => {
  const record = fixture();
  return { ...record, syntheticUptime: { ...record.syntheticUptime, ...overrides } };
};

const withDestination = (id, overrides) => {
  const record = fixture();
  return {
    ...record,
    logDestinations: record.logDestinations.map((destination) =>
      destination.id === id ? { ...destination, ...overrides } : destination,
    ),
  };
};

const withAlarm = (id, overrides) => {
  const record = fixture();
  return {
    ...record,
    alarms: record.alarms.map((alarm) => (alarm.id === id ? { ...alarm, ...overrides } : alarm)),
  };
};

test("the canonical partial record binds repository assets without claiming owner-run evidence", () => {
  const record = checkObservabilityDeployment();
  assert.equal(record.status, "partial");
  assert.equal(record.claims.phase8CriterionPass, false);
  assert.equal(Object.hasOwn(record.syntheticUptime, "lastRun"), false);
  for (const field of ["logDestinations", "archive", "delivery", "alarms", "dashboard", "operationalReviews"]) {
    assert.equal(Object.hasOwn(record, field), false, `${field} must be absent from the partial record`);
  }
  assert.ok(record.syntheticUptime.routes.some((route) => route.path === "/fr/comparer"));
  assert.equal(record.syntheticUptime.routes.some((route) => route.path === "/fr/compare"), false);
});

test("a partial record cannot smuggle in deployment evidence or a synthetic lastRun", () => {
  const lastRun = {
    startedAt: "2026-08-31T00:00:00Z",
    result: "pass",
    observedRoutes: [],
  };
  assert.throws(
    () => validateObservabilityDeployment({ ...partialFixture(), alarms: [] }),
    /must omit alarms/,
  );
  const synthetic = partialFixture().syntheticUptime;
  assert.throws(
    () =>
      validateObservabilityDeployment({
        ...partialFixture(),
        syntheticUptime: { ...synthetic, lastRun },
      }),
    /must omit syntheticUptime\.lastRun/,
  );
  assert.throws(
    () =>
      validateObservabilityDeployment({
        ...partialFixture(),
        ownerBoundary: { ...partialFixture().ownerBoundary, awsMutationPerformed: true },
      }),
    /cannot claim an AWS mutation/,
  );
});

test("the partial boundary keeps every required owner-run evidence item and completion claim open", () => {
  const record = partialFixture();
  assert.throws(
    () =>
      validateObservabilityDeployment({
        ...record,
        ownerBoundary: {
          ...record.ownerBoundary,
          pendingEvidence: record.ownerBoundary.pendingEvidence.filter(
            (item) => item !== "delivery-standard-logging",
          ),
        },
      }),
    /must include delivery-standard-logging/,
  );
  assert.throws(
    () =>
      validateObservabilityDeployment({
        ...record,
        claims: { ...record.claims, phase8CriterionPass: true },
      }),
    /phase8CriterionPass must remain false/,
  );
});

test("the partial route contract rejects the nonexistent French comparison path", () => {
  const record = partialFixture();
  const routes = record.syntheticUptime.routes.map((route) =>
    route.path === "/fr/comparer" ? { ...route, path: "/fr/compare" } : route,
  );
  assert.throws(
    () =>
      validateObservabilityDeployment({
        ...record,
        syntheticUptime: { ...record.syntheticUptime, routes },
      }),
    /French comparison route is \/fr\/comparer/,
  );
});

test("the synthetic runner checks status and marker for every configured route", async () => {
  const routes = [
    { path: "/en/compare", expectedStatus: 200, contentMarker: "Riding comparison" },
    { path: "/fr/comparer", expectedStatus: 200, contentMarker: "Comparaison des circonscriptions" },
  ];
  const requested = [];
  const instants = [new Date("2026-08-31T00:00:00Z"), new Date("2026-08-31T00:00:01Z")];
  const result = await runSyntheticUptime({
    origin: "https://www.witnesstree.ca",
    routes,
    now: () => instants.shift(),
    fetchImpl: async (url, options) => {
      requested.push({ path: url.pathname, options });
      const marker = routes.find((route) => route.path === url.pathname).contentMarker;
      return new Response(`<h1>${marker}</h1>`, { status: 200 });
    },
  });
  assert.equal(result.result, "pass");
  assert.deepEqual(requested.map(({ path }) => path), ["/en/compare", "/fr/comparer"]);
  assert.ok(requested.every(({ options }) => options.redirect === "manual"));
  assert.ok(requested.every(({ options }) => options.signal instanceof AbortSignal));
  assert.deepEqual(result.observedRoutes.map(({ contentMarkerFound }) => contentMarkerFound), [true, true]);
});

test("the synthetic runner preserves a missing observation as null and fails the run", async () => {
  const instants = [new Date("2026-08-31T00:00:00Z"), new Date("2026-08-31T00:00:01Z")];
  const result = await runSyntheticUptime({
    origin: "https://www.witnesstree.ca",
    routes: [{ path: "/fr/comparer", expectedStatus: 200, contentMarker: "Comparaison" }],
    now: () => instants.shift(),
    fetchImpl: async () => {
      throw new Error("network unavailable");
    },
  });
  assert.equal(result.result, "fail");
  assert.equal(result.observedRoutes[0].status, null);
  assert.equal(result.observedRoutes[0].contentMarkerFound, null);
  assert.match(result.observedRoutes[0].error, /network unavailable/);
});

test("a complete observability record is accepted", async (t) => {
  const root = await fixtureRoot(t);
  assert.equal(
    validateObservabilityDeployment(fixture(), { repoRoot: root }).status,
    "archive-and-delivery-observed",
  );
});

test("a missing evidence file fails closed rather than passing silently", async (t) => {
  const root = await fixtureRoot(t);
  assert.throws(
    () =>
      checkObservabilityDeployment(path.join(root, "data", "observability-deployment.json"), {
        repoRoot: root,
      }),
    /No observability record exists/,
  );
});

test("the checker reads a written record from disk and reports invalid JSON honestly", async (t) => {
  const root = await fixtureRoot(t);
  const file = path.join(root, "data", "observability-deployment.json");
  await writeFile(file, JSON.stringify(fixture(), null, 2), "utf8");
  assert.equal(checkObservabilityDeployment(file, { repoRoot: root }).claims.observabilityComplete, false);
  await writeFile(file, "{ not json", "utf8");
  assert.throws(() => checkObservabilityDeployment(file, { repoRoot: root }), /not valid JSON/);
});

test("claimed host-tier monitoring is rejected in every place it can be asserted", async (t) => {
  const root = await fixtureRoot(t);
  const check = (record) => validateObservabilityDeployment(record, { repoRoot: root });
  assert.throws(() => check(withSite({ hostSideMonitoringAvailable: true })), /cannot be recorded as monitored/);
  assert.throws(() => check(withSite({ monitored: true })), /cannot be recorded as monitored/);
  assert.throws(
    () => check({ ...fixture(), claims: { hostTierMonitored: true, observabilityComplete: false } }),
    /hostTierMonitored cannot be true/,
  );
  assert.throws(
    () => check({ ...fixture(), claims: { hostTierMonitored: false, observabilityComplete: true } }),
    /observabilityComplete cannot be true/,
  );
  assert.throws(() => check(withAlarm("delivery-5xx-rate", { tier: "site" })), /claims the externally hosted site tier is monitored/);
  assert.throws(() => check(withDestination("archive-access-logs", { tier: "site" })), /claims the externally hosted site tier is monitored/);
});

test("non-Canadian log destinations and dashboards are rejected", async (t) => {
  const root = await fixtureRoot(t);
  const check = (record) => validateObservabilityDeployment(record, { repoRoot: root });
  assert.throws(() => check(withDestination("archive-access-logs", { region: "us-east-1" })), /must be a Canadian region/);
  assert.throws(() => check(withDestination("delivery-standard-logs", { region: "eu-west-1" })), /must be a Canadian region/);
  assert.throws(
    () => check({ ...fixture(), dashboard: { ...fixture().dashboard, region: "us-west-2" } }),
    /Dashboard region must be a Canadian region/,
  );
});

test("an unknown value may not be coerced to zero or to text", async (t) => {
  const root = await fixtureRoot(t);
  const check = (record) => validateObservabilityDeployment(record, { repoRoot: root });
  assert.throws(() => check(withDestination("archive-data-events", { retentionDays: 0 })), /must be a positive integer/);
  assert.throws(() => check(withDestination("archive-data-events", { retentionDays: "Unknown" })), /must be a positive integer/);
  assert.throws(() => check(withDestination("archive-data-events", { retentionDays: null })), /must be a positive integer/);
  assert.throws(() => check(withAlarm("delivery-5xx-rate", { threshold: "Unknown" })), /must be a finite number/);
  assert.throws(() => check(withAlarm("delivery-5xx-rate", { threshold: null })), /must be a finite number/);
  const record = fixture();
  assert.throws(
    () =>
      check({
        ...record,
        unobserved: [
          { ...record.unobserved[0], metrics: [{ name: "requestCount", value: 0 }] },
        ],
      }),
    /must never be coerced to 0/,
  );
});

test("archive access logging and data events must be enabled and bound to a recorded destination", async (t) => {
  const root = await fixtureRoot(t);
  const record = fixture();
  const check = (archive) => validateObservabilityDeployment({ ...record, archive }, { repoRoot: root });
  assert.throws(
    () => check({ ...record.archive, serverAccessLogging: { ...record.archive.serverAccessLogging, enabled: false } }),
    /serverAccessLogging must be recorded as enabled/,
  );
  assert.throws(
    () => check({ ...record.archive, cloudTrailDataEvents: { ...record.archive.cloudTrailDataEvents, enabled: false } }),
    /cloudTrailDataEvents must be recorded as enabled/,
  );
  assert.throws(
    () => check({ ...record.archive, serverAccessLogging: { ...record.archive.serverAccessLogging, destinationId: "nowhere" } }),
    /which is not recorded in logDestinations/,
  );
  assert.throws(
    () => check({ ...record.archive, cloudTrailDataEvents: { ...record.archive.cloudTrailDataEvents, destinationId: "archive-access-logs" } }),
    /must land in a cloudtrail-data-events destination/,
  );
  assert.throws(
    () => validateObservabilityDeployment({ ...record, delivery: { ...record.delivery, standardLogging: { ...record.delivery.standardLogging, enabled: false } } }, { repoRoot: root }),
    /standardLogging must be recorded as enabled/,
  );
});

test("every alarm needs a threshold, a recipient role, and the required coverage", async (t) => {
  const root = await fixtureRoot(t);
  const record = fixture();
  const check = (alarms) => validateObservabilityDeployment({ ...record, alarms }, { repoRoot: root });
  assert.throws(() => check([]), /alarms must be a non-empty array/);
  assert.throws(() => check(withAlarm("delivery-5xx-rate", { recipientRole: "" }).alarms), /recipientRole is required/);
  assert.throws(() => check(withAlarm("delivery-5xx-rate", { enabled: false }).alarms), /must be recorded as enabled/);
  assert.throws(() => check(withAlarm("delivery-5xx-rate", { evaluationPeriods: 0 }).alarms), /evaluationPeriods must be a positive integer/);
  assert.throws(() => check(withAlarm("delivery-5xx-rate", { comparison: "roughly" }).alarms), /comparison must be one of/);
  assert.throws(() => check(record.alarms.filter((alarm) => alarm.id !== "delivery-5xx-rate")), /must include a 5xx rate alarm/);
  assert.throws(() => check(record.alarms.filter((alarm) => alarm.id !== "delivery-origin-error-rate")), /must include an origin error rate alarm/);
  assert.throws(() => check([record.alarms[0], record.alarms[0]]), /Alarm ids must be unique/);
});

test("the dashboard must cover request rate, cache hit ratio, and error rate", async (t) => {
  const root = await fixtureRoot(t);
  const record = fixture();
  for (const metric of ["request-rate", "cache-hit-ratio", "error-rate"]) {
    assert.throws(
      () =>
        validateObservabilityDeployment(
          {
            ...record,
            dashboard: {
              ...record.dashboard,
              panels: record.dashboard.panels.filter((panel) => panel.metric !== metric),
            },
          },
          { repoRoot: root },
        ),
      new RegExp(`dashboard must cover ${metric}`),
    );
  }
});

test("the synthetic uptime check must be scheduled, read-only, real, and honestly scoped", async (t) => {
  const root = await fixtureRoot(t);
  const check = (record) => validateObservabilityDeployment(record, { repoRoot: root });
  assert.throws(() => check(withSynthetic({ workflowPath: ".github/workflows/absent.yml" })), /does not exist in this repository/);
  assert.throws(() => check(withSynthetic({ workflowPath: "/etc/passwd" })), /repository-relative path/);
  assert.throws(() => check(withSynthetic({ writePermissions: true })), /must hold no write permission/);
  assert.throws(() => check(withSynthetic({ substituteForHostSideMonitoring: true })), /must not be recorded as a substitute/);
  assert.throws(() => check(withSynthetic({ schedule: "" })), /schedule is required/);
  const synthetic = fixture().syntheticUptime;
  assert.throws(
    () =>
      check(
        withSynthetic({
          lastRun: {
            ...synthetic.lastRun,
            observedRoutes: [synthetic.lastRun.observedRoutes[0]],
          },
        }),
      ),
    /did not record a result for \/explore/,
  );
  assert.throws(
    () =>
      check(
        withSynthetic({
          lastRun: {
            ...synthetic.lastRun,
            observedRoutes: [
              { path: "/", status: 500, contentMarkerFound: false },
              synthetic.lastRun.observedRoutes[1],
            ],
          },
        }),
      ),
    /recorded as a pass while \//,
  );
});

test("at least one dated operational review is required", async (t) => {
  const root = await fixtureRoot(t);
  const record = fixture();
  assert.throws(
    () => validateObservabilityDeployment({ ...record, operationalReviews: [] }, { repoRoot: root }),
    /operationalReviews must be a non-empty array/,
  );
  assert.throws(
    () =>
      validateObservabilityDeployment(
        { ...record, operationalReviews: [{ ...record.operationalReviews[0], reviewedAt: "2026-08-27" }] },
        { repoRoot: root },
      ),
    /reviewedAt must be a UTC instant/,
  );
  assert.throws(
    () =>
      validateObservabilityDeployment(
        { ...record, operationalReviews: [{ ...record.operationalReviews[0], reviewerRole: "" }] },
        { repoRoot: root },
      ),
    /reviewerRole is required/,
  );
});

test("the unobserved section must be present, non-empty, and name the site tier", async (t) => {
  const root = await fixtureRoot(t);
  const record = fixture();
  const check = (unobserved) => validateObservabilityDeployment({ ...record, unobserved }, { repoRoot: root });
  assert.throws(() => check([]), /unobserved must be a non-empty array/);
  assert.throws(() => check(undefined), /unobserved must be a non-empty array/);
  assert.throws(() => check([{ ...record.unobserved[0], tier: "delivery" }]), /must name the externally hosted site tier/);
  assert.throws(() => check([{ ...record.unobserved[0], monitored: true }]), /cannot be recorded as monitored/);
  assert.throws(() => check([{ ...record.unobserved[0], reason: "" }]), /reason is required/);
});

test("secrets and unrecognized envelopes are refused", async (t) => {
  const root = await fixtureRoot(t);
  const check = (record) => validateObservabilityDeployment(record, { repoRoot: root });
  assert.throws(() => check({ ...fixture(), schemaVersion: "witness-tree/observability-deployment/2" }), /schemaVersion must be/);
  assert.throws(() => check({ ...fixture(), status: "green" }), /status must be one of/);
  assert.throws(() => check({ ...fixture(), capturedAt: "2026-08-28" }), /capturedAt must be a UTC instant/);
  assert.throws(() => check(withSite({ externallyHosted: false })), /set externallyHosted to true/);
  assert.throws(
    () => check(withDestination("archive-access-logs", { reference: "arn:aws:s3:::log-bucket" })),
    /looks like an ARN/,
  );
  assert.throws(
    () => check(withAlarm("delivery-5xx-rate", { reference: "alarm in account 123456789012" })),
    /looks like an AWS account ID/,
  );
});
