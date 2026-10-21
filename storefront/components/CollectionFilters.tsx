'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FacetValue } from '@/lib/types';

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'popularity', label: 'Popularity' },
];

/** The bands a shopper thinks in. `max` is left out on the last one: there is no ceiling. */
const PRICE_BANDS: { label: string; min?: number; max?: number }[] = [
  { label: 'Under ₹999', max: 999 },
  { label: '₹1000 – ₹1499', min: 1000, max: 1499 },
  { label: '₹1500 – ₹1999', min: 1500, max: 1999 },
  { label: '₹2000 & above', min: 2000 },
];

/**
 * Filtering is split in two, as the shop asked: price and fabric read across the top, colour
 * and sort stand in a column beside the sarees. Both halves write to the same query string,
 * so every combination stays shareable and the server component re-runs its search
 * (02-section-page.md).
 */
function useFilterState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const set = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  return {
    set,
    fabric: searchParams.get('fabric') ?? '',
    color: searchParams.get('color') ?? '',
    sort: searchParams.get('sort') ?? 'newest',
    min: searchParams.get('minPrice') ?? '',
    max: searchParams.get('maxPrice') ?? '',
  };
}

/** Price and fabric, across the top of the list. */
export function CollectionFilters({ fabricFacets }: { fabricFacets: FacetValue[] }) {
  const { set, fabric, min, max } = useFilterState();
  const bandIsOn = (band: { min?: number; max?: number }) =>
    String(band.min ?? '') === min && String(band.max ?? '') === max;

  return (
    <div className="collection-filters">
      <div className="filter-row">
        <span className="filter-row-label">Price</span>
        <div className="pill-row">
          {PRICE_BANDS.map((band) => (
            <button
              key={band.label}
              type="button"
              aria-pressed={bandIsOn(band)}
              className={bandIsOn(band) ? 'pill pill-on' : 'pill'}
              onClick={() =>
                set(
                  bandIsOn(band)
                    ? { minPrice: null, maxPrice: null }
                    : { minPrice: band.min ? String(band.min) : null, maxPrice: band.max ? String(band.max) : null },
                )
              }
            >
              {band.label}
            </button>
          ))}
        </div>
      </div>

      {fabricFacets.length > 0 && (
        <div className="filter-row">
          <span className="filter-row-label">Fabric</span>
          <div className="pill-row">
            {fabricFacets.map((facet) => (
              <button
                key={facet.value}
                type="button"
                aria-pressed={fabric === facet.value}
                className={fabric === facet.value ? 'pill pill-on' : 'pill'}
                onClick={() => set({ fabric: fabric === facet.value ? null : facet.value })}
              >
                {facet.value} <span className="pill-count">{facet.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Colour and sort, in the column beside the sarees. On a phone the whole column folds into
 * one "Filters" line, because a list of colours would otherwise push the sarees off screen.
 */
export function CollectionSideFilters({ colorFacets }: { colorFacets: FacetValue[] }) {
  const { set, color, sort, fabric, min, max } = useFilterState();
  const hasFilters = Boolean(fabric || color || min || max);

  return (
    <aside className="filter-side">
      <details className="filter-side-box" open>
        <summary className="filter-side-summary">Filters</summary>

        {colorFacets.length > 0 && (
          <>
            <p className="filter-row-label filter-side-label">Colour</p>
            <ul className="colour-list">
              {colorFacets.map((facet) => (
                <li key={facet.value}>
                  <button
                    type="button"
                    aria-pressed={color === facet.value}
                    className={color === facet.value ? 'colour-item colour-item-on' : 'colour-item'}
                    onClick={() => set({ color: color === facet.value ? null : facet.value })}
                  >
                    <span>{facet.value}</span>
                    <span className="pill-count">{facet.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="filter-row-label filter-side-label">Sort</p>
        <select
          id="sort-filter"
          aria-label="Sort"
          value={sort}
          onChange={(event) => set({ sort: event.target.value })}
          className="filter-side-select"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            type="button"
            className="clear-filters"
            onClick={() => set({ fabric: null, color: null, minPrice: null, maxPrice: null })}
          >
            Clear all
          </button>
        )}
      </details>
    </aside>
  );
}
