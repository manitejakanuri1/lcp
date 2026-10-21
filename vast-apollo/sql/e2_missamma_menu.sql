-- =====================================================================================
-- E2  The menu the owner asked for, modelled on missamma.in
-- =====================================================================================
-- Home · Shop · New Arrivals · Best Sellers · Soft Silk Pattu · Mangalagiri · Kanchi ·
-- Kota · Flash Sale · Langavoni.
--
-- Three of those shelves did not exist and are created here: shop, mangalagiri, kota.
-- "Shop" is a shelf like any other rather than a page of its own, so it shows up as a tick
-- box in the POS Website screen and a new saree is put on it the same way as any other -
-- until the real /shop page with its filters is built, when this shelf can be retired.
--
-- Mangalagiri, Kota, Kanchi, Flash Sale and Langavoni hold nothing today, so those five
-- links open a page with a heading and an empty grid. The owner asked for them anyway; the
-- day stock arrives they fill themselves.
--
-- Littlefarmer is missamma's childrenswear label. The nearest thing this shop sells is
-- langavoni, so that link took its place and its NEW badge.
--
-- Re-runnable.

BEGIN;

-- ---- the three new shelves ------------------------------------------------------------
INSERT INTO store.categories (slug, title, breadcrumb_label, description, sort_order)
VALUES
  ('shop',        'Shop',        'Shop',        'Every saree in the shop.', 9),
  ('mangalagiri', 'Mangalagiri', 'Mangalagiri', 'Mangalagiri cotton and pattu sarees.', 15),
  ('kota',        'Kota',        'Kota',        'Kota sarees.', 16)
ON CONFLICT (slug) DO NOTHING;

UPDATE store.categories
   SET title = 'Flash Sale', breadcrumb_label = 'Flash Sale', updated_at = NOW()
 WHERE slug = 'seasonal-special' AND title <> 'Flash Sale';

-- Every saree already on the website goes on the Shop shelf, so the link is not empty on
-- the day it appears. is_primary stays false: the breadcrumb must keep pointing at the
-- shelf the saree really belongs to.
INSERT INTO store.product_categories (product_id, category_id, is_primary)
SELECT p.id, c.id, false
  FROM store.products p
 CROSS JOIN store.categories c
 WHERE c.slug = 'shop' AND p.status = 'published'
ON CONFLICT DO NOTHING;

-- ---- the menu ---------------------------------------------------------------------------
INSERT INTO store.nav_items (area, label, href, badge, position, is_active)
VALUES
  ('category', 'Home',        '/',                            NULL,            1,  true),
  ('category', 'Shop',        '/collections/shop',            NULL,            2,  true),
  ('category', 'Mangalagiri', '/collections/mangalagiri',     NULL,            6,  true),
  ('category', 'Kota',        '/collections/kota',            NULL,            8,  true),
  ('category', 'Flash Sale',  '/collections/seasonal-special','NEW EXCLUSIVE', 9,  true),
  ('category', 'Langavoni',   '/collections/sets',            'NEW',           10, true)
ON CONFLICT DO NOTHING;

-- The links that already exist keep their rows, so the words and the order are set here
-- rather than inserted again.
UPDATE store.nav_items SET label = 'New Arrivals',    badge = 'NEW', position = 3, is_active = true, updated_at = NOW()
 WHERE area = 'category' AND href = '/collections/new-arrivals';
UPDATE store.nav_items SET label = 'Best Sellers',    position = 4, is_active = true, updated_at = NOW()
 WHERE area = 'category' AND href = '/collections/best-sellers';
UPDATE store.nav_items SET label = 'Soft Silk Pattu', position = 5, is_active = true, updated_at = NOW()
 WHERE area = 'category' AND href = '/collections/pattu-silk';
UPDATE store.nav_items SET label = 'Kanchi',          position = 7, is_active = true, updated_at = NOW()
 WHERE area = 'category' AND href = '/collections/kanjivaram';

COMMIT;
