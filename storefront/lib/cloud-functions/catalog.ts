import { callFunction } from './client';
import type { Category, CategoryProductsSearchResult, PriceStockPayload, Product, ProductSummary } from '../types';

/** Batched product summaries for homepage product-carousel blocks, driven by the CMS payload's collection ref. */
export function getProductSummaries(params: { collection?: string; ids?: string[]; limit?: number }): Promise<{ products: ProductSummary[] }> {
  return callFunction('catalog-product-summaries-get', {
    next: { revalidate: 120 },
    query: { collection: params.collection, ids: params.ids?.join(','), limit: params.limit },
  });
}

/** Category metadata + breadcrumb — build time + ISR revalidation. */
export function getCategory(slug: string): Promise<Category> {
  return callFunction<Category>('catalog-category-get', { query: { slug }, next: { revalidate: 300 } });
}

export interface CategoryProductsSearchParams {
  slug: string;
  fabric?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'price-asc' | 'price-desc' | 'newest' | 'popularity';
  page?: number;
  pageSize?: number;
}

/**
 * Paginated/filterable/sortable product list with facet counts. Used both for the
 * first page at build time (server component, revalidated) and for subsequent
 * filter/sort/pagination changes, which happen by navigating to a new query-string
 * URL (kept shareable/bookmarkable per 02-section-page.md) rather than a raw client
 * fetch, so the result is always re-rendered by the server component.
 */
export function searchCategoryProducts(params: CategoryProductsSearchParams): Promise<CategoryProductsSearchResult> {
  const { slug, ...rest } = params;
  return callFunction<CategoryProductsSearchResult>('catalog-category-products-search', {
    query: { slug, ...rest },
    next: { revalidate: 60 },
  });
}

/** Full product record — build time + ISR revalidation. */
export function getProduct(slug: string): Promise<Product> {
  return callFunction<Product>('catalog-product-get', { query: { slug }, next: { revalidate: 300 } });
}

/**
 * Price/stock kept separate from getProduct so it can be re-checked live — on ISR
 * revalidation, and again client-side right before add-to-cart — without trusting
 * the statically-cached product page (03-product-page.md).
 */
export function getProductPriceStock(slug: string, variantId?: string): Promise<PriceStockPayload> {
  return callFunction<PriceStockPayload>('catalog-product-price-stock-get', {
    query: { slug, variantId },
    cache: 'no-store',
  });
}

/** Related/"you may also like" carousel — build time + ISR revalidation. */
export function getRelatedProducts(slug: string, limit = 8): Promise<{ products: ProductSummary[] }> {
  return callFunction('catalog-related-products-get', { query: { slug, limit }, next: { revalidate: 300 } });
}
