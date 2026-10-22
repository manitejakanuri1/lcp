-- =====================================================================================
-- AUTH SUPPORT, SHIPPING, TAX, AUDIT, CONCURRENCY HELPERS
-- =====================================================================================
-- Added after the Phase 1/2 review (design_docs/phase1-review.md, phase2-auth-design.md). Closes
-- the gaps between the existing tables and a complete shop:
--   * interim sign-in for the single dummy customer  (customer_credentials, customer_sessions, auth_events)
--   * shipping charges that are data, not code        (shipping_methods, shipping_rates)
--   * GST that is data, not code                      (tax_rules)
--   * a place for the "contact us" form and an audit trail (contact_messages, audit_log)
--   * the race-free helpers the functions need         (hit_rate_limit, redeem_promotion, expire_unpaid_orders)
-- Run after 07 and before 09 (09 enables RLS on everything in this schema).
-- Re-runnable.

-- ---------- Interim authentication (DELETE these three when the identity provider lands) ----------
-- Passwords are hashed by the cloud functions (scrypt, see src/shared/password.ts). Once an identity
-- platform owns credentials, drop customer_credentials; customer_identities (01) already maps the
-- provider's user id to a customer.
CREATE TABLE IF NOT EXISTS store.customer_credentials (
  customer_id     UUID PRIMARY KEY REFERENCES store.customers(id) ON DELETE CASCADE,
  password_hash   TEXT NOT NULL,                     -- 'scrypt$N$r$p$salt$hash'; never the password
  password_set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per issued access token (its `jti`). Lets logout / "sign out everywhere" / a blocked account
-- revoke tokens before they expire. The function checks revoked_at only when this table is in use.
CREATE TABLE IF NOT EXISTS store.customer_sessions (
  jti         UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES store.customers(id) ON DELETE CASCADE,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  user_agent  TEXT,
  ip_hash     TEXT                                   -- hashed, never the raw address
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer ON store.customer_sessions(customer_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expiry ON store.customer_sessions(expires_at);
-- logout-all / blocked account: revoke by customer; jti PK serves per-request validation

-- Security log of sign-in outcomes (also the durable source for per-email lockout / alerting).
CREATE TABLE IF NOT EXISTS store.auth_events (
  id          BIGSERIAL PRIMARY KEY,
  customer_id UUID REFERENCES store.customers(id) ON DELETE SET NULL,
  email_tried CITEXT,
  event       TEXT NOT NULL CHECK (event IN ('login_success','login_failure','login_throttled','logout','session_revoked')),
  ip_hash     TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_events_email ON store.auth_events(email_tried, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_customer ON store.auth_events(customer_id, created_at DESC);
-- per-IP lockout window (auth-login throttling backed by the database)
CREATE INDEX IF NOT EXISTS idx_auth_events_ip ON store.auth_events(ip_hash, created_at DESC) WHERE ip_hash IS NOT NULL;

-- Right-to-erasure support: orders are kept (tax records, FK RESTRICT) but the customer is anonymised.
ALTER TABLE store.customers ADD COLUMN IF NOT EXISTS anonymised_at TIMESTAMPTZ;

-- ---------- Shipping ----------
-- Replaces the Rs 150 / free-above-Rs 2,999 rule that is hard-coded in the mocks. The free threshold
-- itself stays in site_settings.free_shipping_threshold; a rate row with flat_rate 0 expresses it per method.
CREATE TABLE IF NOT EXISTS store.shipping_methods (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         CITEXT NOT NULL UNIQUE,               -- 'standard' | 'express' | ...
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  est_days_min INT NOT NULL DEFAULT 3 CHECK (est_days_min >= 0),
  est_days_max INT NOT NULL DEFAULT 7 CHECK (est_days_max >= est_days_min),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT store.add_touch_trigger('store.shipping_methods');

CREATE TABLE IF NOT EXISTS store.shipping_rates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method_id    UUID NOT NULL REFERENCES store.shipping_methods(id) ON DELETE CASCADE,
  state        TEXT,                                 -- NULL = every state; otherwise an exact state name
  min_subtotal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (min_subtotal >= 0),
  max_subtotal NUMERIC(12,2) CHECK (max_subtotal IS NULL OR max_subtotal > min_subtotal),
  flat_rate    NUMERIC(12,2) NOT NULL CHECK (flat_rate >= 0),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);
-- checkout shipping quote: rates of active methods, narrowed by state then subtotal band
CREATE INDEX IF NOT EXISTS idx_shipping_rates_method ON store.shipping_rates(method_id, state, min_subtotal) WHERE is_active;

-- Which method the customer chose at checkout (null for orders created before this existed).
ALTER TABLE store.orders ADD COLUMN IF NOT EXISTS shipping_method_id UUID REFERENCES store.shipping_methods(id) ON DELETE SET NULL;
ALTER TABLE store.orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_shipping_method ON store.orders(shipping_method_id) WHERE shipping_method_id IS NOT NULL;

-- ---------- Tax (GST) ----------
-- GST on apparel is slab-based on the unit price and has changed before, so rates are rows with
-- effective dates rather than a column (products.tax_rate remains as an explicit per-product override).
-- The order stores the rate it used on each order_items row, so later rule changes never rewrite history.
-- CONFIRM the slabs with the accountant (open question Q5) before seeding real rows.
CREATE TABLE IF NOT EXISTS store.tax_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hsn_code       TEXT,                               -- NULL = applies to any HSN
  min_unit_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (min_unit_price >= 0),
  max_unit_price NUMERIC(12,2) CHECK (max_unit_price IS NULL OR max_unit_price > min_unit_price),
  rate_percent   NUMERIC(5,2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  effective_from DATE NOT NULL,
  effective_to   DATE,
  note           TEXT NOT NULL DEFAULT '',
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
-- order pricing: rule for (hsn, date), then the unit-price band
CREATE INDEX IF NOT EXISTS idx_tax_rules_lookup ON store.tax_rules(hsn_code, effective_from DESC, min_unit_price);

-- ---------- Support / audit ----------
CREATE TABLE IF NOT EXISTS store.contact_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES store.customers(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  email       CITEXT NOT NULL,
  order_number TEXT,
  subject     TEXT NOT NULL DEFAULT '',
  message     TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 5000),
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','resolved','spam')),
  handled_by  UUID REFERENCES store.staff_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
SELECT store.add_touch_trigger('store.contact_messages');
CREATE INDEX IF NOT EXISTS idx_contact_status ON store.contact_messages(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_customer ON store.contact_messages(customer_id) WHERE customer_id IS NOT NULL;

-- Append-only record of who changed what (staff actions in the admin CMS, customer profile edits,
-- order status overrides). Functions insert; nothing updates or deletes.
CREATE TABLE IF NOT EXISTS store.audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('customer','staff','system')),
  actor_id    UUID,
  action      TEXT NOT NULL,                         -- 'account.update' | 'address.delete' | 'cms.publish' | ...
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON store.audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON store.audit_log(actor_type, actor_id, created_at DESC);
-- retention purge
CREATE INDEX IF NOT EXISTS idx_audit_created ON store.audit_log(created_at);

-- ---------- Race-free helpers ----------

-- Fixed-window rate limit that works across serverless instances (the in-memory limiter does not).
-- One atomic upsert: returns TRUE while the caller is within `p_limit` hits for the window.
--   SELECT store.hit_rate_limit('login:' || sha256_of_ip, 900, 30);
CREATE OR REPLACE FUNCTION store.hit_rate_limit(p_bucket TEXT, p_window_seconds INT, p_limit INT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
  v_start TIMESTAMPTZ := to_timestamp(floor(extract(epoch FROM NOW()) / p_window_seconds) * p_window_seconds);
  v_hits  INT;
BEGIN
  INSERT INTO store.rate_limits(bucket, window_start, hits) VALUES (p_bucket, v_start, 1)
  ON CONFLICT (bucket, window_start) DO UPDATE SET hits = store.rate_limits.hits + 1
  RETURNING hits INTO v_hits;
  RETURN v_hits <= p_limit;
END;
$$;

-- Housekeeping for the two ever-growing tables above; schedule daily (pg_cron or a scheduled function).
CREATE OR REPLACE FUNCTION store.purge_expired_security_rows()
RETURNS VOID LANGUAGE sql AS $$
  DELETE FROM store.rate_limits WHERE window_start < NOW() - INTERVAL '2 days';
  DELETE FROM store.customer_sessions WHERE expires_at < NOW() - INTERVAL '7 days';
$$;

-- Redeem a coupon for an order. Locks the promotion row first, so two checkouts racing for the LAST
-- redemption of a limited code are serialised and exactly one wins (a plain "count then insert" lets both in).
CREATE OR REPLACE FUNCTION store.redeem_promotion(
  p_promotion UUID, p_customer UUID, p_order UUID, p_discount NUMERIC
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  promo store.promotions%ROWTYPE;
BEGIN
  SELECT * INTO promo FROM store.promotions WHERE id = p_promotion FOR UPDATE;
  IF NOT FOUND OR NOT promo.is_active
     OR (promo.starts_at IS NOT NULL AND promo.starts_at > NOW())
     OR (promo.ends_at IS NOT NULL AND promo.ends_at <= NOW()) THEN
    RAISE EXCEPTION 'PROMOTION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF promo.usage_limit IS NOT NULL
     AND (SELECT COUNT(*) FROM store.promotion_redemptions WHERE promotion_id = p_promotion) >= promo.usage_limit THEN
    RAISE EXCEPTION 'PROMOTION_EXHAUSTED' USING ERRCODE = 'P0001';
  END IF;
  IF promo.per_customer_limit IS NOT NULL
     AND (SELECT COUNT(*) FROM store.promotion_redemptions
          WHERE promotion_id = p_promotion AND customer_id = p_customer) >= promo.per_customer_limit THEN
    RAISE EXCEPTION 'PROMOTION_ALREADY_USED' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO store.promotion_redemptions(promotion_id, order_id, customer_id, discount)
  VALUES (p_promotion, p_order, p_customer, p_discount);
END;
$$;

-- Cancel orders whose payment never arrived and give their pieces back. Run every few minutes.
-- Returns how many orders were cancelled. SKIP LOCKED: a worker already handling an order (e.g. a
-- payment webhook arriving right now) is left alone instead of being fought over.
CREATE OR REPLACE FUNCTION store.expire_unpaid_orders(p_minutes INT DEFAULT 15)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  FOR r IN
    SELECT id FROM store.orders
     WHERE status = 'pending_payment' AND created_at < NOW() - make_interval(mins => p_minutes)
     FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM store.release_order_inventory(r.id);
    UPDATE store.orders SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = 'payment_timeout' WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
