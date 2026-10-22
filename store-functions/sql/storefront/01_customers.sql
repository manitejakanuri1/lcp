-- =====================================================================================
-- CUSTOMERS, ADDRESSES, STAFF  (Account pages: details + address book; Orders ownership)
-- =====================================================================================
-- Identity is external. A customer row is created by the cloud functions on first verified
-- sign-in (auth-session-verify). `customer_identities` lets several providers (Google,
-- email/password, phone) link to one customer. Passwords are NEVER stored here: the identity
-- platform owns them, so account-password-change must delegate to it.

CREATE TABLE IF NOT EXISTS store.customers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            CITEXT UNIQUE,                     -- from the IdP; null only for phone-only sign-in
  email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  first_name       TEXT NOT NULL DEFAULT '',
  last_name        TEXT NOT NULL DEFAULT '',
  display_name     TEXT NOT NULL DEFAULT '',
  phone            TEXT CHECK (phone IS NULL OR phone ~ '^\+?[0-9 ()-]{7,20}$'),
  member_tier      TEXT NOT NULL DEFAULT 'Heritage',  -- "Verified … Member" pill on the details page
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  is_blocked       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- "Member since"
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT store.add_touch_trigger('store.customers');

CREATE TABLE IF NOT EXISTS store.customer_identities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES store.customers(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,                         -- 'google.com' | 'password' | 'phone' | ...
  provider_uid TEXT NOT NULL,                         -- the IdP's stable user id (token sub/uid)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_uid)
);
CREATE INDEX IF NOT EXISTS idx_customer_identities_customer ON store.customer_identities(customer_id);

CREATE TABLE IF NOT EXISTS store.addresses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES store.customers(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT 'Home',
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL CHECK (phone ~ '^\+?[0-9 ()-]{7,20}$'),
  line1       TEXT NOT NULL,
  line2       TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL,
  state       TEXT NOT NULL,
  pincode     TEXT NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),   -- Indian PIN code
  country     CHAR(2) NOT NULL DEFAULT 'IN',
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT store.add_touch_trigger('store.addresses');
-- addresses-get: one customer, default first (also covers the FK on customer_id)
CREATE INDEX IF NOT EXISTS idx_addresses_customer ON store.addresses(customer_id, is_default DESC, created_at DESC);
-- At most one default per customer. address-delete promotes the next one in the function.
CREATE UNIQUE INDEX IF NOT EXISTS uq_addresses_one_default
  ON store.addresses(customer_id) WHERE is_default;

-- Everyone who signs in to the back office: admin/CMS staff AND the shop's POS users (founder, salesman).
-- Replaces the old Supabase `profiles` table. provider_uid = Firebase uid; the role here is authoritative.
CREATE TABLE IF NOT EXISTS store.staff_users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     TEXT NOT NULL DEFAULT 'firebase',
  provider_uid TEXT NOT NULL,
  email        CITEXT NOT NULL UNIQUE,
  full_name    TEXT NOT NULL DEFAULT '',
  role         TEXT NOT NULL CHECK (role IN ('founder','salesman','admin','merchandiser','editor','support')),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_uid)
);
SELECT store.add_touch_trigger('store.staff_users');
