'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccount, getAddresses } from '@/lib/cloud-functions/account';
import { getOrders } from '@/lib/cloud-functions/orders';
import { formatDate, formatPrice } from '@/lib/format';
import type { AccountProfile, Address, OrderSummary } from '@/lib/types';
import { OrderStatusBadge } from '@/components/account/OrderStatusBadge';
import { useCartWishlist } from '@/components/shared/CartWishlistProvider';

interface DashboardData {
  profile: AccountProfile;
  defaultAddress: Address | null;
  latestOrder: OrderSummary | null;
  orderCount: number;
}

export default function AccountDashboardPage() {
  const { wishlistCount } = useCartWishlist();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAccount(), getAddresses(), getOrders(1, 1)])
      .then(([profile, addresses, orders]) => {
        if (cancelled) return;
        setData({
          profile,
          defaultAddress: addresses.find((a) => a.isDefault) ?? addresses[0] ?? null,
          latestOrder: orders.items[0] ?? null,
          orderCount: orders.total,
        });
        setError(false);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-gold/60 bg-gold-soft px-5 py-4 text-sm">
        We couldn&apos;t load your account.{' '}
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-semibold underline">
          Try again
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <p role="status" className="py-12 text-center text-muted">
        Loading your account…
      </p>
    );
  }

  const { profile, defaultAddress, latestOrder, orderCount } = data;
  const stats = [
    { label: 'Orders', value: orderCount, href: '/account/orders' },
    { label: 'Wishlist', value: wishlistCount, href: '/wishlist' },
    { label: 'Member since', value: formatDate(profile.memberSince), href: '/account/details' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-maroon">Welcome back, {profile.firstName}</h2>
        <p className="mt-1 text-sm text-muted">
          From here you can review recent orders, manage delivery addresses and edit your account details.
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <li key={stat.label}>
            <Link href={stat.href} className="block rounded-2xl border border-line bg-cream-card p-5 shadow-sm transition-colors hover:border-gold">
              <p className="text-xs font-bold uppercase tracking-wider text-gold">{stat.label}</p>
              <p className="mt-1 font-display text-2xl font-bold text-maroon">{stat.value}</p>
            </Link>
          </li>
        ))}
      </ul>

      <section className="rounded-2xl border border-line bg-cream-card p-6 shadow-sm" aria-labelledby="latest-order">
        <div className="mb-4 flex items-center justify-between">
          <h3 id="latest-order" className="text-xs font-bold uppercase tracking-wider text-gold">
            Latest order
          </h3>
          <Link href="/account/orders" className="text-xs font-semibold text-maroon underline">
            View all
          </Link>
        </div>
        {latestOrder ? (
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2.5">
                <p className="font-display text-lg font-bold">Order #{latestOrder.orderNumber}</p>
                <OrderStatusBadge status={latestOrder.status} />
              </div>
              <p className="text-xs text-muted">
                Placed on {formatDate(latestOrder.placedAt)} • {formatPrice(latestOrder.total)}
              </p>
            </div>
            <Link
              href={`/account/orders/${latestOrder.id}`}
              className="self-start rounded-lg border border-gold/30 bg-maroon px-4 py-2 text-xs font-bold text-gold-soft transition-colors hover:bg-maroon-dark sm:self-auto"
            >
              View details
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted">
            You haven&apos;t placed any orders yet.{' '}
            <Link href="/collections/new-arrivals" className="font-semibold text-maroon underline">
              Explore new arrivals
            </Link>
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-cream-card p-6 shadow-sm" aria-labelledby="default-address">
        <div className="mb-3 flex items-center justify-between">
          <h3 id="default-address" className="text-xs font-bold uppercase tracking-wider text-gold">
            Default address
          </h3>
          <Link href="/account/addresses" className="text-xs font-semibold text-maroon underline">
            Manage
          </Link>
        </div>
        {defaultAddress ? (
          <address className="space-y-0.5 text-sm not-italic">
            <p className="font-semibold">{defaultAddress.name}</p>
            <p>
              {defaultAddress.line1}
              {defaultAddress.line2 ? `, ${defaultAddress.line2}` : ''}
            </p>
            <p>
              {defaultAddress.city}, {defaultAddress.state} {defaultAddress.pincode}
            </p>
          </address>
        ) : (
          <p className="text-sm text-muted">No saved address yet.</p>
        )}
      </section>
    </div>
  );
}
