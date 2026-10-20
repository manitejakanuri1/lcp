import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCategory, searchCategoryProducts } from '@/lib/cloud-functions/catalog';
import { getNav } from '@/lib/cloud-functions/nav';
import { CloudFunctionError } from '@/lib/cloud-functions/client';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { CollectionFilters } from '@/components/CollectionFilters';
import { ProductGrid } from '@/components/ProductGrid';
import { Pagination } from '@/components/Pagination';

export const revalidate = 300;

type SortValue = 'price-asc' | 'price-desc' | 'newest' | 'popularity';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

// Pre-builds the categories linked from the header nav; any other category slug
// (e.g. trend-of-the-day) is still served via ISR fallback (dynamicParams defaults to true).
export async function generateStaticParams() {
  const nav = await getNav();
  return nav.categories
    .filter((link) => link.href.startsWith('/collections/'))
    .map((link) => ({ slug: link.href.replace('/collections/', '') }));
}

async function loadCategory(slug: string) {
  try {
    return await getCategory(slug);
  } catch (error) {
    if (error instanceof CloudFunctionError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await loadCategory(slug);
  if (!category) return {};

  return {
    title: category.title,
    description: category.description,
    alternates: { canonical: `/collections/${slug}` },
  };
}

export default async function CollectionPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;

  const category = await loadCategory(slug);
  if (!category) notFound();

  const result = await searchCategoryProducts({
    slug,
    fabric: query.fabric,
    color: query.color,
    minPrice: query.minPrice ? Number(query.minPrice) : undefined,
    maxPrice: query.maxPrice ? Number(query.maxPrice) : undefined,
    sort: (query.sort as SortValue) || 'newest',
    page: query.page ? Number(query.page) : 1,
  });

  return (
    <div className="container">
      <Breadcrumbs items={category.breadcrumb} />
      <header className="category-header">
        <h1>{category.title}</h1>
        <p>{category.description}</p>
      </header>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: category.title,
            breadcrumb: {
              '@type': 'BreadcrumbList',
              itemListElement: category.breadcrumb.map((item, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name: item.label,
                item: item.href,
              })),
            },
          }),
        }}
      />

      <CollectionFilters fabricFacets={result.facets.fabric} colorFacets={result.facets.color} />

      <ProductGrid products={result.products} emptyMessage="No sarees match these filters yet." />

      <Pagination
        page={result.pagination.page}
        pageSize={result.pagination.pageSize}
        total={result.pagination.total}
        basePath={`/collections/${slug}`}
        searchParams={query}
      />
    </div>
  );
}
