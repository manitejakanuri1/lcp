-- =====================================================================================
-- STOREFRONT CONTENT SEED  (header/footer, collections, policies, home page)
-- =====================================================================================
-- The copy the storefront showed while it ran on mock data, moved into the database so cms-homepage-get,
-- nav-get, cms-policy-get and catalog-category-get have something to serve. Run after 90_seed_minimal.sql.
-- Safe to re-run: collections / settings are upserted-if-missing, and nav / policy sections / home blocks are only
-- inserted when that table (or page) is still empty, so content edited in the admin is never overwritten.
-- Products are NOT here; see 92_seed_demo_catalog.sql (demo data) or add real ones from the admin.

INSERT INTO store.categories(slug, title, breadcrumb_label, description, hero_image_url, hero_image_alt, sort_order, status) VALUES
  ('new-arrivals', 'New Arrivals', 'New Arrivals', 'Fresh from the loom — the latest sarees to join the house.', 'https://picsum.photos/seed/cat-new-arrivals/1600/700', 'New Arrivals', 1, 'published'),
  ('best-sellers', 'Best Sellers', 'Best Sellers', 'Chosen again and again by our customers.', 'https://picsum.photos/seed/cat-best-sellers/1600/700', 'Best Sellers', 2, 'published'),
  ('bridal', 'The Bridal Collection', 'Bridal', 'Ceremonial silks and heirloom weaves for the wedding season.', 'https://picsum.photos/seed/cat-bridal/1600/700', 'The Bridal Collection', 3, 'published'),
  ('kanjivaram', 'Kanjivaram Icons', 'Kanjivaram', 'Temple-border Kanjivaram silks, handwoven in Kanchipuram.', 'https://picsum.photos/seed/cat-kanjivaram/1600/700', 'Kanjivaram Icons', 4, 'published'),
  ('banarasi', 'Banarasi Heirlooms', 'Banarasi', 'Zari-rich Banarasi weaves from the ghats of Varanasi.', 'https://picsum.photos/seed/cat-banarasi/1600/700', 'Banarasi Heirlooms', 5, 'published'),
  ('silk-sarees', 'Silk Sarees', 'Silk Sarees', 'Pure silk drapes, from featherlight georgette to rich brocade.', 'https://picsum.photos/seed/cat-silk-sarees/1600/700', 'Silk Sarees', 6, 'published'),
  ('trend-of-the-day', 'Trend of the Day', 'Trend of the Day', 'Today''s edit of the house''s most-wanted drapes.', 'https://picsum.photos/seed/cat-trend/1600/700', 'Trend of the Day', 7, 'published'),
  ('seasonal-special', 'Seasonal Special', 'Seasonal Special', 'Weaves and tones chosen for the season ahead.', 'https://picsum.photos/seed/cat-seasonal/1600/700', 'Seasonal Special', 8, 'published')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO store.nav_items(area, label, href, badge, position)
SELECT * FROM (VALUES
  ('utility', 'About Us', '/about', NULL, 1),
  ('utility', 'Our Showrooms', '/showrooms', NULL, 2),
  ('utility', 'Book Video Call', '/book-video-call', NULL, 3),
  ('category', 'New Arrivals', '/collections/new-arrivals', 'New', 1),
  ('category', 'Best Sellers', '/collections/best-sellers', NULL, 2),
  ('category', 'Bridal', '/collections/bridal', NULL, 3),
  ('category', 'Kanjivaram', '/collections/kanjivaram', NULL, 4),
  ('category', 'Banarasi', '/collections/banarasi', NULL, 5),
  ('category', 'Silk Sarees', '/collections/silk-sarees', 'Exclusive', 6),
  ('footer_shop', 'New arrivals', '/collections/new-arrivals', NULL, 1),
  ('footer_shop', 'Silk sarees', '/collections/silk-sarees', NULL, 2),
  ('footer_shop', 'Best sellers', '/collections/best-sellers', NULL, 3),
  ('footer_shop', 'Bridal', '/collections/bridal', NULL, 4),
  ('footer_care', 'Store locator', '/showrooms', NULL, 1),
  ('footer_care', 'Shipping & delivery', '/policies/shipping', NULL, 2),
  ('footer_care', 'Returns & exchanges', '/policies/returns', NULL, 3),
  ('footer_care', 'Track your order', '/account/orders', NULL, 4),
  ('footer_care', 'Contact us', 'mailto:care@lakshmisarees.example', NULL, 5),
  ('footer_social', 'Instagram', 'https://instagram.com', NULL, 1),
  ('footer_social', 'YouTube', 'https://youtube.com', NULL, 2),
  ('footer_social', 'Pinterest', 'https://pinterest.com', NULL, 3),
  ('footer_policy', 'Privacy policy', '/policies/privacy', NULL, 1),
  ('footer_policy', 'Terms of service', '/policies/terms', NULL, 2)
) AS v(area, label, href, badge, position)
WHERE NOT EXISTS (SELECT 1 FROM store.nav_items);

INSERT INTO store.site_settings(key, value, description) VALUES
  ('trust_badge', '{"title":"Authentic Handloom","subtitle":"Silk Mark Certified"}'::JSONB, 'Header trust badge {title, subtitle}'),
  ('footer_brand_blurb', '"Celebrating ancient handloom traditions — from Kanchipuram and Banarasi brocades to hand-spun Mangalagiri cotton-silks. Each saree represents generational mastery and heirloom craftsmanship."'::JSONB, 'Footer brand paragraph'),
  ('footer_certification_label', '"Certified Pure Silk & Real Zari"'::JSONB, 'Footer certification line'),
  ('footer_newsletter_blurb', '"Subscribe for new collections, private offers and stories from the loom."'::JSONB, 'Footer newsletter prompt'),
  ('footer_copyright', '"Lakshmi Sarees. Handwoven in India."'::JSONB, 'Text after the (c) year in the footer')
ON CONFLICT (key) DO NOTHING;
-- 90_seed_minimal.sql seeds a placeholder tagline; replace it only while it is still that default.
INSERT INTO store.site_settings(key, value, description) VALUES ('tagline', '"Tradition • Elegance • You"'::JSONB, 'Header tagline')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE store.site_settings.value = '"Handwoven heritage"'::JSONB;

INSERT INTO store.policies(slug, title, last_updated, status) VALUES ('shipping', 'Shipping & Delivery', '2026-08-01', 'published')
ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, last_updated = EXCLUDED.last_updated, status = 'published'
WHERE store.policies.status = 'draft';
INSERT INTO store.policy_sections(policy_id, anchor, heading, body_html, position)
SELECT pol.id, v.anchor, v.heading, v.body_html, v.position
  FROM store.policies pol, (VALUES
    ('timelines', 'Delivery timelines', '<p>Orders ship within 2–4 business days. Domestic delivery typically takes 5–8 business days; international delivery takes 10–18 business days depending on destination.</p>', 1),
    ('charges', 'Shipping charges', '<p>Shipping is free on domestic orders over ₹5,000. Orders below that threshold, and all international orders, are charged at checkout based on weight and destination.</p>', 2),
    ('tracking', 'Order tracking', '<p>A tracking link is emailed once your order ships. You can also view shipment status from your account''s order history.</p>', 3)
  ) AS v(anchor, heading, body_html, position)
 WHERE pol.slug = 'shipping' AND NOT EXISTS (SELECT 1 FROM store.policy_sections s WHERE s.policy_id = pol.id);

INSERT INTO store.policies(slug, title, last_updated, status) VALUES ('returns', 'Returns & Exchanges', '2026-08-01', 'published')
ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, last_updated = EXCLUDED.last_updated, status = 'published'
WHERE store.policies.status = 'draft';
INSERT INTO store.policy_sections(policy_id, anchor, heading, body_html, position)
SELECT pol.id, v.anchor, v.heading, v.body_html, v.position
  FROM store.policies pol, (VALUES
    ('window', 'Return window', '<p>Unworn, unwashed sarees with original tags attached can be returned or exchanged within 7 days of delivery.</p>', 1),
    ('process', 'How to request a return', '<p>Raise a return or exchange request from the order detail page in your account. Once approved, a pickup is scheduled at no extra cost.</p>', 2),
    ('exclusions', 'Non-returnable items', '<p>Custom-stitched blouses, sale items marked "final sale", and gift cards cannot be returned or exchanged.</p>', 3)
  ) AS v(anchor, heading, body_html, position)
 WHERE pol.slug = 'returns' AND NOT EXISTS (SELECT 1 FROM store.policy_sections s WHERE s.policy_id = pol.id);

INSERT INTO store.policies(slug, title, last_updated, status) VALUES ('privacy', 'Privacy Policy', '2026-07-15', 'published')
ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, last_updated = EXCLUDED.last_updated, status = 'published'
WHERE store.policies.status = 'draft';
INSERT INTO store.policy_sections(policy_id, anchor, heading, body_html, position)
SELECT pol.id, v.anchor, v.heading, v.body_html, v.position
  FROM store.policies pol, (VALUES
    ('collection', 'Information we collect', '<p>We collect the information you provide when creating an account, placing an order, or subscribing to our newsletter — including name, email, shipping address, and order history.</p>', 1),
    ('use', 'How we use it', '<p>Your information is used to fulfil orders, provide customer support, and — with your consent — send updates about new collections and offers.</p>', 2),
    ('sharing', 'Sharing with third parties', '<p>We share order information with shipping and payment partners only as required to complete your purchase. We do not sell your data.</p>', 3)
  ) AS v(anchor, heading, body_html, position)
 WHERE pol.slug = 'privacy' AND NOT EXISTS (SELECT 1 FROM store.policy_sections s WHERE s.policy_id = pol.id);

INSERT INTO store.policies(slug, title, last_updated, status) VALUES ('terms', 'Terms of Service', '2026-07-15', 'published')
ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, last_updated = EXCLUDED.last_updated, status = 'published'
WHERE store.policies.status = 'draft';
INSERT INTO store.policy_sections(policy_id, anchor, heading, body_html, position)
SELECT pol.id, v.anchor, v.heading, v.body_html, v.position
  FROM store.policies pol, (VALUES
    ('acceptance', 'Acceptance of terms', '<p>By using this site, you agree to these terms of service and our privacy policy.</p>', 1),
    ('orders', 'Orders and pricing', '<p>Prices are listed in Indian Rupees and are subject to change without notice. We reserve the right to cancel any order suspected of fraud.</p>', 2),
    ('liability', 'Limitation of liability', '<p>The house is not liable for indirect or consequential damages arising from the use of this site or its products.</p>', 3)
  ) AS v(anchor, heading, body_html, position)
 WHERE pol.slug = 'terms' AND NOT EXISTS (SELECT 1 FROM store.policy_sections s WHERE s.policy_id = pol.id);

INSERT INTO store.cms_pages(slug, title, status, published_at) VALUES ('home', 'Home', 'published', NOW())
ON CONFLICT (slug) DO NOTHING;
INSERT INTO store.cms_blocks(page_id, type, position, payload)
SELECT pg.id, v.type, v.position, v.payload
  FROM store.cms_pages pg, (VALUES
    ('six-moods', 1, '{"eyebrow":"The Archive","title":"SIX MOODS. Timeless Drapes","note":"Discover sarees curated for every celebration, every story, every version of you.","moods":[{"label":"Wedding Edit","image":"https://picsum.photos/seed/mood-wedding/900/1150","href":"/collections/bridal"},{"label":"Kanchipuram Icons","image":"https://picsum.photos/seed/mood-kanchipuram/900/1150","href":"/collections/kanjivaram"},{"label":"Banarasi Heirlooms","image":"https://picsum.photos/seed/mood-banarasi/900/1150","href":"/collections/banarasi"},{"label":"Festive Radiance","image":"https://picsum.photos/seed/mood-festive/900/1150","href":"/collections/best-sellers"},{"label":"Zari Signatures","image":"https://picsum.photos/seed/mood-zari/900/1150","href":"/collections/silk-sarees"},{"label":"Bridal Glam","image":"https://picsum.photos/seed/mood-bridal-glam/900/1150","href":"/collections/bridal"}]}'::JSONB),
    ('brand-story', 2, '{"eyebrow":"The Signatures","title":"Woven to Be Remembered","ctaLabel":"Explore the edit","ctaHref":"/collections/silk-sarees","products":["kanjeevaram-ember","rukhani-temple-silk","saanjh-maroon-banarasi","prerna-festive-silk"]}'::JSONB),
    ('product-carousel', 3, '{"eyebrow":"Fresh from the loom","title":"New Arrivals","collectionSlug":"new-arrivals","ctaLabel":"View all new arrivals","ctaHref":"/collections/new-arrivals","layout":"shelf"}'::JSONB),
    ('product-carousel', 4, '{"eyebrow":"Chosen again and again","title":"Best Sellers","collectionSlug":"best-sellers","ctaLabel":"View all best sellers","ctaHref":"/collections/best-sellers","layout":"shelf"}'::JSONB),
    ('bridal-spotlight', 5, '{"title":"The Bridal Collection","heroImage":"https://picsum.photos/seed/bridal-hero/900/1150","ctaHref":"/collections/bridal","collectionSlug":"bridal"}'::JSONB),
    ('product-carousel', 6, '{"eyebrow":"Today''s edit","title":"Trend of the Day","collectionSlug":"trend-of-the-day","ctaLabel":"View all","ctaHref":"/collections/trend-of-the-day","layout":"mini"}'::JSONB),
    ('product-carousel', 7, '{"eyebrow":"For the season","title":"Seasonal Special","collectionSlug":"seasonal-special","ctaLabel":"View all","ctaHref":"/collections/seasonal-special","layout":"mini"}'::JSONB),
    ('campaign-banner', 8, '{"eyebrow":"Season Forecast","title":"Autumn–Winter 2026","note":"Three readings on how the house is dressing the season — chosen from the looms that set it apart.","ctaLabel":"Explore the forecast","ctaHref":"/collections/seasonal-special","looks":[{"label":"Jewel Tones","image":"https://picsum.photos/seed/season-jewel-tones/900/1150"},{"label":"Garden Brights","image":"https://picsum.photos/seed/season-garden-brights/900/1150"},{"label":"Heirloom Reds","image":"https://picsum.photos/seed/season-heirloom-reds/900/1150"}]}'::JSONB),
    ('edits-grid', 9, '{"eyebrow":"Curated by the house","title":"Edits for every occasion","edits":[{"label":"Festive Evenings","image":"https://picsum.photos/seed/edit-festive-evenings/900/1150","href":"/collections/best-sellers"},{"label":"Wedding Guest","image":"https://picsum.photos/seed/edit-wedding-guest/900/1150","href":"/collections/silk-sarees"},{"label":"Haldi & Mehendi","image":"https://picsum.photos/seed/edit-haldi-mehendi/900/1150","href":"/collections/seasonal-special"},{"label":"Family Pujas","image":"https://picsum.photos/seed/edit-family-pujas/900/1150","href":"/collections/banarasi"}]}'::JSONB),
    ('collection-tiles', 10, '{"tiles":[{"index":"Edit 01","title":"The Wedding Edit","image":"https://picsum.photos/seed/tile-wedding-edit/900/1150","href":"/collections/bridal"},{"index":"Edit 02","title":"Heritage Weaves","image":"https://picsum.photos/seed/tile-heritage-weaves/900/1150","href":"/collections/banarasi"},{"index":"Edit 03","title":"The New Drape","image":"https://picsum.photos/seed/tile-new-drape/900/1150","href":"/collections/new-arrivals"},{"index":"Edit 04","title":"Private Atelier","image":"https://picsum.photos/seed/tile-private-atelier/900/1150","href":"/collections/kanjivaram"}]}'::JSONB),
    ('editorial-panels', 11, '{"eyebrow":"Current offers","title":"Worth your attention","ctaLabel":"Shop all offers","ctaHref":"/collections/best-sellers","panels":[{"image":"https://picsum.photos/seed/panel-private-viewing/900/1150","eyebrow":"Private Viewing","title":"The Heirloom Hour","ctaLabel":"Book a visit"},{"image":"https://picsum.photos/seed/panel-members-only/900/1150","eyebrow":"Members Only","title":"Early access, always","ctaLabel":"Join now"},{"image":"https://picsum.photos/seed/panel-bundle-offer/900/1150","eyebrow":"Bundle Offer","title":"Two drapes, one price","ctaLabel":"Shop the pair"},{"image":"https://picsum.photos/seed/panel-current-offer/900/1150","eyebrow":"Current Offer","title":"Woven silks, in motion","ctaLabel":"Shop the offer","highlighted":true},{"image":"https://picsum.photos/seed/panel-gift-card/900/1150","eyebrow":"Gift Card","title":"Give the loom","ctaLabel":"Send a gift"},{"image":"https://picsum.photos/seed/panel-free-stitching/900/1150","eyebrow":"Free Stitching","title":"Made-to-drape blouse","ctaLabel":"Learn more"}]}'::JSONB),
    ('film-slider', 12, '{"title":"The Lookbook","slides":[{"title":"The Festive Morning","story":"Zari Silk · Jasmine","tags":"festive, silk","image":"https://picsum.photos/seed/film-festive-morning/900/1150"},{"title":"The Courtyard Study","story":"Soft Silk · Sunlight","tags":"soft-silk, editorial","image":"https://picsum.photos/seed/film-courtyard-study/900/1150"},{"title":"The Wedding Story","story":"Ceremonial Silk · Family","tags":"bridal, ceremonial","image":"https://picsum.photos/seed/film-wedding-story/900/1150"},{"title":"The Architecture Study","story":"Zari Silk · Temple Light","tags":"temple, zari","image":"https://picsum.photos/seed/film-architecture-study/900/1150"}]}'::JSONB),
    ('card-stack', 13, '{"eyebrow":"Tales of tradition","title":"Latest Trends","images":["https://picsum.photos/seed/trend-stack-1/900/1150","https://picsum.photos/seed/trend-stack-2/900/1150","https://picsum.photos/seed/trend-stack-3/900/1150"],"ranges":[{"label":"Kanjivaram","count":24,"href":"/collections/kanjivaram"},{"label":"Banarasi","count":18,"href":"/collections/banarasi"},{"label":"Bridal","count":12,"href":"/collections/bridal"},{"label":"Best Sellers","count":30,"href":"/collections/best-sellers"}]}'::JSONB)
  ) AS v(type, position, payload)
 WHERE pg.slug = 'home' AND NOT EXISTS (SELECT 1 FROM store.cms_blocks b WHERE b.page_id = pg.id);
