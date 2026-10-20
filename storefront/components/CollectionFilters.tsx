'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FacetValue } from '@/lib/types';

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'popularity', label: 'Popularity' },
];

/**
 * Drives filter/sort/pagination by updating the URL's query string, so every
 * combination stays shareable/bookmarkable (02-section-page.md) and the resulting
 * navigation re-runs the server component's catalog-category-products-search call.
 */
export function CollectionFilters({ fabricFacets, colorFacets }: { fabricFacets: FacetValue[]; colorFacets: FacetValue[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }

  const activeFabric = searchParams.get('fabric') ?? '';
  const activeColor = searchParams.get('color') ?? '';
  const activeSort = searchParams.get('sort') ?? 'newest';
  const hasFilters = activeFabric || activeColor;

  return (
    <div className="collection-filters">
      <div className="filter-group">
        <label htmlFor="fabric-filter">Fabric</label>
        <select id="fabric-filter" value={activeFabric} onChange={(event) => updateParam('fabric', event.target.value || null)}>
          <option value="">All fabrics</option>
          {fabricFacets.map((facet) => (
            <option key={facet.value} value={facet.value}>
              {facet.value} ({facet.count})
            </option>
          ))}
        </select>
      </div>

      {colorFacets.length > 0 && (
        <div className="filter-group">
          <label htmlFor="color-filter">Colour</label>
          <select id="color-filter" value={activeColor} onChange={(event) => updateParam('color', event.target.value || null)}>
            <option value="">All colours</option>
            {colorFacets.map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facet.value} ({facet.count})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="filter-group">
        <label htmlFor="sort-select">Sort by</label>
        <select id="sort-select" value={activeSort} onChange={(event) => updateParam('sort', event.target.value)}>
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {hasFilters && (
        <button type="button" className="clear-filters" onClick={() => router.push(pathname)}>
          Clear filters
        </button>
      )}
    </div>
  );
}
