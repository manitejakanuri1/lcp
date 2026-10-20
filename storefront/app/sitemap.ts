import type { MetadataRoute } from 'next';
import { getNav } from '@/lib/cloud-functions/nav';
import { searchCategoryProducts } from '@/lib/cloud-functions/catalog';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const POLICY_SLUGS = ['shipping', 'returns', 'privacy', 'terms'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const nav = await getNav();
  const categorySlugs = nav.categories.map((link) => link.href.replace('/collections/', ''));

  const productSlugSet = new Set<string>();
  for (const slug of categorySlugs) {
    const { products } = await searchCategoryProducts({ slug, pageSize: 100 });
    for (const product of products) productSlugSet.add(product.slug);
  }

  return [
    { url: SITE_URL, priority: 1 },
    ...categorySlugs.map((slug) => ({ url: `${SITE_URL}/collections/${slug}`, priority: 0.8 })),
    ...[...productSlugSet].map((slug) => ({ url: `${SITE_URL}/product/${slug}`, priority: 0.7 })),
    ...POLICY_SLUGS.map((slug) => ({ url: `${SITE_URL}/policies/${slug}`, priority: 0.3 })),
  ];
}
