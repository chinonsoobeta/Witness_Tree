-- Witness Tree account tenant isolation, expressed as database policy.
--
-- Plan section 10.4 requires "row level security in the database so one account
-- cannot read another account's saved areas, enforced at the database, not in
-- application code". The owner filters in lib/accounts/policy.ts are an
-- application filter and cannot satisfy that requirement. This file is the
-- database half.
--
-- What running this file proves: the policies below refuse cross-tenant reads
-- and writes for a non-superuser role. What it does not prove: that a managed
-- Canadian database exists, that it is hosted in Canada, that geometries are
-- encrypted at rest, or that any of this has been provisioned. Those are
-- separate, external, and still open.

CREATE SCHEMA IF NOT EXISTS witness_tree;

-- The application connects as this role and only as this role. NOSUPERUSER and
-- NOBYPASSRLS are load bearing: Postgres lets a superuser and any BYPASSRLS
-- role walk straight past every policy below, so a harness that connects as
-- one proves nothing. No password is set here; a credential never belongs in a
-- checked-in migration.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'witness_tree_app') THEN
    CREATE ROLE witness_tree_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  ELSE
    ALTER ROLE witness_tree_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$role$;

-- The tenant identity for the current transaction. An unset or blank setting
-- resolves to NULL, every policy comparison against NULL is NULL, and NULL is
-- not true, so a session that forgets to set the tenant sees nothing. That is
-- the intended failure direction.
CREATE OR REPLACE FUNCTION witness_tree.current_account_id() RETURNS text
  LANGUAGE sql STABLE
  AS $fn$ SELECT nullif(current_setting('witness_tree.account_id', true), '') $fn$;

CREATE TABLE IF NOT EXISTS witness_tree.account (
  id text PRIMARY KEY,
  email_address text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('en', 'fr')),
  email_verified_at timestamptz,
  consent_wording text,
  consented_at timestamptz,
  unsubscribe_token text NOT NULL UNIQUE,
  unsubscribed_at timestamptz,
  deletion_requested_at timestamptz
);

CREATE TABLE IF NOT EXISTS witness_tree.saved_area (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES witness_tree.account (id) ON DELETE CASCADE,
  geometry text NOT NULL,
  radius_kilometres double precision,
  area_square_kilometres double precision,
  alert_preferences text[] NOT NULL DEFAULT '{}',
  name text,
  note text,
  alert_cadence text CHECK (alert_cadence IN ('immediate', 'daily-digest', 'weekly-digest', 'monthly-digest')),
  alert_locale text CHECK (alert_locale IN ('en', 'fr'))
);

CREATE TABLE IF NOT EXISTS witness_tree.alert_history (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES witness_tree.account (id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL,
  figure_id text NOT NULL,
  reported jsonb NOT NULL,
  data_version text
);

CREATE INDEX IF NOT EXISTS saved_area_owner_id_idx ON witness_tree.saved_area (owner_id);
CREATE INDEX IF NOT EXISTS alert_history_owner_id_idx ON witness_tree.alert_history (owner_id);

-- ENABLE alone is not enough. Without FORCE, the table owner reads every row,
-- and the migration runner is usually the table owner.
ALTER TABLE witness_tree.account ENABLE ROW LEVEL SECURITY;
ALTER TABLE witness_tree.account FORCE ROW LEVEL SECURITY;
ALTER TABLE witness_tree.saved_area ENABLE ROW LEVEL SECURITY;
ALTER TABLE witness_tree.saved_area FORCE ROW LEVEL SECURITY;
ALTER TABLE witness_tree.alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE witness_tree.alert_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_own_row ON witness_tree.account;
CREATE POLICY account_own_row ON witness_tree.account
  FOR ALL TO witness_tree_app
  USING (id = witness_tree.current_account_id())
  WITH CHECK (id = witness_tree.current_account_id());

DROP POLICY IF EXISTS saved_area_own_rows ON witness_tree.saved_area;
CREATE POLICY saved_area_own_rows ON witness_tree.saved_area
  FOR ALL TO witness_tree_app
  USING (owner_id = witness_tree.current_account_id())
  WITH CHECK (owner_id = witness_tree.current_account_id());

DROP POLICY IF EXISTS alert_history_own_rows ON witness_tree.alert_history;
CREATE POLICY alert_history_own_rows ON witness_tree.alert_history
  FOR ALL TO witness_tree_app
  USING (owner_id = witness_tree.current_account_id())
  WITH CHECK (owner_id = witness_tree.current_account_id());

REVOKE ALL ON SCHEMA witness_tree FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA witness_tree FROM PUBLIC;
GRANT USAGE ON SCHEMA witness_tree TO witness_tree_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON witness_tree.account, witness_tree.saved_area, witness_tree.alert_history TO witness_tree_app;
