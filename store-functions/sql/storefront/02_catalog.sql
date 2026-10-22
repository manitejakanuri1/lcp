-- =====================================================================================
-- CATALOG  (Section page, Product page, Search, Landing product blocks)
-- =====================================================================================
-- Maps to TS: Category, Product, ProductVariant, ProductSummary.
-- Stock is NOT a column. It is derived from the shop inventory (pos.products, owned by
-- the POS app) through store.variant_inventory_items, so web and shop share one pool.

CREATE TABLE IF NOT EXISTS store.categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title         TEXT NOT NULL,
  breadcrumb_label TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  hero_image_url TEXT,
  hero_image_alt TEXT NOT NULL DEFAULT '',
  -- Drives which facet/landing role the category plays; 'collection' = Bridal, New Arrivals, etc.
  kind          TEXT NOT NULL DEFAULT 'collection' CHECK (kind IN ('collection','occasion','fabric','campaign')),
  parent_id     UUID REFERENCES store.categories(id) ON DELETE SET NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  seo_title     TEXT,
  seo_description TEXT,
  status        store.content_status NOT NULL DEFAULT 'published',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
SELECT store.add_touch_trigger('store.categories');
CREATE INDEX IF NOT EXISTS idx_categories_parent ON store.categories(parent_id);
-- nav-get / sitemap: published categories in display order.
CREATE INDEX IF NOT EXISTS idx_categories_status_sort ON store.categories(status, sort_order);

CREATE TABLE IF NOT EXISTS store.products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          TEXT NOT NULL,
  subtitle      TEXT NOT NULL DEFAULT '',
  fabric        TEXT NOT NULL,                       -- facet: "Kanjivaram Silk"
  description   TEXT NOT NULL DEFAULT '',
  care_instructions TEXT NOT NULL DEFAULT '',
  size_guide    TEXT NOT NULL DEFAULT '',            -- product-page tab; open question vs. policy page
  badge         TEXT,                                -- "New", "Bestseller"
  tags          TEXT[] NOT NULL DEFAULT '{}',
  hsn_code      TEXT,                                -- GST classification (decision pending)
  tax_rate      NUMERIC(5,2) NOT NULL DEFAULT 5.00 CHECK (tax_rate >= 0),
  -- Denormalised from reviews (optional file 91). Defaults keep the UI star line working now.
  rating_avg    NUMERIC(2,1) NOT NULL DEFAULT 0 CHECK (rating_avg BETWEEN 0 AND 5),
  rating_count  INT NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  popularity    INT NOT NULL DEFAULT 0,              -- best-selling sort; refreshed from order_items
  seo_title     TEXT,
  seo_description TEXT,
  status        store.content_status NOT NULL DEFAULT 'draft',
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(fabric, '') || ' ' || coalesce(subtitle, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C')
  ) STORED
);
SELECT store.add_touch_trigger('store.products');
-- Storefront reads only ever see status = 'published', so these are PARTIAL indexes (smaller, no drafts).
-- sort=newest (catalog-category-products-search, catalog-product-summaries-get?collection=)
CREATE INDEX IF NOT EXISTS idx_products_pub_newest  ON store.products(published_at DESC, id) WHERE status = 'published';
-- sort=popularity
CREATE INDEX IF NOT EXISTS idx_products_pub_popular ON store.products(popularity DESC, id) WHERE status = 'published';
-- sort=rating (product_summaries.rating)
CREATE INDEX IF NOT EXISTS idx_products_pub_rating  ON store.products(rating_avg DESC, id) WHERE status = 'published';
-- fabric facet filter
CREATE INDEX IF NOT EXISTS idx_products_pub_fabric  ON store.products(fabric) WHERE status = 'published';
-- admin lists (any status) by recency
CREATE INDEX IF NOT EXISTS idx_products_status_updated ON store.products(status, updated_at DESC);
-- search-products: full-text on the generated vector, trigram for typo/substring on name and fabric
CREATE INDEX IF NOT EXISTS idx_products_search      ON store.products USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm   ON store.products USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_fabric_trgm ON store.products USING GIN (fabric gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_tags        ON store.products USING GIN (tags);

CREATE TABLE IF NOT EXISTS store.product_categories (
  product_id  UUID NOT NULL REFERENCES store.products(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES store.categories(id) ON DELETE CASCADE,
  position    INT NOT NULL DEFAULT 0,               -- manual ordering inside a collection
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,       -- the breadcrumb category on the product page
  PRIMARY KEY (product_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_product_categories_category ON store.product_categories(category_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_one_primary_category
  ON store.product_categories(product_id) WHERE is_primary;

CREATE TABLE IF NOT EXISTS store.product_images (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES store.products(id) ON DELETE CASCADE,
  variant_id UUID,                                  -- optional: image belongs to one colour (FK added below)
  url        TEXT NOT NULL,
  alt        TEXT NOT NULL DEFAULT '',
  width      INT,
  height     INT,
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON store.product_images(product_id, position);
-- FK ON DELETE SET NULL from product_variants scans this column.
CREATE INDEX IF NOT EXISTS idx_product_images_variant ON store.product_images(variant_id) WHERE variant_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS store.product_variants (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID NOT NULL REFERENCES store.products(id) ON DELETE CASCADE,
  sku            TEXT NOT NULL UNIQUE,
  color          TEXT,
  color_hex      TEXT CHECK (color_hex IS NULL OR color_hex ~ '^#[0-9a-fA-F]{6}$'),
  size_label     TEXT,                              -- sarees are usually free size
  blouse_included BOOLEAN,                          -- "blouse piece included / not"
  price          NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  discount_price NUMERIC(12,2) CHECK (discount_price IS NULL OR (discount_price >= 0 AND discount_price < price)),
  low_stock_at   INT NOT NULL DEFAULT 3 CHECK (low_stock_at >= 0),
  position       INT NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT store.add_touch_trigger('store.product_variants');
-- Variants are always read per product (product page, cart, price-stock) and only active ones.
CREATE INDEX IF NOT EXISTS idx_variants_product ON store.product_variants(product_id, position);
-- product_summaries "cheapest active variant" LATERAL + price sort/filter: ORDER BY COALESCE(discount_price, price).
CREATE INDEX IF NOT EXISTS idx_variants_product_effprice ON store.product_variants(product_id, (COALESCE(discount_price, price))) WHERE is_active;
-- colour facet: colour -> product semi-join (replaces the colour-only index)
CREATE INDEX IF NOT EXISTS idx_variants_color_product ON store.product_variants(lower(color), product_id) WHERE is_active AND color IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_product_images_variant') THEN
    ALTER TABLE store.product_images
      ADD CONSTRAINT fk_product_images_variant
      FOREIGN KEY (variant_id) REFERENCES store.product_variants(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- ---- Shared stock link ---------------------------------------------------------------
-- One physical saree (pos.products row, owned by the POS app) belongs to at most one
-- web variant. Web stock for a variant = linked items still 'available' and not reserved.
CREATE TABLE IF NOT EXISTS store.variant_inventory_items (
  inventory_product_id UUID PRIMARY KEY REFERENCES pos.products(id) ON DELETE RESTRICT,
  variant_id           UUID NOT NULL REFERENCES store.product_variants(id) ON DELETE CASCADE,
  linked_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vii_variant ON store.variant_inventory_items(variant_id);

-- A hold on a physical piece while a web order is unpaid, so the shop and other web
-- shoppers do not sell it from under the buyer. See 06_inventory_allocation.sql.
CREATE TABLE IF NOT EXISTS store.inventory_reservations (
  inventory_product_id UUID PRIMARY KEY REFERENCES pos.products(id) ON DELETE CASCADE,
  order_id             UUID NOT NULL,               -- FK to store.orders added in 05_orders_payments.sql
  expires_at           TIMESTAMPTZ NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reservations_order ON store.inventory_reservations(order_id);
-- reserve_inventory / variant_stock / expiry sweeps: "expires_at <= NOW()"
CREATE INDEX IF NOT EXISTS idx_reservations_expiry ON store.inventory_reservations(expires_at);

-- Live stock per variant: what catalog-product-price-stock-get and cart-validate read.
CREATE OR REPLACE VIEW store.variant_stock AS
SELECT v.id AS variant_id,
       v.product_id,
       COUNT(p.id) FILTER (
         WHERE p.status = 'available'
           AND (r.inventory_product_id IS NULL OR r.expires_at <= NOW())
       )::INT AS stock
FROM store.product_variants v
LEFT JOIN store.variant_inventory_items vii ON vii.variant_id = v.id
LEFT JOIN pos.products p ON p.id = vii.inventory_product_id
LEFT JOIN store.inventory_reservations r ON r.inventory_product_id = p.id
GROUP BY v.id, v.product_id;

-- Card/grid shape (ProductSummary): cheapest active variant, in-stock flag, hero image.
CREATE OR REPLACE VIEW store.product_summaries AS
SELECT p.id, p.slug, p.name, p.badge, p.fabric,
       p.rating_avg AS rating,
       p.popularity, p.published_at, p.tags,
       best.price,
       best.discount_price,
       COALESCE(stk.total_stock, 0) > 0 AS in_stock,
       img.url AS image
FROM store.products p
LEFT JOIN LATERAL (
  SELECT v.price, v.discount_price
  FROM store.product_variants v
  WHERE v.product_id = p.id AND v.is_active
  ORDER BY COALESCE(v.discount_price, v.price), v.position
  LIMIT 1
) best ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(vs.stock) AS total_stock FROM store.variant_stock vs WHERE vs.product_id = p.id
) stk ON TRUE
LEFT JOIN LATERAL (
  SELECT i.url FROM store.product_images i WHERE i.product_id = p.id ORDER BY i.position LIMIT 1
) img ON TRUE
WHERE p.status = 'published';
