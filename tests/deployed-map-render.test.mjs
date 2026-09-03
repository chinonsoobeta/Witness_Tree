import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  DEPLOYED_ORIGIN,
  RENDER_EVIDENCE_PATH,
  RENDER_EVIDENCE_SCHEMA,
  validateDeployedMapRender,
} from "../scripts/check-deployed-map-render.mjs";

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
  // The Site was redeployed to this branch on 2026-09-03 and the harness was
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
