-- =====================================================================================
-- CMS  (Landing page SDUI blocks, nav/footer shell, policies, media, revalidation outbox)
-- =====================================================================================
-- Decision: content lives in this database (Cloud SQL), not an external headless CMS. Homepage
-- sections are ordered JSONB blocks whose `type` + `payload` match the TS HomepageBlock
-- union. Requirements for the admin screen: design_docs/admin/admin-cms-requirements.md.

CREATE TABLE IF NOT EXISTS store.media_assets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url        TEXT NOT NULL UNIQUE,
  alt        TEXT NOT NULL DEFAULT '',
  mime_type  TEXT,
  width      INT,
  height     INT,
  bytes      BIGINT,
  uploaded_by UUID REFERENCES store.staff_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A page that is built from blocks: 'home' plus future seasonal/campaign landing pages.
CREATE TABLE IF NOT EXISTS store.cms_pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),   -- 'home', 'autumn-winter-2026'
  title       TEXT NOT NULL,
  seo_title   TEXT,
  seo_description TEXT,
  og_image_url TEXT,
  status      store.content_status NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT store.add_touch_trigger('store.cms_pages');

CREATE TABLE IF NOT EXISTS store.cms_blocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     UUID NOT NULL REFERENCES store.cms_pages(id) ON DELETE CASCADE,
  -- Must match the renderer's switch (SectionRenderer). Unknown types are skipped, not fatal.
  type        TEXT NOT NULL CHECK (type IN (
                'six-moods','brand-story','product-carousel','bridal-spotlight','campaign-banner',
                'edits-grid','collection-tiles','editorial-panels','film-slider','card-stack')),
  position    INT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(payload) = 'object'),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,        -- toggle a section without deleting it
  starts_at   TIMESTAMPTZ,                          -- scheduled go-live (campaigns)
  ends_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
SELECT store.add_touch_trigger('store.cms_blocks');
-- cms-homepage-get: active blocks of one page in order (scheduling window is filtered on the few rows left)
CREATE INDEX IF NOT EXISTS idx_cms_blocks_page_pos ON store.cms_blocks(page_id, position) WHERE is_active;

-- Navigation shell shared by every page (nav-get): header utility bar, category bar, footer.
CREATE TABLE IF NOT EXISTS store.nav_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area       TEXT NOT NULL CHECK (area IN ('utility','category','footer_shop','footer_care','footer_policy','footer_social')),
  label      TEXT NOT NULL,
  href       TEXT NOT NULL,
  badge      TEXT,
  position   INT NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT store.add_touch_trigger('store.nav_items');
-- nav-get: active items per area in order
CREATE INDEX IF NOT EXISTS idx_nav_items_area ON store.nav_items(area, position) WHERE is_active;

-- Single source of truth for values that are currently hard-coded in more than one place
-- (free-shipping threshold, max line quantity, tagline, trust badge, footer copy ...).
CREATE TABLE IF NOT EXISTS store.site_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES store.staff_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store.policies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',             -- becomes the meta description
  last_updated DATE NOT NULL DEFAULT CURRENT_DATE,
  status       store.content_status NOT NULL DEFAULT 'draft',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT store.add_touch_trigger('store.policies');

CREATE TABLE IF NOT EXISTS store.policy_sections (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id  UUID NOT NULL REFERENCES store.policies(id) ON DELETE CASCADE,
  anchor     TEXT NOT NULL CHECK (anchor ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),   -- stable id used by deep links
  heading    TEXT NOT NULL,
  -- Sanitised on WRITE by the admin function (allow-list: p, ul, ol, li, a, strong, em, h3, br, table).
  body_html  TEXT NOT NULL DEFAULT '',
  position   INT NOT NULL DEFAULT 0,
  UNIQUE (policy_id, anchor)
);
CREATE INDEX IF NOT EXISTS idx_policy_sections_policy ON store.policy_sections(policy_id, position);

-- Audit/rollback for every content edit made in the admin screen.
CREATE TABLE IF NOT EXISTS store.content_revisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,                         -- 'cms_page' | 'cms_block' | 'policy' | 'product' | 'category' | 'nav'
  entity_id   UUID NOT NULL,
  snapshot    JSONB NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('create','update','publish','unpublish','delete')),
  edited_by   UUID REFERENCES store.staff_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_content_revisions_entity ON store.content_revisions(entity_type, entity_id, created_at DESC);

-- ---- Revalidation outbox (content-revalidate-orchestrator) ----------------------------
-- Triggers append the Next.js paths/tags a change affects; the orchestrator function
-- drains unprocessed rows and calls revalidatePath/revalidateTag. Replaces timer-based ISR.
CREATE TABLE IF NOT EXISTS store.revalidation_events (
  id           BIGSERIAL PRIMARY KEY,
  entity_type  TEXT NOT NULL,
  entity_ref   TEXT NOT NULL,                        -- slug
  paths        TEXT[] NOT NULL DEFAULT '{}',
  tags         TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error        TEXT
);
CREATE INDEX IF NOT EXISTS idx_revalidation_pending ON store.revalidation_events(id) WHERE processed_at IS NULL;
-- orchestrator housekeeping: purge processed rows by age
CREATE INDEX IF NOT EXISTS idx_revalidation_processed ON store.revalidation_events(processed_at) WHERE processed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION store.enqueue_revalidation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  slug TEXT;
  paths TEXT[];
BEGIN
  slug := COALESCE(to_jsonb(NEW)->>'slug', to_jsonb(OLD)->>'slug', '');
  paths := CASE TG_ARGV[0]
    WHEN 'product'  THEN ARRAY['/product/' || slug, '/sitemap.xml']
    WHEN 'category' THEN ARRAY['/collections/' || slug, '/sitemap.xml']
    WHEN 'policy'   THEN ARRAY['/policies/' || slug]
    WHEN 'cms_page' THEN ARRAY[CASE WHEN slug = 'home' THEN '/' ELSE '/' || slug END]
    WHEN 'nav'      THEN ARRAY['/']
    ELSE ARRAY[]::TEXT[]
  END;
  INSERT INTO store.revalidation_events(entity_type, entity_ref, paths, tags)
  VALUES (TG_ARGV[0], slug, paths, ARRAY[TG_ARGV[0] || ':' || slug]);
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Block / nav / section edits revalidate the parent page rather than themselves.
CREATE OR REPLACE FUNCTION store.enqueue_revalidation_block()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  pg_slug TEXT;
BEGIN
  SELECT slug INTO pg_slug FROM store.cms_pages WHERE id = COALESCE(NEW.page_id, OLD.page_id);
  INSERT INTO store.revalidation_events(entity_type, entity_ref, paths, tags)
  VALUES ('cms_page', COALESCE(pg_slug, ''), ARRAY[CASE WHEN pg_slug = 'home' THEN '/' ELSE '/' || COALESCE(pg_slug, '') END],
          ARRAY['cms_page:' || COALESCE(pg_slug, '')]);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION store.enqueue_revalidation_policy_section()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  p_slug TEXT;
BEGIN
  SELECT slug INTO p_slug FROM store.policies WHERE id = COALESCE(NEW.policy_id, OLD.policy_id);
  INSERT INTO store.revalidation_events(entity_type, entity_ref, paths, tags)
  VALUES ('policy', COALESCE(p_slug, ''), ARRAY['/policies/' || COALESCE(p_slug, '')], ARRAY['policy:' || COALESCE(p_slug, '')]);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_reval_products') THEN
    CREATE TRIGGER trg_reval_products AFTER INSERT OR UPDATE OR DELETE ON store.products
      FOR EACH ROW EXECUTE FUNCTION store.enqueue_revalidation('product');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_reval_categories') THEN
    CREATE TRIGGER trg_reval_categories AFTER INSERT OR UPDATE OR DELETE ON store.categories
      FOR EACH ROW EXECUTE FUNCTION store.enqueue_revalidation('category');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_reval_policies') THEN
    CREATE TRIGGER trg_reval_policies AFTER INSERT OR UPDATE OR DELETE ON store.policies
      FOR EACH ROW EXECUTE FUNCTION store.enqueue_revalidation('policy');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_reval_cms_pages') THEN
    CREATE TRIGGER trg_reval_cms_pages AFTER INSERT OR UPDATE OR DELETE ON store.cms_pages
      FOR EACH ROW EXECUTE FUNCTION store.enqueue_revalidation('cms_page');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_reval_cms_blocks') THEN
    CREATE TRIGGER trg_reval_cms_blocks AFTER INSERT OR UPDATE OR DELETE ON store.cms_blocks
      FOR EACH ROW EXECUTE FUNCTION store.enqueue_revalidation_block();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_reval_nav_items') THEN
    CREATE TRIGGER trg_reval_nav_items AFTER INSERT OR UPDATE OR DELETE ON store.nav_items
      FOR EACH ROW EXECUTE FUNCTION store.enqueue_revalidation('nav');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_reval_policy_sections') THEN
    CREATE TRIGGER trg_reval_policy_sections AFTER INSERT OR UPDATE OR DELETE ON store.policy_sections
      FOR EACH ROW EXECUTE FUNCTION store.enqueue_revalidation_policy_section();
  END IF;
END
$$;
