-- =====================================================================================
-- ENGAGEMENT  (Newsletter signup, reviews, back-in-stock)
-- =====================================================================================
-- Newsletter ships now. Reviews and back-in-stock are OPEN QUESTIONS in 03-product-page.md;
-- the tables are included so the decision is cheap to say yes to, but they are unused until
-- the functions exist. Drop this section's last two tables if the answer is "not at launch".

CREATE TABLE IF NOT EXISTS store.newsletter_subscribers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT NOT NULL UNIQUE,
  -- 'pending' only matters if double opt-in is chosen (open question in 01-landing-page.md).
  status        TEXT NOT NULL DEFAULT 'subscribed' CHECK (status IN ('pending','subscribed','unsubscribed','bounced')),
  source        TEXT NOT NULL DEFAULT 'footer',
  confirm_token TEXT UNIQUE,
  confirmed_at  TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
SELECT store.add_touch_trigger('store.newsletter_subscribers');

-- Persistent rate limiting for public endpoints (search, newsletter). Key = hashed IP + route.
-- hit_rate_limit upserts by PK (bucket, window_start); the purge job deletes by window_start alone, hence the 2nd index.
CREATE TABLE IF NOT EXISTS store.rate_limits (
  bucket       TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits         INT NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON store.rate_limits(window_start);

CREATE TABLE IF NOT EXISTS store.product_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES store.products(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES store.customers(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES store.order_items(id) ON DELETE SET NULL,   -- verified-buyer badge
  rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, customer_id)
);
-- product page reviews: approved only, newest first (UNIQUE(product_id, customer_id) covers the pair lookup)
CREATE INDEX IF NOT EXISTS idx_reviews_product ON store.product_reviews(product_id, created_at DESC) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_reviews_customer ON store.product_reviews(customer_id);
-- moderation queue
CREATE INDEX IF NOT EXISTS idx_reviews_pending ON store.product_reviews(created_at) WHERE status = 'pending';

-- Keep products.rating_avg / rating_count in step with approved reviews.
CREATE OR REPLACE FUNCTION store.refresh_product_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  pid UUID := COALESCE(NEW.product_id, OLD.product_id);
BEGIN
  UPDATE store.products p
     SET rating_avg   = COALESCE((SELECT ROUND(AVG(rating)::NUMERIC, 1) FROM store.product_reviews WHERE product_id = pid AND status = 'approved'), 0),
         rating_count = (SELECT COUNT(*) FROM store.product_reviews WHERE product_id = pid AND status = 'approved')
   WHERE p.id = pid;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_reviews_rating') THEN
    CREATE TRIGGER trg_reviews_rating AFTER INSERT OR UPDATE OR DELETE ON store.product_reviews
      FOR EACH ROW EXECUTE FUNCTION store.refresh_product_rating();
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS store.back_in_stock_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id  UUID NOT NULL REFERENCES store.product_variants(id) ON DELETE CASCADE,
  email       CITEXT NOT NULL,
  customer_id UUID REFERENCES store.customers(id) ON DELETE SET NULL,
  notified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (variant_id, email)
);
-- restock notifier: pending requests per variant (UNIQUE (variant_id, email) already leads with variant_id; this keeps the
-- scan to un-notified rows) + FK ON DELETE SET NULL
CREATE INDEX IF NOT EXISTS idx_bis_pending ON store.back_in_stock_requests(variant_id) WHERE notified_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bis_customer ON store.back_in_stock_requests(customer_id) WHERE customer_id IS NOT NULL;
