-- =====================================================================================
-- A3  Let the POS publish a saree to the website
-- =====================================================================================
-- The POS signs in to the database as pos_api, which until now could only read and write
-- the shop's own tables. Publishing writes the listing itself, so it needs the catalog
-- tables too. It is given no more than that: the website's customers, carts, orders and
-- payments stay out of reach of the shop's login.
--
-- The shelves are the POS's own five categories rather than the eight the storefront was
-- seeded with. The Website screen already has a dropdown of these five, and asking the
-- owner to pick from a second, different list would be asking the same question twice.
-- Re-runnable.

BEGIN;

GRANT USAGE ON SCHEMA store TO pos_api;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    store.products,
    store.product_variants,
    store.product_images,
    store.product_categories,
    store.variant_stock_source
TO pos_api;

-- Categories are read to find the shelf, and created once each by the migration below.
GRANT SELECT ON store.categories TO pos_api;
-- The shelf number a listing is counted against; read-only from the shop's side.
GRANT SELECT ON store.variant_stock TO pos_api;

-- The five shelves the POS already offers, so a published saree has somewhere to land.
-- Titles match the labels in src/lib/categories.ts. Left alone if they already exist, so
-- renaming a shelf on the website is not undone by running this again.
INSERT INTO store.categories (slug, title, breadcrumb_label, kind, sort_order, status)
VALUES
    ('pattu-silk', 'Pattu & Silk',        'Pattu & Silk',        'collection', 10, 'published'),
    ('cotton',     'Cotton',              'Cotton',              'collection', 11, 'published'),
    ('fancy',      'Georgette & Fancy',   'Georgette & Fancy',   'collection', 12, 'published'),
    ('budget',     'Under 500',           'Under 500',           'collection', 13, 'published'),
    ('sets',       'Langavoni & Dresses', 'Langavoni & Dresses', 'collection', 14, 'published')
ON CONFLICT (slug) DO NOTHING;

COMMIT;

-- Publishing a listing fires store.enqueue_revalidation, which records that a page needs
-- rebuilding. The trigger runs as whoever did the insert, so the shop's login needs to be
-- able to write that queue - without it, publishing fails with a bare permission error and
-- nothing says which table was refused.
BEGIN;
GRANT INSERT, SELECT ON store.revalidation_events TO pos_api;
COMMIT;
-- The queue's id comes from a sequence, and a sequence carries its own permission: without
-- USAGE the insert is refused with the same bare message as a missing table grant.
BEGIN;
GRANT USAGE ON SEQUENCE store.revalidation_events_id_seq TO pos_api;
COMMIT;
