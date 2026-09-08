import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  BREAK_GLASS_MAX_DAYS,
  BREAK_GLASS_PATH,
  BRANCH_EVIDENCE_PATH,
  DEPLOYED_ORIGIN,
  RENDER_EVIDENCE_PATH,
  RENDER_EVIDENCE_SCHEMA,
  resolveDeployedMapRender,
  validateBranchObservation,
  validateBreakGlass,
  validateDeployedMapRender,
} from "../scripts/check-deployed-map-render.mjs";
import { scopeOf } from "../scripts/verify-deployed-map-render.mjs";

const loadRecord = async () =>
  JSON.parse(await readFile(new URL(`../${RENDER_EVIDENCE_PATH}`, import.meta.url), "utf8"));

// Every rejection case starts from the record that a real browser run produced.
// The current branch intentionally leaves that historical record stale, and
// each mutation test below checks for its additional, distinct rejection.
const withRecord = async (mutate) => {
  const record = await loadRecord();
  mutate(record);
  return validateDeployedMapRender({ record });
};

test("the committed observation is current for the deployed client", async () => {
  // The Site was redeployed to this branch on 2026-09-05 and the harness was
  // re-run against it, so the recorded observation once again describes the
  // client the deployed origin serves. The staleness detector itself is still
  // exercised synthetically below by mutating a bound source.
  assert.deepEqual(validateDeployedMapRender(), []);
  const record = await loadRecord();
  assert.equal(record.schemaVersion, RENDER_EVIDENCE_SCHEMA);
  assert.ok(record.url.startsWith(DEPLOYED_ORIGIN));
  assert.equal(record.allChecksPassed, true);
});

test("the record claims no publication, admission or production eligibility", async () => {
  const record = await loadRecord();
  for (const claim of ["published", "productionEligible", "admissionClaim", "productionAdmission"]) {
    assert.equal(record[claim], false, `${claim} must be false`);
  }
});

test("a run against anything but the deployed origin is refused", async () => {
  for (const url of ["http://localhost:5173/en/explore", "https://preview.witnesstree.ca/en/explore", undefined]) {
    const failures = await withRecord((record) => {
      record.url = url;
    });
    assert.ok(
      failures.some((message) => message.includes("not on the deployed origin")),
      `expected ${url} to be refused`,
    );
  }
});

test("a failing check is reported as a failure, not as staleness", async () => {
  const failures = await withRecord((record) => {
    record.checks.find((entry) => entry.id === "canvas-painted-loss-ramp").pass = false;
  });
  assert.ok(failures.some((message) => message.startsWith("canvas-painted-loss-ramp did not pass")));
});

test("a missing check fails rather than passing by omission", async () => {
  const failures = await withRecord((record) => {
    record.checks = record.checks.filter((entry) => entry.id !== "no-geojson-fallback");
  });
  assert.ok(failures.some((message) => message.includes("does not report the no-geojson-fallback check")));
});

test("a check the checker does not know about fails rather than being ignored", async () => {
  const failures = await withRecord((record) => {
    record.checks.push({ id: "tiles-are-fresh", pass: true, observed: "invented" });
  });
  assert.ok(failures.some((message) => message.includes("unknown check tiles-are-fresh")));
});

test("a fallback fetch or a whole-object read fails the record", async () => {
  const fellBack = await withRecord((record) => {
    record.requestCounts.geojsonFallback = 1;
  });
  assert.ok(fellBack.some((message) => message.includes("GeoJSON fallback fetches")));

  const noRange = await withRecord((record) => {
    record.requestCounts.pmtilesRange = 0;
  });
  assert.ok(noRange.some((message) => message.includes("no HTTP 206 range responses")));
});

// This is the #84 shape: a source moves, the observation still describes the old
// deployment, and nothing says so. The bound digests are what make it say so.
test("the record goes stale the moment a bound source file changes", async () => {
  for (const relative of ["lib/explore/map-style.ts", "components/explore/ExploreMapClient.tsx"]) {
    const failures = await withRecord((record) => {
      record.sources.find((entry) => entry.path === relative).sha256 = "0".repeat(64);
    });
    assert.ok(
      failures.some((message) => message.startsWith(`${relative} changed since`)),
      `expected a stale-source failure for ${relative}`,
    );
  }
});

test("a record that binds no sources cannot pass, because staleness would be undetectable", async () => {
  for (const sources of [[], undefined]) {
    const failures = await withRecord((record) => {
      record.sources = sources;
    });
    assert.ok(failures.some((message) => message.includes("binds no source files")));
  }
});

test("the bound sources are the two files that decide what the observation means", async () => {
  const record = await loadRecord();
  assert.deepEqual(
    record.sources.map((entry) => entry.path).sort(),
    ["components/explore/ExploreMapClient.tsx", "lib/explore/map-style.ts"],
  );
  // The archive URL the record says it exercised must be the one the client ships.
  const style = await readFile(new URL("../lib/explore/map-style.ts", import.meta.url), "utf8");
  assert.ok(style.includes(record.archives.pmtilesUrl));
  assert.ok(style.includes(record.archives.geojsonUrl));
});

test("a record written for a different schema is refused", async () => {
  const failures = await withRecord((record) => {
    record.schemaVersion = "witness-tree/deployed-map-render-evidence/2";
  });
  assert.ok(failures.some((message) => message.includes("schemaVersion")));
});

// ---------------------------------------------------------------------------
// The gate used to be circular: a map fix could not merge without being
// deployed, and could not be deployed without merging. Two weaker tiers break
// that circle. Everything below is about keeping them weaker: a preview
// observation must never read as a Site observation, and a break-glass record
// must never read as a measurement.
// ---------------------------------------------------------------------------

const fixtureRoot = async () => {
  const root = await mkdtemp(path.join(tmpdir(), "map-render-gate-"));
  for (const relative of ["lib/explore/map-style.ts", "components/explore/ExploreMapClient.tsx"]) {
    await mkdir(path.join(root, path.dirname(relative)), { recursive: true });
    await copyFile(new URL(`../${relative}`, import.meta.url), path.join(root, relative));
  }
  await mkdir(path.join(root, "data"), { recursive: true });
  return root;
};

const currentSources = async () => {
  const record = await loadRecord();
  return Promise.all(
    record.sources.map(async (entry) => ({
      path: entry.path,
      sha256: createHash("sha256").update(await readFile(new URL(`../${entry.path}`, import.meta.url))).digest("hex"),
    })),
  );
};

/** A Site observation whose bound digests match the fixture tree, so it is current. */
const currentSiteRecord = async () => ({ ...(await loadRecord()), sources: await currentSources() });

const branchRecord = async (overrides = {}) => ({
  ...(await currentSiteRecord()),
  status: "branch-deployment-browser-observation",
  scope: "branch-deployment",
  siteObservationOwed: true,
  url: "https://pr-146.preview.example.org/en/explore",
  revision: "a".repeat(40),
  ...overrides,
});

const NOW = new Date("2026-09-05T00:00:00Z");

const breakGlassRecord = async (overrides = {}) => ({
  schemaVersion: "witness-tree/deployed-map-render-break-glass/1",
  status: "gate-debt-not-an-observation",
  siteObservationOwed: true,
  published: false,
  productionEligible: false,
  admissionClaim: false,
  productionAdmission: false,
  allChecksPassed: false,
  reason:
    "There is no preview or branch deployment origin for this repository, and the Site is deployed from a control plane this branch cannot reach. Nothing was measured; this record exists so the merge is attributable rather than silent.",
  authorizedBy: "repository owner",
  authorizedAt: "2026-09-04T00:00:00Z",
  settleBy: "2026-09-11T00:00:00Z",
  sources: await currentSources(),
  ...overrides,
});

const write = (root, relative, record) => writeFile(path.join(root, relative), `${JSON.stringify(record, null, 2)}\n`);

test("a stale Site observation still fails when nothing stands in for it", async () => {
  const root = await fixtureRoot();
  await write(root, RENDER_EVIDENCE_PATH, { ...(await loadRecord()), sources: [{ path: "lib/explore/map-style.ts", sha256: "0".repeat(64) }] });
  const { satisfiedBy, failures } = resolveDeployedMapRender({ root, now: NOW });
  assert.equal(satisfiedBy, null);
  assert.ok(failures.some((message) => message.includes("changed since")));
});

test("a preview observation answers the gate but leaves the Site observation owed", async () => {
  const root = await fixtureRoot();
  await write(root, RENDER_EVIDENCE_PATH, { ...(await loadRecord()), sources: [{ path: "lib/explore/map-style.ts", sha256: "0".repeat(64) }] });
  await write(root, BRANCH_EVIDENCE_PATH, await branchRecord());
  const { satisfiedBy, failures, notes } = resolveDeployedMapRender({ root, now: NOW });
  assert.deepEqual(failures, []);
  assert.equal(satisfiedBy, "branch-deployment");
  assert.ok(notes.join(" ").includes("still owed"));
});

test("a preview observation cannot be filed as a Site observation", async () => {
  // The strong claim and the weak one live in different files, and each refuses
  // the other's shape, so a preview run cannot be renamed into the Site record.
  const asSite = validateDeployedMapRender({ record: await branchRecord() });
  assert.ok(asSite.some((message) => message.includes("scope is branch-deployment")));
  assert.ok(asSite.some((message) => message.includes("still owed, so it is not one")));
  assert.ok(asSite.some((message) => message.includes("not on the deployed origin")));

  const asBranch = validateBranchObservation({ record: await currentSiteRecord() });
  assert.ok(asBranch.some((message) => message.includes("belongs in")));
});

test("a preview observation must name a real remote deployment, not a laptop", async () => {
  for (const url of ["http://localhost:5173/en/explore", "https://localhost:5173/en/explore", "http://pr-146.preview.example.org/en/explore", "https://app.localhost/en/explore", "not-a-url"]) {
    const failures = validateBranchObservation({ record: await branchRecord({ url }) });
    assert.ok(
      failures.some((message) => message.includes("not an https origin outside this machine")),
      `expected ${url} to be refused`,
    );
  }
  assert.deepEqual(validateBranchObservation({ record: await branchRecord() }), []);
});

test("a preview observation is held to every check a Site observation is", async () => {
  const stale = validateBranchObservation({ record: await branchRecord({ sources: [{ path: "lib/explore/map-style.ts", sha256: "0".repeat(64) }] }) });
  assert.ok(stale.some((message) => message.includes("changed since")));

  const failing = await branchRecord();
  failing.checks = failing.checks.map((entry) => (entry.id === "no-geojson-fallback" ? { ...entry, pass: false } : entry));
  assert.ok(validateBranchObservation({ record: failing }).some((message) => message.startsWith("no-geojson-fallback did not pass")));

  const noRevision = validateBranchObservation({ record: await branchRecord({ revision: "main" }) });
  assert.ok(noRevision.some((message) => message.includes("expected the 40-character commit")));
});

test("a broken preview observation fails the gate instead of falling through to break-glass", async () => {
  // Otherwise the weakest tier would quietly cover for a preview run that failed.
  const root = await fixtureRoot();
  await write(root, RENDER_EVIDENCE_PATH, { ...(await loadRecord()), sources: [{ path: "lib/explore/map-style.ts", sha256: "0".repeat(64) }] });
  await write(root, BRANCH_EVIDENCE_PATH, await branchRecord({ url: "http://localhost:5173/en/explore" }));
  await write(root, BREAK_GLASS_PATH, await breakGlassRecord());
  const { satisfiedBy, failures } = resolveDeployedMapRender({ root, now: NOW });
  assert.equal(satisfiedBy, null);
  assert.ok(failures.some((message) => message.includes("does not stand in its place")));
});

test("a break-glass record answers the gate only while it is complete and unexpired", async () => {
  const root = await fixtureRoot();
  await write(root, RENDER_EVIDENCE_PATH, { ...(await loadRecord()), sources: [{ path: "lib/explore/map-style.ts", sha256: "0".repeat(64) }] });
  await write(root, BREAK_GLASS_PATH, await breakGlassRecord());

  const open = resolveDeployedMapRender({ root, now: NOW });
  assert.deepEqual(open.failures, []);
  assert.equal(open.satisfiedBy, "break-glass");
  assert.ok(open.notes.join(" ").includes("Nothing was measured"));

  const expired = resolveDeployedMapRender({ root, now: new Date("2026-09-12T00:00:00Z") });
  assert.equal(expired.satisfiedBy, null);
  assert.ok(expired.failures.some((message) => message.includes("expired at 2026-09-11")));
});

test("a break-glass record cannot be reshaped into something that reads as a measurement", async () => {
  const rewrites = [
    [{ status: "deployed-site-browser-observation" }, "must never read as a measurement"],
    [{ allChecksPassed: true }, "claims allChecksPassed is not false"],
    [{ productionAdmission: true }, "claims productionAdmission is not false"],
    [{ checks: [{ id: "pmtiles-range-responses", pass: true }] }, "nothing was run"],
    [{ siteObservationOwed: false }, "must state siteObservationOwed: true"],
    [{ reason: "no preview origin" }, "not a label"],
    [{ authorizedBy: "  " }, "must name who accepted the debt"],
    [{ sources: [] }, "binds no source files"],
  ];
  for (const [overrides, expected] of rewrites) {
    const failures = validateBreakGlass({ record: await breakGlassRecord(overrides), now: NOW });
    assert.ok(failures.some((message) => message.includes(expected)), `expected ${JSON.stringify(overrides)} to be refused with "${expected}"`);
  }
  assert.deepEqual(validateBreakGlass({ record: await breakGlassRecord(), now: NOW }), []);
});

test("a break-glass record covers the change it names and no later one", async () => {
  const moved = validateBreakGlass({
    record: await breakGlassRecord({ sources: [{ path: "components/explore/ExploreMapClient.tsx", sha256: "0".repeat(64) }] }),
    now: NOW,
  });
  assert.ok(moved.some((message) => message.includes("covers the change it names and no other")));
});

test("a break-glass record cannot be opened for longer than the stated limit", async () => {
  const tooLong = validateBreakGlass({ record: await breakGlassRecord({ settleBy: "2026-10-04T00:00:00Z" }), now: NOW });
  assert.ok(tooLong.some((message) => message.includes(`the limit is ${BREAK_GLASS_MAX_DAYS}`)));

  const backwards = validateBreakGlass({ record: await breakGlassRecord({ settleBy: "2026-09-03T00:00:00Z" }), now: NOW });
  assert.ok(backwards.some((message) => message.includes("not after authorizedAt")));

  const undated = validateBreakGlass({ record: await breakGlassRecord({ authorizedAt: "whenever" }), now: NOW });
  assert.ok(undated.some((message) => message.includes("is not a date")));
});

test("a settled debt has to be deleted rather than left on the branch", async () => {
  // A break-glass left in place would be found and reused by the next stale
  // record, which is exactly the silent waiver the artifact exists to prevent.
  const root = await fixtureRoot();
  await write(root, RENDER_EVIDENCE_PATH, await currentSiteRecord());
  await write(root, BREAK_GLASS_PATH, await breakGlassRecord());
  const settled = resolveDeployedMapRender({ root, now: NOW });
  assert.equal(settled.satisfiedBy, null);
  assert.ok(settled.failures.some((message) => message.includes("already been settled. Delete it")));

  await write(root, RENDER_EVIDENCE_PATH, { ...(await loadRecord()), sources: [{ path: "lib/explore/map-style.ts", sha256: "0".repeat(64) }] });
  await write(root, BRANCH_EVIDENCE_PATH, await branchRecord());
  const superseded = resolveDeployedMapRender({ root, now: NOW });
  assert.equal(superseded.satisfiedBy, null);
  assert.ok(superseded.failures.some((message) => message.includes("is not needed. Delete it")));
});

test("neither weaker tier exists on this branch, so the gate is still the strong one", async () => {
  // If either record is ever committed, this fails and the reviewer reads why.
  for (const relative of [BRANCH_EVIDENCE_PATH, BREAK_GLASS_PATH]) {
    assert.equal(
      existsSync(new URL(`../${relative}`, import.meta.url)),
      false,
      `${relative} is committed; the gate is being answered by something weaker than an observation of the Site`,
    );
  }
});

test("the harness labels a run by the origin it measured, not by the file it is written to", async () => {
  assert.equal(scopeOf("https://www.witnesstree.ca/en/explore"), "deployed-site");
  for (const url of ["https://witnesstree.ca/en/explore", "https://www.witnesstree.ca.example.org/en/explore", "http://www.witnesstree.ca/en/explore", "http://localhost:5173/en/explore", "not-a-url"]) {
    assert.equal(scopeOf(url), "branch-deployment", `${url} must not be labelled a Site observation`);
  }
});
