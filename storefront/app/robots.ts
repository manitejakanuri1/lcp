import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Cart/wishlist/account are CSR-only, per-user surfaces — no SEO value (tech_req §5).
      disallow: ['/cart', '/wishlist', '/account'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
