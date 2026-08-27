import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * A direct database tenant-isolation harness for the Phase 6 criterion
 * "one account cannot read another account's saved areas, proven by a test
 * that attempts it directly against the database".
 *
 * It applies db/postgres/0001-account-tenant-isolation.sql, seeds two accounts,
 * then opens a second connection as the non-superuser application role and
 * attempts cross-tenant reads and writes. Every probe below must refuse.
 *
 * It is fail-closed. With no reachable Postgres it reports NOT EXECUTED and
 * exits 75. It never reports a pass it did not observe, and a pass here is
 * evidence about the policy only, not about hosting, residency, or encryption.
 */

export const MIGRATION_PATH = fileURLToPath(new URL("../db/postgres/0001-account-tenant-isolation.sql", import.meta.url));
export const APP_ROLE = "witness_tree_app";
export const TENANT_SETTING = "witness_tree.account_id";
const UNAVAILABLE = 75;

/** Decides how to reach psql without ever inventing a connection that is not there. */
export function resolvePsqlRunner(env = process.env, hasLocalPsql = () => spawnSync("psql", ["--version"], { stdio: "ignore" }).status === 0) {
  const container = env.WITNESS_TREE_PG_CONTAINER?.trim();
  if (container) {
    return {
      mode: "docker",
      container,
      database: env.WITNESS_TREE_PG_DATABASE?.trim() || "witness_tree_rls",
      adminRole: env.WITNESS_TREE_PG_ADMIN_ROLE?.trim() || "postgres",
      adminPassword: env.WITNESS_TREE_PG_ADMIN_PASSWORD ?? "",
      host: "127.0.0.1",
    };
  }
  const adminUrl = env.WITNESS_TREE_PG_ADMIN_URL?.trim();
  if (adminUrl && hasLocalPsql()) return { mode: "url", adminUrl };
  return {
    mode: "none",
    reason: adminUrl
      ? "WITNESS_TREE_PG_ADMIN_URL is set but the psql client is not on PATH."
      : "No Postgres was offered. Set WITNESS_TREE_PG_CONTAINER for a docker container, or WITNESS_TREE_PG_ADMIN_URL with psql on PATH. scripts/run-postgres-tenant-isolation-drill.sh starts a throwaway container for you.",
  };
}

function appUrl(adminUrl, password) {
  const url = new URL(adminUrl);
  url.username = APP_ROLE;
  url.password = password;
  return url.toString();
}

/** One psql invocation. `role` is "admin" or "app"; the app role is a real second login, not SET ROLE. */
export function psql(runner, role, sql, appPassword) {
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"];
  let command;
  let argv;
  if (runner.mode === "docker") {
    const password = role === "app" ? appPassword : runner.adminPassword;
    command = "docker";
    argv = ["exec", "-i", "-e", `PGPASSWORD=${password}`, runner.container, "psql", ...args, "-h", runner.host, "-U", role === "app" ? APP_ROLE : runner.adminRole, "-d", runner.database];
  } else {
    command = "psql";
    argv = [...args, role === "app" ? appUrl(runner.adminUrl, appPassword) : runner.adminUrl];
  }
  const result = spawnSync(command, argv, { input: sql, encoding: "utf8" });
  return { status: result.status, stdout: (result.stdout ?? "").trim(), stderr: (result.stderr ?? "").trim(), error: result.error };
}

const seed = `
BEGIN;
DELETE FROM witness_tree.alert_history;
DELETE FROM witness_tree.saved_area;
DELETE FROM witness_tree.account;
INSERT INTO witness_tree.account (id, email_address, password_hash, locale, email_verified_at, unsubscribe_token)
VALUES ('account-a', 'a@example.test', 'hash-a', 'en', now(), 'token-a'),
       ('account-b', 'b@example.test', 'hash-b', 'fr', now(), 'token-b');
INSERT INTO witness_tree.saved_area (id, owner_id, geometry, area_square_kilometres, name, note, alert_cadence, alert_locale)
VALUES ('area-a', 'account-a', 'POINT(0 0)', 10, 'A home', 'Illustrative only', 'immediate', 'en'),
       ('area-b', 'account-b', 'POINT(1 1)', 10, 'B home', 'Illustrative only', 'immediate', 'fr');
INSERT INTO witness_tree.alert_history (id, owner_id, sent_at, figure_id, reported)
VALUES ('history-a', 'account-a', now(), 'figure-1', '{"kind":"unknown"}'),
       ('history-b', 'account-b', now(), 'figure-1', '{"kind":"unknown"}');
COMMIT;
`;

const asTenant = (accountId, body) => `BEGIN;\nSET LOCAL ${TENANT_SETTING} = '${accountId}';\n${body}\nCOMMIT;`;

/**
 * Each probe runs as the application role. `expect` is the single value psql
 * must print; `expectRefusal` marks a probe that must make psql fail.
 */
export const ISOLATION_PROBES = Object.freeze([
  { id: "app-role-is-not-privileged", description: "The probing role is neither a superuser nor a BYPASSRLS role", sql: "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user;", expect: "f" },
  { id: "row-security-is-forced", description: "All three account tables have row level security enabled and forced", sql: "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'witness_tree' AND c.relrowsecurity AND c.relforcerowsecurity;", expect: "3" },
  { id: "saved-area-cross-tenant-read", description: "Account A reading account B's saved areas returns nothing", sql: asTenant("account-a", "SELECT count(*) FROM witness_tree.saved_area WHERE owner_id = 'account-b';"), expect: "0" },
  { id: "saved-area-unfiltered-read", description: "An unfiltered select as account A returns only account A's saved areas", sql: asTenant("account-a", "SELECT string_agg(id, ',' ORDER BY id) FROM witness_tree.saved_area;"), expect: "area-a" },
  { id: "saved-area-geometry-not-readable", description: "Account A cannot read the geometry of account B's saved area by primary key", sql: asTenant("account-a", "SELECT count(*) FROM witness_tree.saved_area WHERE id = 'area-b';"), expect: "0" },
  { id: "alert-history-cross-tenant-read", description: "Account A reading account B's alert history returns nothing", sql: asTenant("account-a", "SELECT count(*) FROM witness_tree.alert_history WHERE owner_id = 'account-b';"), expect: "0" },
  { id: "account-cross-tenant-read", description: "Account A cannot read account B's account row", sql: asTenant("account-a", "SELECT count(*) FROM witness_tree.account WHERE id = 'account-b';"), expect: "0" },
  { id: "no-tenant-set-reads-nothing", description: "A session that never sets a tenant reads no rows at all", sql: "SELECT count(*) FROM witness_tree.saved_area;", expect: "0" },
  { id: "blank-tenant-reads-nothing", description: "A blank tenant setting reads no rows rather than every row", sql: asTenant("", "SELECT count(*) FROM witness_tree.saved_area;"), expect: "0" },
  { id: "saved-area-cross-tenant-update", description: "Account A updating account B's saved area changes no rows", sql: asTenant("account-a", "WITH changed AS (UPDATE witness_tree.saved_area SET note = 'tampered' WHERE owner_id = 'account-b' RETURNING 1) SELECT count(*) FROM changed;"), expect: "0" },
  { id: "saved-area-cross-tenant-delete", description: "Account A deleting account B's saved area removes no rows", sql: asTenant("account-a", "WITH removed AS (DELETE FROM witness_tree.saved_area WHERE owner_id = 'account-b' RETURNING 1) SELECT count(*) FROM removed;"), expect: "0" },
  { id: "saved-area-cross-tenant-insert", description: "Account A inserting a saved area owned by account B is refused", sql: asTenant("account-a", "INSERT INTO witness_tree.saved_area (id, owner_id, geometry) VALUES ('planted', 'account-b', 'POINT(2 2)');"), expectRefusal: /row-level security policy/i },
  { id: "saved-area-cross-tenant-reassign", description: "Account A moving its own saved area to account B is refused", sql: asTenant("account-a", "UPDATE witness_tree.saved_area SET owner_id = 'account-b' WHERE id = 'area-a';"), expectRefusal: /row-level security policy/i },
  { id: "policy-cannot-be-disabled", description: "The application role cannot disable row level security on the saved areas", sql: "ALTER TABLE witness_tree.saved_area DISABLE ROW LEVEL SECURITY;", expectRefusal: /must be owner|permission denied/i },
  { id: "escalation-refused", description: "The application role cannot grant itself the bypass attribute", sql: `ALTER ROLE ${APP_ROLE} BYPASSRLS;`, expectRefusal: /permission denied|must be superuser/i },
  // Counting rows is not enough. A run that deleted account B's area and
  // reassigned account A's onto B would still count one row, so this probe
  // names the surviving row by identity: exactly area-b, unplanted and intact.
  { id: "victim-rows-survive", description: "After every attempt, account B holds exactly its own saved area, unchanged and with nothing planted", sql: asTenant("account-b", "SELECT string_agg(id || ':' || coalesce(note, 'null'), ',' ORDER BY id) FROM witness_tree.saved_area;"), expect: "area-b:Illustrative only" },
  { id: "victim-history-survives", description: "After every attempt, account B holds exactly its own alert history row", sql: asTenant("account-b", "SELECT string_agg(id, ',' ORDER BY id) FROM witness_tree.alert_history;"), expect: "history-b" },
]);

export async function runPostgresTenantIsolationDrill(runner = resolvePsqlRunner()) {
  if (runner.mode === "none") return { executed: false, reason: runner.reason, probes: [] };
  const appPassword = randomBytes(24).toString("hex");
  const migration = readFileSync(MIGRATION_PATH, "utf8");
  const setup = [
    { label: "apply the migration", sql: migration },
    { label: "grant the application role a temporary login", sql: `ALTER ROLE ${APP_ROLE} LOGIN PASSWORD '${appPassword}';` },
    { label: "seed two tenants", sql: seed },
  ];
  for (const step of setup) {
    const outcome = psql(runner, "admin", step.sql);
    if (outcome.error) return { executed: false, reason: `Could not ${step.label}: ${outcome.error.message}`, probes: [] };
    if (outcome.status !== 0) return { executed: false, reason: `Could not ${step.label}: ${outcome.stderr || `psql exited ${outcome.status}`}`, probes: [] };
  }

  const probes = [];
  try {
    for (const probe of ISOLATION_PROBES) {
      const outcome = psql(runner, "app", probe.sql, appPassword);
      if (probe.expectRefusal) {
        const refused = outcome.status !== 0 && probe.expectRefusal.test(outcome.stderr);
        probes.push({ id: probe.id, description: probe.description, passed: refused, observed: outcome.status === 0 ? "the attempt succeeded" : outcome.stderr.split("\n")[0] });
      } else {
        const passed = outcome.status === 0 && outcome.stdout === probe.expect;
        probes.push({ id: probe.id, description: probe.description, passed, observed: outcome.status === 0 ? outcome.stdout : outcome.stderr.split("\n")[0], expected: probe.expect });
      }
    }
  } finally {
    psql(runner, "admin", `ALTER ROLE ${APP_ROLE} NOLOGIN PASSWORD NULL;`);
  }
  return { executed: true, probes, passed: probes.every((probe) => probe.passed) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runPostgresTenantIsolationDrill();
  if (!result.executed) {
    console.error(`NOT EXECUTED: direct database tenant isolation was not proven. ${result.reason}`);
    process.exit(UNAVAILABLE);
  }
  for (const probe of result.probes) console.log(`${probe.passed ? "held" : "FAILED"}: ${probe.id} (${probe.description}); observed ${JSON.stringify(probe.observed)}`);
  console.log(`Direct database tenant isolation: ${result.probes.filter((probe) => probe.passed).length}/${result.probes.length} probes held.`);
  console.log("This is policy evidence from a local Postgres only. It says nothing about Canadian residency, encryption at rest, or a provisioned managed service.");
  process.exit(result.passed ? 0 : 1);
}
