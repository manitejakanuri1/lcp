-- The shop can now add and delete shelves from the POS, not only rename them.
-- SELECT and UPDATE were granted earlier (d2); these are the two that were missing.
-- Re-runnable.

GRANT INSERT, DELETE ON store.categories TO pos_api;

-- Deleting a shelf first checks that no menu link and no home page section point at it, so
-- the POS has to be able to read those two tables.
GRANT SELECT ON store.nav_items TO pos_api;
GRANT SELECT ON store.product_categories TO pos_api;
