'use client';

import { use, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CloudFunctionError } from '@/lib/cloud-functions/client';
import { getOrder } from '@/lib/cloud-functions/orders';
import { formatDate, formatPrice } from '@/lib/format';
import type { Order } from '@/lib/types';
import { OrderStatusBadge } from '@/components/account/OrderStatusBadge';
import { useCartWishlist } from '@/components/shared/CartWishlistProvider';

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { addToCart } = useCartWishlist();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<'not-found' | 'failed' | null>(null);
  const [reordered, setReordered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOrder(id)
      .then((result) => !cancelled && setOrder(result))
      .catch((err) => !cancelled && setError(err instanceof CloudFunctionError && err.status === 404 ? 'not-found' : 'failed'));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const reorder = () => {
    if (!order) return;
    order.items.forEach((item) => addToCart(item.productId, undefined, item.quantity));
    setReordered(true);
  };

  const back = (
    <Link href="/account/orders" className="text-sm font-medium text-maroon underline">
      ← Back to orders
    </Link>
  );

  if (error) {
    return (
      <div className="space-y-4 rounded-xl border border-line bg-cream-card p-8 text-center" role="alert">
        <p className="font-display text-xl text-maroon">{error === 'not-found' ? 'We could not find that order.' : 'We couldn’t load this order.'}</p>
        {back}
      </div>
    );
  }

  if (!order) {
    return (
      <p role="status" className="py-12 text-center text-muted">
        Loading order…
      </p>
    );
  }

  const { payment } = order;

  return (
    <div className="space-y-6">
      {back}

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="font-display text-2xl font-bold text-maroon">Order #{order.orderNumber}</h2>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-sm text-muted">Placed on {formatDate(order.placedAt)}</p>
        </div>
        <button
          type="button"
          onClick={reorder}
          className="self-start rounded-full bg-maroon px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-white shadow-md transition-colors hover:bg-maroon-dark sm:self-auto"
        >
          Reorder
        </button>
      </div>

      {reordered && (
        <p role="status" className="rounded-xl border border-gold/60 bg-gold-soft px-5 py-3 text-sm">
          Items added to your bag.{' '}
          <Link href="/cart" className="font-semibold underline">
            View bag
          </Link>
        </p>
      )}

      <section className="rounded-2xl border border-line bg-cream-card p-6 shadow-sm" aria-labelledby="order-items">
        <h3 id="order-items" className="mb-4 text-xs font-bold uppercase tracking-wider text-gold">
          Items
        </h3>
        <ul className="divide-y divide-line/70">
          {order.items.map((item) => (
            <li key={item.productId} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
              <Image src={item.image} alt={item.name} width={64} height={80} className="h-20 w-16 rounded-lg border border-line object-cover" />
              <div className="min-w-0 flex-1">
                <Link href={`/product/${item.slug}`} className="font-display text-base font-bold hover:text-maroon">
                  {item.name}
                </Link>
                <p className="text-xs text-muted">
                  {item.variant ? `${item.variant} · ` : ''}Qty {item.quantity}
                </p>
              </div>
              <p className="font-semibold text-maroon">{formatPrice(item.unitPrice * item.quantity)}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-cream-card p-6 shadow-sm">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gold">Shipping address</h3>
          <address className="space-y-0.5 text-sm not-italic">
            <p className="font-semibold">{order.shippingAddress.name}</p>
            {order.shippingAddress.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p className="text-muted">{order.shippingAddress.phone}</p>
          </address>
          <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-gold">Tracking</h3>
          {order.tracking ? (
            <p className="text-sm">
              {order.tracking.carrier} · <span className="font-mono">{order.tracking.trackingNumber}</span>
            </p>
          ) : (
            <p className="text-sm text-muted">Tracking details will appear once your order ships.</p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-cream-card p-6 shadow-sm">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gold">Payment summary</h3>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd>{formatPrice(payment.subtotal)}</dd>
            </div>
            {payment.discount > 0 && (
              <div className="flex justify-between text-berry">
                <dt>Discount</dt>
                <dd>-{formatPrice(payment.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted">Shipping</dt>
              <dd>{payment.shipping === 0 ? 'Free' : formatPrice(payment.shipping)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 font-display text-lg font-bold text-maroon">
              <dt>Total</dt>
              <dd>{formatPrice(payment.total)}</dd>
            </div>
            <div className="flex justify-between pt-1 text-xs text-muted">
              <dt>Paid via</dt>
              <dd>{payment.method}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
