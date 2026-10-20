'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { searchProducts } from '@/lib/cloud-functions/search';
import { formatPrice } from '@/lib/format';
import type { ProductSummary } from '@/lib/types';

const DEBOUNCE_MS = 300;

export function SearchBox() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductSummary[]>([]);
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const trimmed = query.trim();

    timeoutRef.current = setTimeout(async () => {
      if (!trimmed) {
        setResults([]);
        setOpen(false);
        return;
      }

      try {
        const { results: matches } = await searchProducts(trimmed);
        setResults(matches);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeoutRef.current);
  }, [query]);

  return (
    <div className="relative w-full max-w-xs">
      <input
        type="search"
        placeholder="Search weave, zari, color…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="Search products"
        className="w-full rounded-lg bg-surface-container-low px-3 py-2 font-body text-sm text-primary outline-none placeholder:text-on-surface-variant/70 focus:ring-1 focus:ring-antique-gold"
      />
      {open && results.length > 0 && (
        <ul className="absolute top-full right-0 left-0 z-10 mt-1 max-h-80 overflow-y-auto rounded-lg border border-antique-gold/20 bg-warm-ivory shadow-lg">
          {results.map((product) => (
            <li key={product.id}>
              <Link
                href={`/product/${product.slug}`}
                className="block px-3 py-2 font-body text-sm text-primary hover:bg-pale-gold"
              >
                {product.name} — {formatPrice(product.discountPrice ?? product.price)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
