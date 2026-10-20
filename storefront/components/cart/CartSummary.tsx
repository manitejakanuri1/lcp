import { formatPrice } from '@/lib/format';
import type { CartTotals } from '@/lib/types';
import { TruckIcon } from '@/components/icons';

interface CartSummaryProps {
  totals: CartTotals;
  /** Totals are being re-fetched after an edit; show them dimmed rather than flashing a spinner. */
  refreshing: boolean;
  /** Open stale-item issues the shopper has not resolved yet. */
  blockingIssues: number;
}

/**
 * Subtotal / savings / shipping / total, modelled on the checkout mockup's "Your Order" footer.
 * The checkout CTA is deliberately disabled: `order-create-command` does not exist yet.
 */
export function CartSummary({ totals, refreshing, blockingIssues }: CartSummaryProps) {
  const progress = Math.min(100, Math.round((totals.subtotal / totals.freeShippingThreshold) * 100));
  const qualifies = progress >= 100;

  return (
    <section
      aria-label="Order summary"
      aria-busy={refreshing}
      className="rounded-2xl border border-gold/20 bg-white p-6 shadow-sm lg:sticky lg:top-24"
    >
      <h2 className="font-display text-xl font-bold text-maroon">Order Summary</h2>

      <dl className={`mt-4 space-y-3 text-sm transition-opacity ${refreshing ? 'opacity-50' : ''}`}>
        <div className="flex justify-between">
          <dt className="font-semibold">Subtotal</dt>
          <dd className="font-bold text-maroon">{formatPrice(totals.subtotal)}</dd>
        </div>
        {totals.discount > 0 && (
          <div className="flex justify-between text-berry">
            <dt>Coupon discount</dt>
            <dd className="font-semibold">−{formatPrice(totals.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt>Shipment</dt>
          <dd className="text-right font-medium">{totals.shipping === 0 ? 'Free shipping' : 'Calculated at checkout'}</dd>
        </div>
        {totals.savings + totals.discount > 0 && (
          <div className="flex justify-between border-t border-line/70 pt-3 text-base text-[#1e7e34]">
            <dt className="font-semibold">Your Savings</dt>
            <dd className="font-bold">{formatPrice(totals.savings + totals.discount)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between border-t border-line/70 pt-3 font-display">
          <dt className="text-xl font-bold text-maroon">Total</dt>
          <dd className="text-2xl font-bold text-berry">{formatPrice(totals.total)}</dd>
        </div>
      </dl>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-maroon">
          <span className="flex items-center gap-1.5">
            <TruckIcon className="h-4 w-4 text-gold" />
            {qualifies
              ? 'Your order qualifies for free shipping!'
              : `Add ${formatPrice(totals.freeShippingThreshold - totals.subtotal)} more for free shipping`}
          </span>
          <span className="font-bold text-gold">{qualifies ? '100% REACHED' : `${progress}%`}</span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label="Progress to free shipping"
          className="h-3 w-full overflow-hidden rounded-full border border-gold/30 bg-[#eadecb] p-0.5"
        >
          <div className="h-full rounded-full bg-gradient-to-r from-gold via-gold-soft to-gold transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <p className="mt-4 rounded-xl border border-[#f5e2c5] bg-[#fff8ee] p-3 text-xs">
        Your order is expected to leave our warehouse within <strong>1–7 days</strong>.
      </p>

      <button
        type="button"
        disabled
        aria-describedby="checkout-note"
        className="mt-5 w-full rounded-full bg-muted/40 py-3.5 font-display text-sm font-bold uppercase tracking-wide text-white"
      >
        Proceed to checkout
      </button>
      <p id="checkout-note" className="mt-2 text-center text-xs text-muted">
        {blockingIssues > 0
          ? `Resolve ${blockingIssues} ${blockingIssues === 1 ? 'item' : 'items'} in your bag above. Checkout is coming soon.`
          : 'Checkout is coming soon — your bag is saved on this device.'}
      </p>
    </section>
  );
}
