export function formatPrice(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

/**
 * How much off the full price, as a whole number, or null when there is nothing off.
 *
 * Shoppers read "48% OFF" faster than two prices side by side, so the figure is worked out
 * once here rather than in each place that shows a price. Rounded, because a saree marked
 * down from 2583 to 1550 is 39.99...% and "40% OFF" is the honest reading of it.
 */
export function discountPercent(price: number, discountPrice?: number | null): number | null {
  if (!discountPrice || discountPrice >= price || price <= 0) return null;
  const off = Math.round(((price - discountPrice) / price) * 100);
  return off > 0 ? off : null;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
