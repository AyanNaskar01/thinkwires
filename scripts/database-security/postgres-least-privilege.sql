-- ============================================================================
-- Thinkwires ATS: PostgreSQL Least-Privilege Role Provisioning Script
-- Reference: CIS PostgreSQL Benchmark & Principle of Least Privilege
-- ============================================================================
-- Run this script as 'postgres' superuser during initial infrastructure provisioning.
-- Do NOT run application services using the 'postgres' superuser.
-- ============================================================================

-- 1. Create Application Database (if not existing)
SELECT 'CREATE DATABASE thinkwire_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'thinkwire_db')\gexec

\connect thinkwire_db

-- Revoke default public schema creation privilege (PostgreSQL 15+ best practice)
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- 2. Read-Write Application User (app_rw_user)
-- Used by primary application backend containers for transactional writes.
-- Permissions: SELECT, INSERT, UPDATE, DELETE on application tables only.
-- Explicitly stripped of SUPERUSER, CREATEDB, and CREATEROLE.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_rw_user') THEN
    CREATE ROLE app_rw_user WITH
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      PASSWORD 'CHANGE_ME_IN_PRODUCTION_SECURE_VAULT_PW_1';
  END IF;
END $$;

-- Grant schema usage
GRANT USAGE, CREATE ON SCHEMA public TO app_rw_user;

-- Grant table privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw_user;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_rw_user;

-- Ensure future migrations grant privileges automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_rw_user;

-- ----------------------------------------------------------------------------
-- 3. Read-Only Analytical User (app_ro_user)
-- Used by read replicas, analytical queries, ETL pipelines, and health probes.
-- Permissions: SELECT only. Cannot alter, insert, update, or delete data.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_ro_user') THEN
    CREATE ROLE app_ro_user WITH
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      PASSWORD 'CHANGE_ME_IN_PRODUCTION_SECURE_VAULT_PW_2';
  END IF;
END $$;

-- Grant read-only access
GRANT USAGE ON SCHEMA public TO app_ro_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_ro_user;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO app_ro_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO app_ro_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO app_ro_user;

-- ----------------------------------------------------------------------------
-- 4. Verification Check
-- ----------------------------------------------------------------------------
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolinherit, rolcanlogin
FROM pg_roles
WHERE rolname IN ('app_rw_user', 'app_ro_user');
