import { query } from '../shared/db';
import type { NavLink } from '../shared/types';

interface NavRow {
  area: string;
  label: string;
  href: string;
  badge: string | null;
}

export interface NavData {
  utilityLinks: NavLink[];
  trustBadge: { title: string; subtitle: string };
  tagline: string;
  categories: (NavLink & { badge?: string })[];
  footer: {
    brandBlurb: string;
    certificationLabel: string;
    shopLinks: NavLink[];
    careLinks: NavLink[];
    newsletterBlurb: string;
    socialLinks: NavLink[];
    policyLinks: NavLink[];
    copyright: string;
  };
}

const link = (r: NavRow): NavLink => ({ label: r.label, href: r.href });

/** Header + footer content: store.nav_items (by area) and store.site_settings (texts). */
export async function loadNav(): Promise<NavData> {
  const [items, settings] = await Promise.all([
    query<NavRow>(`SELECT area, label, href, badge FROM store.nav_items WHERE is_active ORDER BY area, position, label`),
    query<{ key: string; value: unknown }>(
      `SELECT key, value FROM store.site_settings
        WHERE key IN ('tagline','trust_badge','footer_brand_blurb','footer_certification_label','footer_newsletter_blurb','footer_copyright')`,
    ),
  ]);
  const area = (name: string) => items.rows.filter((r) => r.area === name);
  const setting = new Map(settings.rows.map((r) => [r.key, r.value]));
  const text = (key: string) => (typeof setting.get(key) === 'string' ? (setting.get(key) as string) : '');
  const badge = (setting.get('trust_badge') ?? {}) as { title?: string; subtitle?: string };

  return {
    utilityLinks: area('utility').map(link),
    trustBadge: { title: badge.title ?? '', subtitle: badge.subtitle ?? '' },
    tagline: text('tagline'),
    categories: area('category').map((r) => ({ ...link(r), ...(r.badge ? { badge: r.badge } : {}) })),
    footer: {
      brandBlurb: text('footer_brand_blurb'),
      certificationLabel: text('footer_certification_label'),
      shopLinks: area('footer_shop').map(link),
      careLinks: area('footer_care').map(link),
      newsletterBlurb: text('footer_newsletter_blurb'),
      socialLinks: area('footer_social').map(link),
      policyLinks: area('footer_policy').map(link),
      copyright: `© ${new Date().getFullYear()} ${text('footer_copyright')}`,
    },
  };
}
