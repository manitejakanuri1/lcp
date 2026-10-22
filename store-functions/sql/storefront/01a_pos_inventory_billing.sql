-- =====================================================================================
-- POS: SHOP INVENTORY, BILLING, ANALYTICS  (schema `pos`)
-- =====================================================================================
-- Migrated from the Supabase `public.products / bills / bill_items` (sql_schema_fixed) so the whole
-- project lives in one Cloud SQL database. Column names are unchanged, so existing rows copy across
-- 1:1 (see design_docs/plans/08-firebase-sql-migration-plan.md §6). What changed:
--   * `profiles` / auth.users are gone: salesman_id and created_by point at store.staff_users (Firebase uid).
--   * Money is NUMERIC(12,2) (was DECIMAL(10,2)).
--   * Bill numbers come from an atomic per-day counter (was COUNT(*)+1, which collides under concurrency).
--   * pos.create_bill() does "claim pieces -> insert bill -> insert items" in ONE transaction, replacing the
--     claim / unclaim / delete-the-header compensation code in billing-create.
--   * Analytics use range predicates on created_at (indexable) and group by the Asia/Kolkata business day.
--   * The mark_product_sold trigger is dropped: create_bill is the only writer that flips status.
-- Must run after 01 (needs store.staff_users) and before 02 (store.* references pos.products).

CREATE SCHEMA IF NOT EXISTS pos;

CREATE TABLE IF NOT EXISTS pos.products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku           TEXT NOT NULL UNIQUE,                       -- UNIQUE index serves inventory-product-get?sku=
  vendor_name   TEXT NOT NULL,
  purchase_date DATE NOT NULL,
  cost_price    NUMERIC(12,2) NOT NULL CHECK (cost_price >= 0),
  selling_price NUMERIC(12,2) NOT NULL CHECK (selling_price >= 0),
  saree_type    TEXT NOT NULL,
  material      TEXT NOT NULL,
  color         TEXT,
  rack_location TEXT,
  image_url     TEXT,
  status        TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','sold')),
  created_by    UUID REFERENCES store.staff_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT store.add_touch_trigger('pos.products');

-- inventory-products-search: filters on status / price, orders by created_at DESC, plus
-- `q` = ILIKE '%text%' OR-ed over sku, saree_type, material, color. A btree cannot serve a leading-wildcard
-- ILIKE; pg_trgm GIN can (Postgres BitmapOr's the four). The same indexes also serve the exact-ish
-- `color` / `sareeType` ILIKE filters.
CREATE INDEX IF NOT EXISTS idx_pos_products_status_created ON pos.products(status, created_at DESC);  -- status filter + order
CREATE INDEX IF NOT EXISTS idx_pos_products_created        ON pos.products(created_at DESC);          -- unfiltered list
CREATE INDEX IF NOT EXISTS idx_pos_products_price          ON pos.products(selling_price);            -- minPrice / maxPrice
CREATE INDEX IF NOT EXISTS idx_pos_products_sku_trgm       ON pos.products USING GIN (sku gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pos_products_type_trgm      ON pos.products USING GIN (saree_type gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pos_products_material_trgm  ON pos.products USING GIN (material gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pos_products_color_trgm     ON pos.products USING GIN (color gin_trgm_ops);
-- Not indexed on purpose: created_by (staff rows are never hard-deleted), purchase_date, vendor_name
-- (founder-only, never filtered by any function).

-- Salesmen read this view: no vendor_name / cost_price / purchase_date / created_by.
CREATE OR REPLACE VIEW pos.products_salesman AS
SELECT id, sku, saree_type, material, color, selling_price, rack_location, image_url, status, created_at
FROM pos.products;

CREATE TABLE IF NOT EXISTS pos.bills (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number    TEXT NOT NULL UNIQUE,                      -- UNIQUE index serves billing-get?billNumber=
  customer_name  TEXT,
  customer_phone TEXT,
  salesman_id    UUID REFERENCES store.staff_users(id) ON DELETE SET NULL,
  total_amount   NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  total_cost     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','card','upi')),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- billing-list (founder): date range, newest first          -> created_at DESC
-- billing-list (salesman / ?salesmanId=): own bills by date  -> (salesman_id, created_at DESC)
-- get_analytics_summary / get_daily_sales: created_at range  -> created_at DESC (also scanned backwards)
CREATE INDEX IF NOT EXISTS idx_pos_bills_created          ON pos.bills(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_bills_salesman_created ON pos.bills(salesman_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pos.bill_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id       UUID NOT NULL REFERENCES pos.bills(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES pos.products(id) ON DELETE RESTRICT,
  selling_price NUMERIC(12,2) NOT NULL CHECK (selling_price >= 0),   -- snapshot at sale time
  cost_price    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_bill_items_bill    ON pos.bill_items(bill_id);      -- billing-get embeds items
CREATE INDEX IF NOT EXISTS idx_pos_bill_items_product ON pos.bill_items(product_id);   -- FK check on product delete; sale history
-- Deliberately NOT unique on product_id: a returned piece is restocked (status back to 'available') and can be sold again.

-- ---------- Bill numbers: B-YYYYMMDD-NNNN, one counter row per business day ----------
CREATE TABLE IF NOT EXISTS pos.bill_counters (
  day  DATE PRIMARY KEY,
  last INT NOT NULL DEFAULT 0
);

-- Atomic: concurrent callers serialise on the day's row and each gets a distinct number, so the
-- 5-attempt DUPLICATE_BILL_NUMBER retry loop in billing-create is no longer needed.
CREATE OR REPLACE FUNCTION pos.generate_bill_number()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  d DATE := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
  n INT;
BEGIN
  INSERT INTO pos.bill_counters(day, last) VALUES (d, 1)
  ON CONFLICT (day) DO UPDATE SET last = pos.bill_counters.last + 1
  RETURNING last INTO n;
  RETURN 'B-' || TO_CHAR(d, 'YYYYMMDD') || '-' || LPAD(n::TEXT, 4, '0');
END;
$$;

-- ---------- billing-create in one transaction ----------
-- p_items = [{"product_id": "<uuid>", "selling_price": 12500 (optional)}, ...]  (function validates shape,
-- dedupes ids, and checks the caller's role first). Raises, with SQLSTATE P0001 and the code as message:
--   PRODUCT_NOT_FOUND     an id does not exist
--   PRODUCT_ALREADY_SOLD  a piece is sold OR held by an unpaid web order (Q1: a held web order blocks a counter sale)
-- Any raise rolls everything back, so there is nothing to "unclaim".
CREATE OR REPLACE FUNCTION pos.create_bill(
  p_salesman        UUID,
  p_customer_name   TEXT,
  p_customer_phone  TEXT,
  p_payment_method  TEXT,
  p_notes           TEXT,
  p_items           JSONB
) RETURNS pos.bills LANGUAGE plpgsql AS $$
DECLARE
  v_ids     UUID[];
  v_claimed INT;
  v_bill    pos.bills;
BEGIN
  SELECT ARRAY(SELECT (e->>'product_id')::UUID FROM jsonb_array_elements(p_items) e) INTO v_ids;
  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT COUNT(*) FROM pos.products WHERE id = ANY(v_ids)) <> array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Claim: one atomic conditional UPDATE. Of two concurrent bills for the same piece, exactly one matches.
  UPDATE pos.products p SET status = 'sold'
   WHERE p.id = ANY(v_ids)
     AND p.status = 'available'
     AND NOT EXISTS (SELECT 1 FROM store.inventory_reservations r
                      WHERE r.inventory_product_id = p.id AND r.expires_at > NOW());
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed <> array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'PRODUCT_ALREADY_SOLD' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO pos.bills(bill_number, customer_name, customer_phone, salesman_id,
                        total_amount, total_cost, payment_method, notes)
  SELECT pos.generate_bill_number(), p_customer_name, p_customer_phone, p_salesman,
         ROUND(SUM(COALESCE((e->>'selling_price')::NUMERIC, p.selling_price)), 2),
         ROUND(SUM(p.cost_price), 2),
         COALESCE(p_payment_method, 'cash'), p_notes
    FROM jsonb_array_elements(p_items) e
    JOIN pos.products p ON p.id = (e->>'product_id')::UUID
  RETURNING * INTO v_bill;

  INSERT INTO pos.bill_items(bill_id, product_id, selling_price, cost_price)
  SELECT v_bill.id, p.id, COALESCE((e->>'selling_price')::NUMERIC, p.selling_price), p.cost_price
    FROM jsonb_array_elements(p_items) e
    JOIN pos.products p ON p.id = (e->>'product_id')::UUID;

  RETURN v_bill;
END;
$$;

-- ---------- Analytics (founder only; the function checks the role) ----------
-- Range predicates on created_at instead of created_at::DATE >= x, so idx_pos_bills_created is usable.
-- Dates are Asia/Kolkata calendar days. total_items_sold / total_items_in_stock are NOT date-filtered (as before).
CREATE OR REPLACE FUNCTION pos.get_analytics_summary(p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL)
RETURNS TABLE (total_sales NUMERIC, total_cost NUMERIC, total_profit NUMERIC,
               total_items_sold BIGINT, total_items_in_stock BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(b.total_amount), 0),
         COALESCE(SUM(b.total_cost), 0),
         COALESCE(SUM(b.total_amount - b.total_cost), 0),
         (SELECT COUNT(*) FROM pos.products WHERE status = 'sold'),
         (SELECT COUNT(*) FROM pos.products WHERE status = 'available')
    FROM pos.bills b
   WHERE (p_from IS NULL OR b.created_at >= (p_from::TIMESTAMP AT TIME ZONE 'Asia/Kolkata'))
     AND (p_to   IS NULL OR b.created_at <  ((p_to + 1)::TIMESTAMP AT TIME ZONE 'Asia/Kolkata'));
$$;

CREATE OR REPLACE FUNCTION pos.get_daily_sales(p_days_back INT DEFAULT 30)
RETURNS TABLE (sale_date DATE, total_amount NUMERIC, total_profit NUMERIC, bill_count BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT (b.created_at AT TIME ZONE 'Asia/Kolkata')::DATE,
         SUM(b.total_amount),
         SUM(b.total_amount - b.total_cost),
         COUNT(*)
    FROM pos.bills b
   WHERE b.created_at >= NOW() - make_interval(days => p_days_back)
   GROUP BY 1
   ORDER BY 1 DESC;
$$;
