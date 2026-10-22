-- =====================================================================================
-- ROLES & GRANTS  (Cloud SQL for PostgreSQL)
-- =====================================================================================
-- Customers and staff are Firebase Auth users, not database users, and the browser never opens a database
-- connection. The ONLY database principal is the cloud functions' service account, connecting through the
-- Cloud SQL connector with IAM database authentication. So there is no per-row RLS to maintain: access control
-- is (1) network/IAM - only that service account can connect, and (2) the functions scoping every query by the
-- verified Firebase uid (customer_id = caller), as tech_req §2.4 requires.
--
-- One-time, outside SQL (the service account becomes a database user):
--   gcloud sql users create <SA_NAME>@<PROJECT>.iam --instance=<INSTANCE> --type=cloud_iam_service_account
--   -- then, in psql as a superuser:  GRANT app_functions TO "<SA_NAME>@<PROJECT>.iam";
-- If Firebase SQL Connect is also deployed against this database, grant it the same group (its service
-- account is listed by `firebase dataconnect:sql:grant`) rather than widening anything here.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_functions') THEN
    CREATE ROLE app_functions NOLOGIN;
  END IF;
END
$$;

-- Nothing is public. Every table is created by the migration owner, so revoke defaults and grant explicitly.
REVOKE ALL ON SCHEMA store, pos FROM PUBLIC;
REVOKE ALL ON ALL TABLES    IN SCHEMA store, pos FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA store, pos FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA store, pos FROM PUBLIC;

GRANT USAGE ON SCHEMA store, pos TO app_functions;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA store, pos TO app_functions;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA store, pos TO app_functions;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA store, pos TO app_functions;

-- Append-only tables: the functions may add rows but never rewrite history.
REVOKE UPDATE, DELETE ON store.audit_log, store.order_status_history, store.content_revisions FROM app_functions;
-- Immutable ledger of sales: bills are never edited or removed through the app.
REVOKE UPDATE, DELETE ON pos.bills, pos.bill_items FROM app_functions;

-- Tables created by later migrations get the same treatment.
ALTER DEFAULT PRIVILEGES IN SCHEMA store, pos GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_functions;
ALTER DEFAULT PRIVILEGES IN SCHEMA store, pos GRANT USAGE, SELECT ON SEQUENCES TO app_functions;
ALTER DEFAULT PRIVILEGES IN SCHEMA store, pos GRANT EXECUTE ON FUNCTIONS TO app_functions;
