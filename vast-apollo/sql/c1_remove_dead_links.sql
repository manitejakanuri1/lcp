-- =====================================================================================
-- C1  Take the links that go nowhere out of the shop's menus
-- =====================================================================================
-- The navigation was seeded with a sample shop's menu. Five of its links point at pages
-- that were never built, so a customer who taps one is shown a 404 - and the social links
-- point at the front door of Instagram, YouTube and Pinterest rather than at this shop.
--
-- Switched off rather than deleted: the pages may well be built later, and turning a link
-- back on is then one update instead of working out what it used to say.
-- Re-runnable.

BEGIN;

UPDATE store.nav_items
   SET is_active = false, updated_at = NOW()
 WHERE href IN (
    '/about',                              -- no About page exists
    '/showrooms',                           -- no Showrooms page exists (menu and footer both)
    '/book-video-call',                     -- no booking page exists
    'mailto:care@lakshmisarees.example'     -- not a real address
 );

-- The one social account the shop actually has.
UPDATE store.nav_items
   SET href = 'https://www.instagram.com/lakshmi.sarees_rjy/', updated_at = NOW()
 WHERE label = 'Instagram';

-- No YouTube or Pinterest account to send anyone to yet.
UPDATE store.nav_items
   SET is_active = false, updated_at = NOW()
 WHERE label IN ('YouTube', 'Pinterest')
   AND href IN ('https://youtube.com', 'https://pinterest.com');

COMMIT;
