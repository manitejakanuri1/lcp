-- =====================================================================================
-- D1  Let the shop run its own website from the POS
-- =====================================================================================
-- Until now the home page and the site's wording could only be changed by hand, in SQL,
-- by whoever had the database password. Two tables are all the new screen needs:
--
--   cms_blocks     the home page's sections - which are shown, and in what order
--   site_settings  the header and footer wording
--
-- Read and change only. The POS has no business adding or deleting a home page section:
-- each section is a different shape with its own renderer on the website, and one made up
-- in the shop would reach a renderer that does not exist. Switching one off is the whole
-- of what the shop asked for.
--
-- Re-runnable.

BEGIN;

GRANT SELECT, UPDATE ON store.cms_blocks    TO pos_api;
GRANT SELECT, UPDATE ON store.site_settings TO pos_api;

-- store.cms_blocks carries an AFTER UPDATE trigger that writes store.revalidation_events,
-- and a trigger runs as the role doing the update - the insert and its sequence were
-- already granted for publishing (a3), so nothing further is needed here.

COMMIT;

-- Added after the first live run refused every section change with
-- "permission denied for table cms_pages".
--
-- store.cms_blocks carries an AFTER UPDATE trigger, store.enqueue_revalidation_block, which
-- looks up the page a section belongs to so it can tell the website which address to rebuild.
-- A trigger runs as the role doing the update, so switching a section off needs to be able to
-- read store.cms_pages as well. Read only: the POS never creates or renames a page.
BEGIN;
GRANT SELECT ON store.cms_pages TO pos_api;
COMMIT;
