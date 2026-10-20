'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getCart, removeCartItem, updateCartItem, validateCart } from '@/lib/cloud-functions/cart';
import type { CartIssue, CartItem, CartView } from '@/lib/types';
import { useCartWishlist, type CartLine } from '@/components/shared/CartWishlistProvider';
import { CartLineItem } from '@/components/cart/CartLineItem';
import { CartSummary } from '@/components/cart/CartSummary';
import { CouponForm } from '@/components/cart/CouponForm';
import { BagIcon, CloseIcon } from '@/components/icons';

/** Store lines may omit the variant (server then picks the first), so match leniently. */
const lineFor = (cart: CartLine[], productId: string, variantId: string | undefined) =>
  cart.find((line) => line.productId === productId && (line.variantId ?? variantId) === variantId);

export default function CartPage() {
  const { ready, cart, addToCart, setCartQuantity, removeFromCart, acceptCartPrice, addToWishlist } = useCartWishlist();
  const [view, setView] = useState<CartView | null>(null);
  const [issues, setIssues] = useState<CartIssue[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null);

  // Quantity/price edits all flow through the store, so this key changes on any edit worth re-validating.
  const signature = useMemo(
    () => cart.map((line) => `${line.productId}|${line.variantId ?? ''}|${line.quantity}|${line.unitPrice ?? ''}`).join(','),
    [cart],
  );
  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);
  const latestRequest = useRef(0);
  // Latest quantity-edit sequence per line: a slow response for an older click must not undo a newer one.
  const quantitySeq = useRef(new Map<string, number>());

  const refresh = useCallback(async () => {
    const lines = cartRef.current;
    if (lines.length === 0) {
      setView(null);
      setIssues([]);
      return;
    }
    const requestId = ++latestRequest.current;
    setRefreshing(true);
    try {
      const [nextView, validation] = await Promise.all([getCart(lines, couponCode ?? undefined), validateCart(lines)]);
      if (requestId !== latestRequest.current) return; // a newer edit superseded this response
      setView(nextView);
      setIssues(validation.issues);
      setLoadFailed(false);
    } catch {
      if (requestId === latestRequest.current) setLoadFailed(true);
    } finally {
      if (requestId === latestRequest.current) setRefreshing(false);
    }
  }, [couponCode]);

  // On mount, after every edit, and when the tab regains focus (stock/price may have moved meanwhile).
  useEffect(() => {
    if (ready) void refresh();
  }, [ready, signature, refresh]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const rows = useMemo(
    () =>
      (view?.items ?? []).flatMap((item) => {
        const line = lineFor(cart, item.productId, item.variantId);
        return line ? [{ item, line }] : [];
      }),
    [view, cart],
  );

  const unavailable = (view?.unavailable ?? []).filter((entry) => cart.some((line) => line.productId === entry.productId && line.variantId === entry.variantId));
  const issuesByLine = useMemo(() => {
    const map = new Map<string, CartIssue[]>();
    for (const issue of issues) map.set(issue.lineId, [...(map.get(issue.lineId) ?? []), issue]);
    return map;
  }, [issues]);
  const openIssues = issues.filter((issue) => issue.type !== 'unavailable').length + unavailable.length;

  function changeQuantity(item: CartItem, line: CartLine, next: number) {
    const previous = line.quantity;
    const seq = (quantitySeq.current.get(item.lineId) ?? 0) + 1;
    quantitySeq.current.set(item.lineId, seq);
    const isLatest = () => quantitySeq.current.get(item.lineId) === seq;

    setCartQuantity(line.productId, line.variantId, next); // optimistic: the store updates instantly
    updateCartItem(item.productId, item.variantId, next)
      .then(({ line: confirmed, clamped }) => {
        if (clamped && isLatest()) {
          setCartQuantity(line.productId, line.variantId, confirmed.quantity);
          setNotice({ text: `Only ${confirmed.quantity} of ${item.name} ${confirmed.quantity === 1 ? 'is' : 'are'} available, so we set the quantity to ${confirmed.quantity}.` });
        }
      })
      .catch((error: unknown) => {
        if (!isLatest()) return; // a newer edit owns the quantity now
        setCartQuantity(line.productId, line.variantId, previous); // roll back
        setNotice({ text: error instanceof Error ? error.message : `Could not update ${item.name}.` });
        void refresh(); // surfaces the reason via the stale-item banners
      });
  }

  function remove(name: string, line: CartLine, variantId: string) {
    removeFromCart(line.productId, line.variantId);
    setNotice({
      text: `${name} removed from your bag.`,
      undo: () => {
        addToCart(line.productId, line.variantId, line.quantity, line.unitPrice);
        setNotice(null);
      },
    });
    removeCartItem(line.productId, variantId).catch(() => {
      addToCart(line.productId, line.variantId, line.quantity, line.unitPrice); // roll back
      setNotice({ text: `Could not remove ${name}. It is back in your bag.` });
    });
  }

  function moveToWishlist(item: CartItem, line: CartLine) {
    addToWishlist(item.productId);
    removeFromCart(line.productId, line.variantId);
    removeCartItem(item.productId, item.variantId).catch(() => {});
    setNotice({ text: `${item.name} moved to your wishlist.` });
  }

  const loading = !ready || (cart.length > 0 && view === null && !loadFailed);

  return (
    <div className="space-y-6">
      {notice && (
        <div role="status" aria-live="polite" className="flex items-center justify-between gap-3 rounded-xl border border-gold/60 bg-gold-soft px-4 py-2.5 text-sm">
          <p>
            {notice.text}
            {notice.undo && (
              <button type="button" onClick={notice.undo} className="ml-2 font-semibold uppercase tracking-wider text-maroon underline">
                Undo
              </button>
            )}
          </p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" className="p-1 text-muted hover:text-maroon">
            <CloseIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      )}

      {loading && (
        <p role="status" className="py-16 text-center text-muted">
          Loading your bag…
        </p>
      )}

      {ready && loadFailed && (
        <div role="alert" className="rounded-xl border border-line bg-cream-card p-8 text-center">
          <p className="font-display text-xl text-maroon">We couldn&apos;t refresh your bag.</p>
          <p className="mt-1 text-sm text-muted">Your items are saved on this device. Prices and stock couldn&apos;t be confirmed — please try again.</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-4 rounded-full bg-maroon px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-maroon-dark"
          >
            Retry
          </button>
        </div>
      )}

      {ready && cart.length === 0 && (
        <div className="rounded-2xl border border-line bg-cream-card px-6 py-16 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-line bg-cream text-gold">
            <BagIcon className="h-9 w-9" />
          </div>
          <h2 className="mt-4 font-display text-2xl font-bold text-maroon">Your bag is empty</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
            Pieces you add will wait here until you are ready to check out.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/collections/new-arrivals"
              className="rounded-full bg-maroon px-7 py-3 text-xs font-semibold uppercase tracking-wider text-white shadow-md transition-colors hover:bg-maroon-dark"
            >
              Explore new arrivals
            </Link>
            <Link
              href="/collections/best-sellers"
              className="rounded-full border border-line bg-white px-7 py-3 text-xs font-semibold uppercase tracking-wider transition-colors hover:bg-cream-deep"
            >
              Best sellers
            </Link>
          </div>
        </div>
      )}

      {ready && cart.length > 0 && view && (
        <>
          {openIssues > 0 && (
            <div role="status" aria-live="polite" className="rounded-xl border border-gold/60 bg-gold-soft px-4 py-3 text-sm">
              <span className="font-semibold text-maroon">Please review your bag:</span> {openIssues}{' '}
              {openIssues === 1 ? 'item has' : 'items have'} changed since you added {openIssues === 1 ? 'it' : 'them'}. We never change a price
              without telling you.
            </div>
          )}

          <CouponForm
            subtotal={view.totals.subtotal}
            applied={view.coupon}
            onApply={setCouponCode}
            onRemove={() => setCouponCode(null)}
          />

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <section aria-label="Items in your bag" className="rounded-2xl border border-gold/20 bg-white p-5 shadow-sm sm:p-6 lg:col-span-8">
              <div className="flex items-baseline justify-between border-b border-gray-200 pb-3 text-xs font-semibold uppercase tracking-widest text-muted">
                <span>Product ({view.totals.itemCount})</span>
                <span>Subtotal</span>
              </div>

              <ul className="divide-y divide-gray-100">
                {rows.map(({ item, line }) => (
                  <CartLineItem
                    key={item.lineId}
                    item={item}
                    quantity={line.quantity}
                    issues={issuesByLine.get(item.lineId) ?? []}
                    onQuantityChange={(next) => changeQuantity(item, line, next)}
                    onRemove={() => remove(item.name, line, item.variantId)}
                    onMoveToWishlist={() => moveToWishlist(item, line)}
                    onAcceptPrice={(price) => acceptCartPrice(line.productId, line.variantId, price)}
                  />
                ))}
                {unavailable.map((entry) => (
                  <li key={entry.lineId} className="flex items-center justify-between gap-3 py-5 text-sm">
                    <p role="status">
                      <span className="font-semibold text-maroon">This piece is no longer available.</span>{' '}
                      <span className="text-muted">It is not included in your total.</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => removeFromCart(entry.productId, entry.variantId)}
                      className="shrink-0 text-xs font-semibold uppercase tracking-wider text-maroon underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>

              <Link href="/collections/new-arrivals" className="mt-4 inline-block text-xs font-semibold uppercase tracking-wider text-maroon underline">
                ← Continue shopping
              </Link>
            </section>

            <div className="lg:col-span-4">
              <CartSummary totals={view.totals} refreshing={refreshing} blockingIssues={openIssues} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
