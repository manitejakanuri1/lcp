-- =====================================================================================
-- ORDERS, PAYMENTS, SHIPMENTS, RETURNS  (Orders list/detail, reorder, cancel, return, checkout)
-- =====================================================================================
-- Payment gateway is undecided, so tables are gateway-neutral: `provider` + `provider_ref`
-- plus a raw JSONB payload. Orders snapshot everything (names, prices, addresses) so later
-- catalog or address edits never rewrite history.

CREATE SEQUENCE IF NOT EXISTS store.order_number_seq START 1001;

CREATE OR REPLACE FUNCTION store.next_order_number()
RETURNS TEXT LANGUAGE SQL AS $$
  -- Sequence-based (not COUNT(*)+1, which races under concurrency in the POS schema).
  SELECT 'LS-' || TO_CHAR(NOW(), 'YYMM') || '-' || LPAD(nextval('store.order_number_seq')::TEXT, 5, '0');
$$;

CREATE TABLE IF NOT EXISTS store.orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     TEXT NOT NULL UNIQUE DEFAULT store.next_order_number(),
  -- Login is required to check out (decision D14, Q3), so every order has an owner.
  -- RESTRICT: a customer with orders cannot be hard-deleted (tax records); anonymise instead.
  customer_id      UUID NOT NULL REFERENCES store.customers(id) ON DELETE RESTRICT,
  status           store.order_status NOT NULL DEFAULT 'pending_payment',
  payment_status   store.payment_status NOT NULL DEFAULT 'pending',
  currency         CHAR(3) NOT NULL DEFAULT 'INR',
  subtotal         NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),   -- sum of line totals at sale price
  savings          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (savings >= 0),  -- list - sale, informational
  discount_total   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),   -- coupon
  shipping_total   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (shipping_total >= 0),
  tax_total        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),        -- included in total
  total            NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  promotion_id     UUID REFERENCES store.promotions(id) ON DELETE SET NULL,
  coupon_code      CITEXT,
  shipping_address JSONB NOT NULL,                   -- snapshot: {name, phone, line1, line2, city, state, pincode}
  billing_address  JSONB,
  customer_note    TEXT,
  idempotency_key  TEXT UNIQUE,                      -- checkout retry cannot create two orders
  placed_at        TIMESTAMPTZ,                      -- set when payment is confirmed
  cancelled_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT store.add_touch_trigger('store.orders');
CREATE INDEX IF NOT EXISTS idx_orders_customer ON store.orders(customer_id, created_at DESC);
-- admin order queue (status + recency) and the unpaid-order sweeper (expire_unpaid_orders)
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON store.orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_pending_payment ON store.orders(created_at) WHERE status = 'pending_payment';
-- FK lookups (ON DELETE SET NULL scans these columns)
CREATE INDEX IF NOT EXISTS idx_orders_promotion ON store.orders(promotion_id) WHERE promotion_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_reservations_order') THEN
    ALTER TABLE store.inventory_reservations
      ADD CONSTRAINT fk_reservations_order FOREIGN KEY (order_id) REFERENCES store.orders(id) ON DELETE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS store.order_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID NOT NULL REFERENCES store.orders(id) ON DELETE CASCADE,
  product_id           UUID REFERENCES store.products(id) ON DELETE SET NULL,
  variant_id           UUID REFERENCES store.product_variants(id) ON DELETE SET NULL,
  -- The physical piece sold. Lets returns/cancels restore the exact item to shop stock.
  inventory_product_id UUID REFERENCES pos.products(id) ON DELETE SET NULL,
  -- Snapshots
  product_name         TEXT NOT NULL,
  product_slug         TEXT NOT NULL,
  sku                  TEXT NOT NULL,
  variant_label        TEXT,
  image_url            TEXT,
  quantity             INT NOT NULL CHECK (quantity > 0),
  list_price           NUMERIC(12,2) NOT NULL CHECK (list_price >= 0),
  unit_price           NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total           NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
  tax_rate             NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price           NUMERIC(12,2),                -- copied from POS inventory for margin reports; staff-only
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON store.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON store.order_items(product_id);
-- reorder + FK ON DELETE SET NULL from product_variants / pos.products (restock path reads by order_id above)
CREATE INDEX IF NOT EXISTS idx_order_items_variant ON store.order_items(variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_inventory ON store.order_items(inventory_product_id) WHERE inventory_product_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS store.order_status_history (
  id          BIGSERIAL PRIMARY KEY,
  order_id    UUID NOT NULL REFERENCES store.orders(id) ON DELETE CASCADE,
  from_status store.order_status,
  to_status   store.order_status NOT NULL,
  note        TEXT,
  changed_by  UUID REFERENCES store.staff_users(id) ON DELETE SET NULL,   -- null = customer/system
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_history_order ON store.order_status_history(order_id, created_at);

-- Every status change is recorded automatically, so the tracking timeline cannot drift.
CREATE OR REPLACE FUNCTION store.log_order_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO store.order_status_history(order_id, to_status) VALUES (NEW.id, NEW.status);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO store.order_status_history(order_id, from_status, to_status) VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_orders_status_log') THEN
    CREATE TRIGGER trg_orders_status_log AFTER INSERT OR UPDATE OF status ON store.orders
      FOR EACH ROW EXECUTE FUNCTION store.log_order_status();
  END IF;
END
$$;

-- Payments and refunds are rows of one ledger (kind distinguishes them).
CREATE TABLE IF NOT EXISTS store.payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES store.orders(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment','refund')),
  provider     TEXT NOT NULL,                        -- 'razorpay' | 'stripe' | 'cod' | ... (undecided)
  provider_ref TEXT,                                 -- gateway payment/refund id
  method       TEXT,                                 -- 'upi' | 'card' | 'netbanking' | 'cod'
  amount       NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status       store.payment_status NOT NULL DEFAULT 'pending',
  failure_reason TEXT,
  raw          JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_ref)
);
SELECT store.add_touch_trigger('store.payments');
CREATE INDEX IF NOT EXISTS idx_payments_order ON store.payments(order_id);
-- reconciliation: payments still waiting on the gateway
CREATE INDEX IF NOT EXISTS idx_payments_pending ON store.payments(created_at) WHERE status = 'pending';

-- Webhook de-duplication: gateways retry, handlers must be idempotent.
CREATE TABLE IF NOT EXISTS store.webhook_events (
  id           BIGSERIAL PRIMARY KEY,
  provider     TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error        TEXT,
  UNIQUE (provider, event_id)
);

-- webhook retry worker: unprocessed events oldest first (UNIQUE(provider, event_id) already dedupes)
CREATE INDEX IF NOT EXISTS idx_webhook_unprocessed ON store.webhook_events(received_at) WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS store.shipments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES store.orders(id) ON DELETE CASCADE,
  carrier         TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  tracking_url    TEXT,
  status          TEXT NOT NULL DEFAULT 'in_transit' CHECK (status IN ('label_created','in_transit','out_for_delivery','delivered','failed','returned')),
  shipped_at      TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (carrier, tracking_number)
);
SELECT store.add_touch_trigger('store.shipments');
CREATE INDEX IF NOT EXISTS idx_shipments_order ON store.shipments(order_id);

CREATE TABLE IF NOT EXISTS store.invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL UNIQUE REFERENCES store.orders(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  pdf_url        TEXT,
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store.order_returns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES store.orders(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('return','exchange')),
  status       TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','received','refunded','exchanged','closed')),
  reason       TEXT NOT NULL,
  customer_note TEXT,
  staff_note   TEXT,
  refund_amount NUMERIC(12,2) CHECK (refund_amount IS NULL OR refund_amount >= 0),
  decided_by   UUID REFERENCES store.staff_users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT store.add_touch_trigger('store.order_returns');
CREATE INDEX IF NOT EXISTS idx_returns_order ON store.order_returns(order_id);
-- admin returns queue
CREATE INDEX IF NOT EXISTS idx_returns_status ON store.order_returns(status, requested_at DESC);

CREATE TABLE IF NOT EXISTS store.order_return_items (
  return_id     UUID NOT NULL REFERENCES store.order_returns(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES store.order_items(id) ON DELETE CASCADE,
  quantity      INT NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (return_id, order_item_id)
);

-- (PK (return_id, order_item_id) covers return_id; this covers the FK from order_items)
CREATE INDEX IF NOT EXISTS idx_return_items_order_item ON store.order_return_items(order_item_id);

CREATE TABLE IF NOT EXISTS store.promotion_redemptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES store.promotions(id) ON DELETE CASCADE,
  order_id     UUID NOT NULL UNIQUE REFERENCES store.orders(id) ON DELETE CASCADE,
  customer_id  UUID REFERENCES store.customers(id) ON DELETE SET NULL,
  discount     NUMERIC(12,2) NOT NULL CHECK (discount >= 0),
  redeemed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_redemptions_promo ON store.promotion_redemptions(promotion_id, customer_id);
-- per-customer history + FK ON DELETE SET NULL
CREATE INDEX IF NOT EXISTS idx_redemptions_customer ON store.promotion_redemptions(customer_id) WHERE customer_id IS NOT NULL;
