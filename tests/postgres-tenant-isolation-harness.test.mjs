import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APP_ROLE,
  ISOLATION_PROBES,
  MIGRATION_PATH,
  TENANT_SETTING,
  resolvePsqlRunner,
  runPostgresTenantIsolationDrill,
} from "../scripts/check-postgres-tenant-isolation.mjs";

// These tests are about the harness, not about a database. They cannot and do
// not prove tenant isolation; only running the drill against a real Postgres
// does that. What they do prove is that the harness refuses to claim a pass it
// never observed, and that the migration it applies leaves no way past the
// policies.

const migration = readFileSync(MIGRATION_PATH, "utf8");

test("with no Postgres offered the harness reports not executed rather than passing", async () => {
  const runner = resolvePsqlRunner({}, () => true);
  assert.equal(runner.mode, "none");
  const result = await runPostgresTenantIsolationDrill(runner);
  assert.equal(result.executed, false);
  assert.equal(result.passed, undefined, "An unrun drill has no pass or fail; it has no result at all.");
  assert.match(result.reason, /No Postgres was offered/);
});

test("an admin url without a psql client is refused instead of quietly skipped", () => {
  const runner = resolvePsqlRunner({ WITNESS_TREE_PG_ADMIN_URL: "postgres://postgres@127.0.0.1/witness_tree_rls" }, () => false);
  assert.equal(runner.mode, "none");
  assert.match(runner.reason, /psql client is not on PATH/);
});

test("a named container is used directly, because docker exec needs no local psql", () => {
  const runner = resolvePsqlRunner({ WITNESS_TREE_PG_CONTAINER: "drill", WITNESS_TREE_PG_ADMIN_PASSWORD: "secret" }, () => false);
  assert.equal(runner.mode, "docker");
  assert.equal(runner.container, "drill");
  assert.equal(runner.database, "witness_tree_rls");
  assert.equal(runner.adminRole, "postgres");
});

test("the migration forces row level security and denies the application role every escape", () => {
  for (const table of ["account", "saved_area", "alert_history"]) {
    assert.match(migration, new RegExp(`ALTER TABLE witness_tree\\.${table} ENABLE ROW LEVEL SECURITY;`));
    assert.match(migration, new RegExp(`ALTER TABLE witness_tree\\.${table} FORCE ROW LEVEL SECURITY;`), "ENABLE without FORCE lets the table owner read every row.");
  }
  assert.match(migration, new RegExp(`CREATE ROLE ${APP_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS`), "A superuser or BYPASSRLS prober would walk past every policy and prove nothing.");
  assert.match(migration, /nullif\(current_setting\('witness_tree\.account_id', true\), ''\)/, "An unset tenant must resolve to NULL so a forgetful session reads nothing.");
  assert.doesNotMatch(migration, /GRANT[^;]*TO PUBLIC/i);
  assert.doesNotMatch(migration, /PASSWORD\s+'/i, "A credential never belongs in a checked-in migration.");
});

test("every policy pairs a read filter with a write filter, so a row cannot be pushed across tenants", () => {
  const policies = migration.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
  assert.equal(policies.length, 3);
  for (const policy of policies) {
    assert.match(policy, /USING \((?:id|owner_id) = witness_tree\.current_account_id\(\)\)/);
    assert.match(policy, /WITH CHECK \((?:id|owner_id) = witness_tree\.current_account_id\(\)\)/);
    assert.match(policy, new RegExp(`FOR ALL TO ${APP_ROLE}`));
  }
});

test("the probe set covers reads, writes, an unset tenant, and privilege escalation", () => {
  const ids = ISOLATION_PROBES.map((probe) => probe.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const required of [
    "app-role-is-not-privileged",
    "row-security-is-forced",
    "saved-area-cross-tenant-read",
    "saved-area-unfiltered-read",
    "alert-history-cross-tenant-read",
    "account-cross-tenant-read",
    "no-tenant-set-reads-nothing",
    "blank-tenant-reads-nothing",
    "saved-area-cross-tenant-update",
    "saved-area-cross-tenant-delete",
    "saved-area-cross-tenant-insert",
    "saved-area-cross-tenant-reassign",
    "policy-cannot-be-disabled",
    "escalation-refused",
    "victim-rows-survive",
    "victim-history-survives",
  ]) {
    assert.ok(ids.includes(required), `${required} is missing from the probe set`);
  }
  for (const probe of ISOLATION_PROBES) {
    assert.ok(probe.description.trim().length > 0);
    const outcome = probe.expectRefusal ? "refusal" : probe.expect;
    assert.notEqual(outcome, undefined, `${probe.id} states no expected outcome, so it could never fail`);
  }
  assert.ok(ISOLATION_PROBES.some((probe) => probe.sql.includes(`SET LOCAL ${TENANT_SETTING}`)));
});

test("the surviving-row probes name the row by identity, because a row count can be satisfied by a planted row", () => {
  for (const id of ["victim-rows-survive", "victim-history-survives"]) {
    const probe = ISOLATION_PROBES.find((candidate) => candidate.id === id);
    assert.ok(probe, `${id} is missing`);
    assert.doesNotMatch(probe.sql, /count\(\*\)/, "A count would still read as one row after B's row was deleted and A's was reassigned onto B.");
    assert.match(probe.expect, /^(area|history)-b/);
  }
});
