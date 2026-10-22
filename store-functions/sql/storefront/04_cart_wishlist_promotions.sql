-- =====================================================================================
-- CART, WISHLIST, PROMOTIONS  (Cart page, Wishlist page, cart-wishlist-merge)
-- =====================================================================================
-- Guests keep their cart/wishlist in localStorage only (tech_req §3). These tables hold the
-- signed-in customer's versions, which are the source of truth after login.
-- Prices are never stored as authoritative: unit_price_seen is only what the shopper last
-- saw, so cart-validate can flag "price changed" instead of silently repricing.

CREATE TABLE IF NOT EXISTS store.promotions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            CITEXT NOT NULL UNIQUE,
  description     TEXT NOT NULL DEFAULT '',
  discount_type   TEXT NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value  NUMERIC(12,2) NOT NULL CHECK (discount_value > 0),
  max_discount    NUMERIC(12,2) CHECK (max_discount IS NULL OR max_discount > 0),   -- cap for percent codes
  min_subtotal    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (min_subtotal >= 0),
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  usage_limit     INT CHECK (usage_limit IS NULL OR usage_limit > 0),               -- total redemptions
  per_customer_limit INT CHECK (per_customer_limit IS NULL OR per_customer_limit > 0),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (discount_type <> 'percent' OR discount_value <= 100),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
SELECT store.add_touch_trigger('store.promotions');

-- promotion-validate / redeem_promotion look codes up by the UNIQUE(code) index; carts.coupon_code is not queried by code.
CREATE TABLE IF NOT EXISTS store.carts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL UNIQUE REFERENCES store.customers(id) ON DELETE CASCADE,  -- one live cart each
  coupon_code  CITEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT store.add_touch_trigger('store.carts');

CREATE TABLE IF NOT EXISTS store.cart_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id         UUID NOT NULL REFERENCES store.carts(id) ON DELETE CASCADE,
  variant_id      UUID NOT NULL REFERENCES store.product_variants(id) ON DELETE CASCADE,
  quantity        INT NOT NULL CHECK (quantity BETWEEN 1 AND 99),   -- real cap comes from site_settings.max_line_quantity
  unit_price_seen NUMERIC(12,2) CHECK (unit_price_seen IS NULL OR unit_price_seen >= 0),
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cart_id, variant_id)                                       -- makes merge idempotent
);
SELECT store.add_touch_trigger('store.cart_items');
-- UNIQUE (cart_id, variant_id) already serves cart-get by cart. This one serves the FK from product_variants
-- (ON DELETE CASCADE) and "who has this variant in a cart" (price-change / back-in-stock outreach).
CREATE INDEX IF NOT EXISTS idx_cart_items_variant ON store.cart_items(variant_id);

CREATE TABLE IF NOT EXISTS store.wishlist_items (
  customer_id UUID NOT NULL REFERENCES store.customers(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES store.products(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (customer_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_wishlist_product ON store.wishlist_items(product_id);

-- cart-wishlist-merge: guest state in, account state out. Idempotent: running it twice
-- never duplicates a line, and the LARGER quantity wins so a repeat login cannot double it.
-- p_cart  = [{"variantId": "...", "quantity": 2, "unitPrice": 12500}, ...]
-- p_wish  = ["<product uuid>", ...]
CREATE OR REPLACE FUNCTION store.merge_guest_state(
  p_customer UUID,
  p_cart     JSONB DEFAULT '[]'::JSONB,
  p_wish     JSONB DEFAULT '[]'::JSONB,
  p_max_qty  INT   DEFAULT 10
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_cart UUID;
BEGIN
  INSERT INTO store.carts(customer_id) VALUES (p_customer)
  ON CONFLICT (customer_id) DO NOTHING;
  SELECT id INTO v_cart FROM store.carts WHERE customer_id = p_customer;

  INSERT INTO store.cart_items(cart_id, variant_id, quantity, unit_price_seen)
  SELECT v_cart,
         (e->>'variantId')::UUID,
         LEAST(GREATEST((e->>'quantity')::INT, 1), p_max_qty),
         NULLIF(e->>'unitPrice', '')::NUMERIC
  FROM jsonb_array_elements(p_cart) e
  WHERE EXISTS (SELECT 1 FROM store.product_variants pv WHERE pv.id = (e->>'variantId')::UUID)  -- skip stale ids
  ON CONFLICT (cart_id, variant_id) DO UPDATE
    SET quantity = GREATEST(store.cart_items.quantity, EXCLUDED.quantity),
        unit_price_seen = COALESCE(EXCLUDED.unit_price_seen, store.cart_items.unit_price_seen);

  INSERT INTO store.wishlist_items(customer_id, product_id)
  SELECT p_customer, w::UUID
  FROM jsonb_array_elements_text(p_wish) w
  WHERE EXISTS (SELECT 1 FROM store.products p WHERE p.id = w::UUID)
  ON CONFLICT DO NOTHING;
END;
$$;
