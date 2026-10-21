import Link from 'next/link';
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
          <dd className="text-right font-medium">Free</dd>
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

      {/* The shop ships free everywhere, so there is no amount to climb towards. */}
      <p className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-maroon">
        <TruckIcon className="h-4 w-4 text-gold" />
        Free shipping anywhere in India
      </p>



      {blockingIssues > 0 ? (
        <button
          type="button"
          disabled
          aria-describedby="checkout-note"
          className="mt-5 w-full rounded-full bg-muted/40 py-3.5 font-display text-sm font-bold uppercase tracking-wide text-white"
        >
          Proceed to checkout
        </button>
      ) : (
        <Link
          href="/checkout"
          className="mt-5 block w-full rounded-full bg-maroon py-3.5 text-center font-display text-sm font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90"
        >
          Proceed to checkout
        </Link>
      )}
      <p id="checkout-note" className="mt-2 text-center text-xs text-muted">
        {blockingIssues > 0
          ? `Resolve ${blockingIssues} ${blockingIssues === 1 ? 'item' : 'items'} in your bag above.`
          : 'Your bag is saved on this device.'}
      </p>
    </section>
  );
}
