'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getOrders } from '@/lib/cloud-functions/orders';
import { formatDate, formatPrice } from '@/lib/format';
import type { OrderSummary } from '@/lib/types';
import { OrderStatusBadge } from '@/components/account/OrderStatusBadge';
import { useCartWishlist } from '@/components/shared/CartWishlistProvider';
import { BagIcon } from '@/components/icons';

const PAGE_SIZE = 5;

export default function OrdersPage() {
  const { wishlistCount } = useCartWishlist();
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getOrders(page, PAGE_SIZE)
      .then((result) => {
        if (cancelled) return;
        setOrders(result.items);
        setTotal(result.total);
        setError(false);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [page, attempt]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-maroon">Order history</h2>
        <p className="mt-1 text-sm text-muted">Track current orders and revisit past purchases.</p>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-gold/60 bg-gold-soft px-5 py-4 text-sm">
          We couldn&apos;t load your orders right now.{' '}
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-semibold underline">
            Try again
          </button>
        </div>
      )}

      {!error && orders === null && (
        <p role="status" className="py-12 text-center text-muted">
          Loading your orders…
        </p>
      )}

      {!error && orders?.length === 0 && (
        <div className="rounded-2xl border border-line bg-cream-card p-8 text-center shadow-sm sm:p-10">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-line bg-cream text-gold">
            <BagIcon className="h-10 w-10" />
          </div>
          <h3 className="font-display text-2xl font-bold text-maroon">You have not placed any orders yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
            When you purchase your handcrafted sarees and heritage silks, your tracking, invoice copies and delivery timelines will be shown here.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/collections/new-arrivals"
              className="rounded-xl border border-gold/40 bg-maroon px-7 py-3 text-xs font-bold uppercase tracking-wider text-gold-soft shadow-md transition-colors hover:bg-maroon-dark"
            >
              Explore handloom collection
            </Link>
            <Link href="/wishlist" className="rounded-xl border border-line bg-cream px-6 py-3 text-xs font-semibold text-maroon transition-colors hover:bg-gold/20">
              View saved wishlist ({wishlistCount})
            </Link>
          </div>
        </div>
      )}

      {!error && orders && orders.length > 0 && (
        <>
          <ul className="space-y-4">
            {orders.map((order) => (
              <li key={order.id} className="rounded-2xl border border-line bg-cream-card p-6 shadow-sm">
                <div className="flex flex-col justify-between gap-3 border-b border-line/70 pb-4 sm:flex-row sm:items-center">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="font-display text-lg font-bold">Order #{order.orderNumber}</h3>
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <p className="text-xs text-muted">
                      Placed on {formatDate(order.placedAt)} • {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
                    </p>
                  </div>
                  <Link
                    href={`/account/orders/${order.id}`}
                    className="self-start rounded-lg border border-gold/30 bg-maroon px-4 py-2 text-xs font-bold text-gold-soft transition-colors hover:bg-maroon-dark sm:self-auto"
                  >
                    View details
                  </Link>
                </div>
                <div className="flex items-center justify-between gap-4 pt-4">
                  <ul className="flex items-center gap-3">
                    {order.thumbnails.slice(0, 4).map((thumb) => (
                      <li key={thumb.name}>
                        <Image src={thumb.image} alt={thumb.name} title={thumb.name} width={64} height={80} className="h-20 w-16 rounded-lg border border-line object-cover" />
                      </li>
                    ))}
                    {order.thumbnails.length > 4 && <li className="text-xs text-muted">+{order.thumbnails.length - 4} more</li>}
                  </ul>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wider text-muted">Total</p>
                    <p className="font-display text-xl font-bold text-maroon">{formatPrice(order.total)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <nav aria-label="Order pages" className="flex items-center justify-center gap-6 pt-2 text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="rounded-full border border-line bg-white px-5 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-muted">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="rounded-full border border-line bg-white px-5 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
