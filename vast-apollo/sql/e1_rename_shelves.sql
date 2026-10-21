-- =====================================================================================
-- E1  Rename the shelves to the words the shop uses, and take the dead links out of the menu
-- =====================================================================================
-- The shelves were seeded with a sample shop's wording: "The Bridal Collection",
-- "Kanjivaram Icons", "Banarasi Heirlooms", "Under 500". The owner wants the plain trade
-- names a Rajahmundry customer would say out loud.
--
-- Only the title and the breadcrumb label change. The slug is left alone on purpose: it is
-- in every link already sent to a customer and in every nav_items href, so renaming a shelf
-- must not be able to break a link.
--
-- The menu keeps only the links that open a page with sarees on it. Bridal, Kanjivaram,
-- Banarasi and Silk Sarees hold nothing today, so they are switched off rather than deleted -
-- one update brings any of them back the day stock arrives. Soft Silk Pattu holds all three
-- published sarees and was missing from the menu entirely.
--
-- Re-runnable.

BEGIN;

UPDATE store.categories AS c
   SET title = v.title, breadcrumb_label = v.title, updated_at = NOW()
  FROM (VALUES
    ('pattu-silk',       'Soft Silk Pattu'),
    ('bridal',           'Bridal'),
    ('kanjivaram',       'Kanchi Pattu'),
    ('banarasi',         'Banarasi'),
    ('trend-of-the-day', 'Handpicked'),
    ('seasonal-special', 'Big Sale'),
    ('budget',           'Under ₹2,000'),
    ('fancy',            'Georgette'),
    ('sets',             'Langavoni')
  ) AS v(slug, title)
 WHERE c.slug = v.slug
   AND (c.title, c.breadcrumb_label) <> (v.title, v.title);

-- The four top-menu links that open an empty page.
UPDATE store.nav_items
   SET is_active = false, updated_at = NOW()
 WHERE area = 'category'
   AND href IN ('/collections/bridal', '/collections/kanjivaram',
                '/collections/banarasi', '/collections/silk-sarees')
   AND is_active;

-- The same two in the footer's Shop column.
UPDATE store.nav_items
   SET is_active = false, updated_at = NOW()
 WHERE area = 'footer_shop'
   AND href IN ('/collections/bridal', '/collections/silk-sarees')
   AND is_active;

-- The shelf that actually holds the sarees, in the menu and in the footer.
INSERT INTO store.nav_items (area, label, href, position, is_active)
SELECT 'category', 'Soft Silk Pattu', '/collections/pattu-silk', 3, true
 WHERE NOT EXISTS (
   SELECT 1 FROM store.nav_items WHERE area = 'category' AND href = '/collections/pattu-silk');

INSERT INTO store.nav_items (area, label, href, position, is_active)
SELECT 'footer_shop', 'Soft silk pattu', '/collections/pattu-silk', 2, true
 WHERE NOT EXISTS (
   SELECT 1 FROM store.nav_items WHERE area = 'footer_shop' AND href = '/collections/pattu-silk');

-- A link switched back on by hand earlier must not be left pointing at a shelf that is gone.
UPDATE store.nav_items n
   SET is_active = false, updated_at = NOW()
 WHERE n.is_active
   AND n.href LIKE '/collections/%'
   AND NOT EXISTS (
     SELECT 1 FROM store.categories c
      WHERE c.status = 'published'
        AND '/collections/' || c.slug = n.href);

COMMIT;
