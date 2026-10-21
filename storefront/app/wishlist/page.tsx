'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getWishlist } from '@/lib/cloud-functions/wishlist';
import { formatPrice } from '@/lib/format';
import type { WishlistItem } from '@/lib/types';
import { useCartWishlist } from '@/components/shared/CartWishlistProvider';
import { BagIcon, CloseIcon, HeartIcon, ShieldIcon, TruckIcon } from '@/components/icons';

type Filter = 'all' | 'in-stock' | 'on-discount';
type Sort = 'recent' | 'price-asc' | 'price-desc' | 'savings';

// The shop ships free everywhere, so there is no threshold to reach.
const LOW_STOCK_AT = 3;

const effectivePrice = (item: WishlistItem) => item.discountPrice ?? item.price;
const savings = (item: WishlistItem) => (item.discountPrice ? item.price - item.discountPrice : 0);
const percentOff = (item: WishlistItem) => (item.discountPrice ? Math.round((savings(item) / item.price) * 100) : 0);

export default function WishlistPage() {
  const { ready, wishlist, removeFromWishlist, addToCart } = useCartWishlist();
  const [fetched, setFetched] = useState<WishlistItem[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Resolve saved ids to live price/stock once the stored list has loaded. Removals
  // are handled locally below, so this only re-runs when the page is revisited.
  useEffect(() => {
    if (!ready || wishlist.length === 0) return;
    let cancelled = false;
    getWishlist(wishlist.map((entry) => entry.id))
      .then((result) => !cancelled && setFetched(result.items))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on `ready` only
  }, [ready]);

  const addedAt = useMemo(() => new Map(wishlist.map((entry) => [entry.id, entry.addedAt])), [wishlist]);

  // Source of truth for membership is the store; `fetched` only supplies live data.
  const items = useMemo(() => (fetched ?? []).filter((item) => addedAt.has(item.id)), [fetched, addedAt]);

  const inStock = items.filter((item) => item.inStock);
  const onDiscount = items.filter((item) => item.discountPrice);

  const visible = useMemo(() => {
    const filtered = filter === 'in-stock' ? inStock : filter === 'on-discount' ? onDiscount : items;
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'price-asc':
          return effectivePrice(a) - effectivePrice(b);
        case 'price-desc':
          return effectivePrice(b) - effectivePrice(a);
        case 'savings':
          return savings(b) - savings(a);
        default:
          return (addedAt.get(b.id) ?? 0) - (addedAt.get(a.id) ?? 0);
      }
    });
  }, [items, inStock, onDiscount, filter, sort, addedAt]);

  const moveToCart = (item: WishlistItem) => {
    addToCart(item.id, item.variantId, 1, effectivePrice(item));
    removeFromWishlist(item.id);
  };

  const moveAllToCart = () => inStock.forEach(moveToCart);

  // Collective value only counts what can actually be bought.
  const originalTotal = inStock.reduce((sum, item) => sum + item.price, 0);
  const payable = inStock.reduce((sum, item) => sum + effectivePrice(item), 0);
  const totalSavings = originalTotal - payable;


  const loading = !ready || (wishlist.length > 0 && fetched === null && !error);

  return (
    <div className="space-y-6">
      {!bannerDismissed && onDiscount.length > 0 && (
        <div className="rounded-xl border border-gold/60 bg-gold-soft px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">
              <span className="font-semibold text-maroon">Wishlist perk:</span> {onDiscount.length}{' '}
              {onDiscount.length === 1 ? 'item' : 'items'} on your wishlist{' '}
              {onDiscount.length === 1 ? 'has an active discount' : 'have active discounts'}. Reserve before they sell out.
            </p>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss wishlist offer"
              className="p-1 text-muted transition-colors hover:text-maroon"
            >
              <CloseIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-maroon">My Wishlist</h2>
          <p className="mt-1 text-sm text-muted">
            {!loading && items.length > 0
              ? `${items.length} saved handcrafted ${items.length === 1 ? 'saree' : 'sarees'}.`
              : 'Pieces you have saved for later.'}
          </p>
        </div>

        {loading && (
          <p role="status" className="py-16 text-center text-muted">
            Loading your wishlist…
          </p>
        )}

        {error && (
          <div role="alert" className="rounded-xl border border-line bg-cream-card p-8 text-center">
            <p className="font-display text-xl text-maroon">We couldn&apos;t load your wishlist.</p>
            <p className="mt-1 text-sm text-muted">Your saved items are safe. Please try again.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-full bg-maroon px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-maroon-dark"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="rounded-2xl border border-line bg-cream-card px-6 py-16 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-line bg-cream text-gold">
              <HeartIcon className="h-9 w-9" />
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold text-maroon">Your wishlist is empty</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
              Tap the heart on any saree you love and it will wait for you here.
            </p>
            <Link
              href="/collections/new-arrivals"
              className="mt-6 inline-block rounded-full bg-maroon px-7 py-3 text-xs font-semibold uppercase tracking-wider text-white shadow-md transition-colors hover:bg-maroon-dark"
            >
              Explore new arrivals
            </Link>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/70 bg-cream-card p-3.5">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter wishlist">
                {(
                  [
                    ['all', `All Items (${items.length})`],
                    ['in-stock', `In Stock (${inStock.length})`],
                    ['on-discount', `On Discount (${onDiscount.length})`],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                    className={`rounded-full border px-5 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors ${
                      filter === value
                        ? 'border-maroon bg-maroon text-white shadow-sm'
                        : 'border-line bg-white hover:border-maroon hover:text-maroon'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="ml-auto flex items-center gap-2 text-xs uppercase text-muted">
                Sort by:
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as Sort)}
                  className="cursor-pointer rounded-full border border-line bg-white px-4 py-1.5 text-xs normal-case text-ink focus:outline-none"
                >
                  <option value="recent">Recently Added</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="savings">Highest Savings</option>
                </select>
              </label>
            </div>

            {visible.length === 0 ? (
              <p className="py-12 text-center text-muted">No items match this filter.</p>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {visible.map((item) => (
                  <WishlistCard key={item.id} item={item} onMove={() => moveToCart(item)} onRemove={() => removeFromWishlist(item.id)} />
                ))}
              </div>
            )}

            {inStock.length > 0 && (
              <section className="rounded-xl border border-line bg-cream-card p-6 shadow-sm lg:p-8" aria-labelledby="wishlist-value">
                <div className="grid grid-cols-1 items-center gap-6 xl:grid-cols-12">
                  <div className="space-y-3 xl:col-span-7">
                    <div className="flex items-center gap-2">
                      <h2 id="wishlist-value" className="font-display text-xl font-bold text-maroon sm:text-2xl">
                        Wishlist Collective Value
                      </h2>
                      <span className="rounded-full border border-gold/40 bg-gold-soft px-2.5 py-0.5 text-xs font-bold text-maroon">
                        {inStock.length} {inStock.length === 1 ? 'Item' : 'Items'}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-muted">
                      Totals cover the in-stock pieces on your wishlist. Sold-out pieces are kept here and excluded.
                    </p>
                    <p className="flex items-center gap-1.5 pt-1 text-xs font-medium text-maroon">
                      <TruckIcon className="h-[15px] w-[15px] text-gold" />
                      Free shipping anywhere in India
                    </p>
                  </div>

                  <div className="space-y-4 rounded-xl border border-line bg-white p-5 shadow-sm xl:col-span-5">
                    <div className="space-y-1.5 border-b border-line pb-3">
                      {totalSavings > 0 && (
                        <>
                          <div className="flex items-center justify-between text-sm text-muted">
                            <span>Original Total</span>
                            <span className="line-through">{formatPrice(originalTotal)}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm text-berry">
                            <span>Collective Savings</span>
                            <span className="font-semibold">-{formatPrice(totalSavings)}</span>
                          </div>
                        </>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        <span className="font-display text-lg font-bold text-maroon">Total Payable</span>
                        <span className="text-2xl font-bold text-maroon">{formatPrice(payable)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2.5 sm:flex-row">
                      <button
                        type="button"
                        onClick={moveAllToCart}
                        className="flex flex-1 items-center justify-center gap-2 rounded-full bg-maroon py-3 text-xs font-semibold uppercase tracking-wider text-white shadow-md transition-colors hover:bg-maroon-dark"
                      >
                        <BagIcon className="h-[18px] w-[18px]" />
                        Move All to Bag
                      </button>
                      <Link
                        href="/cart"
                        className="flex items-center justify-center rounded-full border border-line bg-cream-card px-6 py-3 text-xs font-semibold uppercase tracking-wider transition-colors hover:bg-cream-deep"
                      >
                        View Bag
                      </Link>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-3">
          {[
            { icon: <ShieldIcon className="h-6 w-6" />, title: '100% Pure Silk Mark', text: 'Govt. certified purity hallmark on every single weave.' },
            { icon: <TruckIcon className="h-6 w-6" />, title: 'Complimentary Insured Transit', text: 'Free delivery anywhere in India.' },
            { icon: <HeartIcon className="h-6 w-6" />, title: 'Direct Artisan Lineage', text: 'Fair trade patronship honoring master weaver families.' },
          ].map((badge) => (
            <div key={badge.title} className="flex items-center gap-4 rounded-xl border border-line bg-cream-card p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-white text-gold shadow-sm">
                {badge.icon}
              </div>
              <div>
                <h3 className="text-sm font-bold text-maroon">{badge.title}</h3>
                <p className="mt-0.5 text-xs text-muted">{badge.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WishlistCard({ item, onMove, onRemove }: { item: WishlistItem; onMove: () => void; onRemove: () => void }) {
  const off = percentOff(item);
  const lowStock = item.inStock && item.stock <= LOW_STOCK_AT;

  return (
    <article className="relative flex flex-col justify-between rounded-xl border border-line bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="space-y-4">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg bg-cream-card">
          <Link href={`/product/${item.slug}`} aria-label={`View ${item.name}`}>
            <Image
              src={item.image}
              alt={item.name}
              width={360}
              height={460}
              className={`h-full w-full object-cover transition-transform duration-500 hover:scale-105 ${item.inStock ? '' : 'opacity-60 grayscale'}`}
            />
          </Link>
          <div className="absolute left-2.5 top-2.5 flex flex-col gap-1">
            {off > 0 && <span className="rounded-full bg-berry px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm">{off}% off</span>}
            {item.badge && <span className="rounded-full bg-gold px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm">{item.badge}</span>}
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${item.name} from wishlist`}
            className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-berry shadow-sm backdrop-blur-sm transition-all hover:bg-white"
          >
            <HeartIcon filled className="h-5 w-5" />
          </button>
          <span
            className={`absolute bottom-2.5 left-2.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm ${
              !item.inStock ? 'bg-ink/80' : lowStock ? 'bg-maroon/90' : 'bg-gold/90'
            }`}
          >
            {!item.inStock ? 'Sold out' : lowStock ? `Only ${item.stock} left` : 'In stock · ready to ship'}
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted">
            <span className="tracking-wider">{item.sku}</span>
            <span className="font-medium text-gold">{item.fabric}</span>
          </div>
          <h3 className="font-display text-xl font-semibold leading-snug text-maroon">
            <Link href={`/product/${item.slug}`}>{item.name}</Link>
          </h3>
        </div>

        {off > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold-soft px-3 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-maroon">You saved</span>
            <span className="text-[11px] font-bold text-berry">{formatPrice(savings(item))}</span>
          </div>
        )}

        <div className="flex items-baseline justify-between rounded-lg border border-line/70 bg-cream-card p-2.5">
          <div className="flex items-baseline gap-2">
            {item.discountPrice && <span className="text-xs text-muted line-through">{formatPrice(item.price)}</span>}
            <span className="text-xl font-bold text-maroon">{formatPrice(effectivePrice(item))}</span>
          </div>
          {off > 0 ? (
            <span className="text-xs font-semibold text-berry">Save {formatPrice(savings(item))}</span>
          ) : (
            <span className="text-xs italic text-muted">Taxes included</span>
          )}
        </div>
      </div>

      <div className="space-y-2 pt-4">
        <button
          type="button"
          onClick={onMove}
          disabled={!item.inStock}
          aria-label={item.inStock ? `Move ${item.name} to cart` : `${item.name} is sold out`}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-maroon py-3 text-xs font-semibold uppercase tracking-wider text-white shadow-md transition-colors hover:bg-maroon-dark disabled:cursor-not-allowed disabled:bg-muted/40 disabled:shadow-none"
        >
          <BagIcon className="h-[18px] w-[18px]" />
          {item.inStock ? 'Move to Cart' : 'Sold Out'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.name} from wishlist`}
          className="flex w-full items-center justify-center gap-1.5 rounded-full border border-line bg-cream-card py-2 text-xs font-medium uppercase tracking-wider transition-colors hover:bg-cream-deep"
        >
          <CloseIcon className="h-4 w-4 text-gold" />
          Remove
        </button>
      </div>
    </article>
  );
}
