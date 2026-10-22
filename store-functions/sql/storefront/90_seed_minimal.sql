-- =====================================================================================
-- MINIMAL SEED  (safe to re-run; replaces the values currently hard-coded in the apps)
-- =====================================================================================

-- Business constants that today are duplicated in the storefront (wishlist page, cart line item)
-- AND the functions (data/cart.ts). Read these from here instead.
INSERT INTO store.site_settings(key, value, description) VALUES
  ('free_shipping_threshold', '2999'::JSONB, 'INR subtotal above which shipping is free'),
  ('max_line_quantity',       '10'::JSONB,   'Maximum units of one variant per cart line'),
  ('low_stock_threshold',     '3'::JSONB,    'Show "only N left" at or below this'),
  ('reservation_minutes',     '15'::JSONB,   'How long an unpaid order holds its stock'),
  ('return_window_days',      '7'::JSONB,    'Days after delivery a return/exchange may be requested (CONFIRM with policy text)'),
  ('tagline',                 '"Handwoven heritage"'::JSONB, 'Header tagline'),
  ('support_email',           '"support@lakshmisarees.example"'::JSONB, 'Policy-page contact link')
ON CONFLICT (key) DO NOTHING;

-- The three mock coupon codes used by promotion-validate today.
INSERT INTO store.promotions(code, description, discount_type, discount_value, max_discount, min_subtotal) VALUES
  ('HERITAGE10', '10% off (up to Rs 5,000)',   'percent', 10, 5000, 0),
  ('WELCOME5',   '5% off for new customers',   'percent', 5,  NULL, 0),
  ('FESTIVE500', 'Rs 500 off above Rs 5,000',  'fixed',   500, NULL, 5000)
ON CONFLICT (code) DO NOTHING;

-- Page shells so the admin screen and renderer have something to attach to.
INSERT INTO store.cms_pages(slug, title, status, published_at) VALUES
  ('home', 'Home', 'published', NOW())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO store.policies(slug, title, status) VALUES
  ('shipping', 'Shipping & Delivery',  'draft'),
  ('returns',  'Returns & Exchanges',  'draft'),
  ('privacy',  'Privacy Policy',       'draft'),
  ('terms',    'Terms of Service',     'draft')
ON CONFLICT (slug) DO NOTHING;

-- ---------- Interim dummy customer (decision D13: exactly ONE seeded user) ----------
-- Same id/email/addresses as store_functions/src/data/customers.ts, so the mock and the database agree.
-- The password is NOT in this file. After running it, create the credential row with a hash from:
--   cd store_functions && npx tsx scripts/hash-password.ts '<the password>'
--   INSERT INTO store.customer_credentials(customer_id, password_hash)
--   VALUES ('00000000-0000-4000-8000-000000000001', '<printed hash>') ON CONFLICT (customer_id) DO NOTHING;
-- Delete this customer (and customer_credentials) when the identity provider goes live.
INSERT INTO store.customers(id, email, email_verified, first_name, last_name, display_name, phone, member_tier, created_at)
VALUES ('00000000-0000-4000-8000-000000000001', 'nandan.sai@example.com', TRUE, 'Nandan', 'Sai', 'Nandan Sai',
        '+91 98765 43210', 'Handloom Club', '2024-08-14T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO store.addresses(id, customer_id, label, name, phone, line1, line2, city, state, pincode, is_default) VALUES
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Home',   'Nandan Sai', '+91 98765 43210',
   '12-4-88, Lakshmi Nagar', 'Near Temple Road', 'Hyderabad', 'Telangana', '500072', TRUE),
  ('a0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Office', 'Nandan Sai', '+91 98765 43210',
   'Plot 21, Madhapur IT Park', '', 'Hyderabad', 'Telangana', '500081', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Shipping that matches today's mock rule (Rs 150 under Rs 2,999, free from Rs 2,999).
INSERT INTO store.shipping_methods(code, name, description, est_days_min, est_days_max, sort_order) VALUES
  ('standard', 'Standard delivery', 'Insured courier delivery across India', 3, 7, 1)
ON CONFLICT (code) DO NOTHING;
INSERT INTO store.shipping_rates(method_id, min_subtotal, max_subtotal, flat_rate)
SELECT m.id, v.min_subtotal, v.max_subtotal, v.flat_rate
FROM store.shipping_methods m,
     (VALUES (0::NUMERIC, 2999::NUMERIC, 150::NUMERIC), (2999, NULL, 0)) AS v(min_subtotal, max_subtotal, flat_rate)
WHERE m.code = 'standard'
  AND NOT EXISTS (SELECT 1 FROM store.shipping_rates r WHERE r.method_id = m.id);

-- GST: intentionally NOT seeded. Rates depend on the accountant's answer to Q5; until tax_rules has rows,
-- order creation falls back to products.tax_rate (default 5%).
