-- =====================================================================================
-- E3  The shop's own banner across the top of the home page
-- =====================================================================================
-- The owner supplied artwork with its words already set into the picture ("Timeless
-- Elegance / Luxury Woven Into Every Moment"), so the block carries the image and nothing
-- else to write over it. It sits at position 0, above everything.
--
-- The picture lives in the shop's own photo bucket beside the saree pictures, not on a
-- stock photo site.
--
-- Re-runnable.

BEGIN;

-- The table lists the block types the website knows how to draw. hero-banner is new, so it
-- joins the list; the constraint is what stops a typed block type from reaching the website
-- and rendering as nothing.
ALTER TABLE store.cms_blocks DROP CONSTRAINT IF EXISTS cms_blocks_type_check;
ALTER TABLE store.cms_blocks ADD CONSTRAINT cms_blocks_type_check CHECK (type = ANY (ARRAY[
  'hero-banner', 'six-moods', 'brand-story', 'product-carousel', 'bridal-spotlight',
  'campaign-banner', 'edits-grid', 'collection-tiles', 'editorial-panels', 'film-slider',
  'card-stack'
]));

INSERT INTO store.cms_blocks (page_id, type, position, is_active, payload)
SELECT p.id, 'hero-banner', 0, true,
       jsonb_build_object(
         'image', 'https://storage.googleapis.com/lakshmi-sarees-photos/banners/hero-timeless-elegance.webp',
         'alt', 'Lakshmi Sarees - Timeless Elegance, luxury woven into every moment',
         'ctaHref', '/collections/shop')
  FROM store.cms_pages p
 WHERE p.slug = 'home'
   AND NOT EXISTS (SELECT 1 FROM store.cms_blocks b WHERE b.type = 'hero-banner');

UPDATE store.cms_blocks
   SET payload = jsonb_build_object(
         'image', 'https://storage.googleapis.com/lakshmi-sarees-photos/banners/hero-timeless-elegance.webp',
         'alt', 'Lakshmi Sarees - Timeless Elegance, luxury woven into every moment',
         'ctaHref', '/collections/shop'),
       position = 0,
       is_active = true,
       updated_at = NOW()
 WHERE type = 'hero-banner';

COMMIT;
