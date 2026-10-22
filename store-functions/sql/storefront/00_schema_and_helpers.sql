-- =====================================================================================
-- LAKSHMI SAREES DATABASE  (run order: 00, 01, 01a, 02 ... 09, then optionally 90_seed)
-- =====================================================================================
-- Target: Firebase SQL Connect (formerly Data Connect) = managed Cloud SQL for PostgreSQL (15+).
-- ONE database for the whole project, two Postgres schemas:
--   store  the storefront (catalog, CMS, carts, orders, customers, ...)
--   pos    the shop's inventory + billing (products, bills, bill_items): 01a_pos_inventory_billing.sql
-- The only coupling is store.variant_inventory_items -> pos.products(id): web and shop share one stock pool.
--
-- Access model: the Next.js app never talks to the database. Only the cloud functions do, connecting as
-- the Cloud SQL IAM role `app_functions` (09_grants.sql), and they enforce ownership (customer_id = caller)
-- themselves. Identity is Firebase Auth: functions verify the Firebase ID token and map its uid through
-- store.customer_identities (customers) or store.staff_users (founder/salesman/admin). There is no
-- PostgREST/Supabase layer, so nothing here is reachable except through the functions.
--
-- Money: NUMERIC(12,2) in INR. Timestamps: TIMESTAMPTZ. "Business day" = Asia/Kolkata.
-- Re-runnable: everything is IF NOT EXISTS / CREATE OR REPLACE / guarded DO blocks.
-- All extensions below are on Cloud SQL for PostgreSQL's supported list.

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive emails
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- fuzzy product search

CREATE SCHEMA IF NOT EXISTS store;

-- Generic updated_at maintenance, reused by every table that has the column.
CREATE OR REPLACE FUNCTION store.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- Idempotent helper: attach the touch trigger to a table that has an updated_at column.
CREATE OR REPLACE FUNCTION store.add_touch_trigger(p_table regclass)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  trg TEXT := 'trg_touch_' || replace(p_table::TEXT, '.', '_');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = trg AND tgrelid = p_table) THEN
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION store.touch_updated_at()',
      trg, p_table);
  END IF;
END;
$$;

-- Enumerations (mirror the TypeScript unions in sareestorefront/lib/types.ts).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'store' AND t.typname = 'order_status') THEN
    -- 'pending_payment' is new (checkout does not exist yet); the other six are the UI statuses.
    CREATE TYPE store.order_status AS ENUM
      ('pending_payment','placed','processing','shipped','delivered','cancelled','returned');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'store' AND t.typname = 'payment_status') THEN
    CREATE TYPE store.payment_status AS ENUM
      ('pending','authorized','captured','failed','refunded','partially_refunded');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'store' AND t.typname = 'content_status') THEN
    CREATE TYPE store.content_status AS ENUM ('draft','published','archived');
  END IF;
END
$$;
