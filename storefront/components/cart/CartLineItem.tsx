'use client';

import Image from 'next/image';
import Link from 'next/link';
import { formatPrice } from '@/lib/format';
import type { CartIssue, CartItem } from '@/lib/types';
import { CloseIcon, HeartIcon } from '@/components/icons';
import { MAX_LINE_QUANTITY } from '@/components/shared/CartWishlistProvider';
import { QuantityStepper } from './QuantityStepper';

interface CartLineItemProps {
  item: CartItem;
  /** Quantity from the local store — updates instantly, ahead of the server round-trip. */
  quantity: number;
  issues: CartIssue[];
  onQuantityChange: (next: number) => void;
  onRemove: () => void;
  onMoveToWishlist: () => void;
  onAcceptPrice: (price: number) => void;
}

export function CartLineItem({ item, quantity, issues, onQuantityChange, onRemove, onMoveToWishlist, onAcceptPrice }: CartLineItemProps) {
  const soldOut = !item.inStock;
  const percentOff = item.listPrice > item.unitPrice ? Math.round(((item.listPrice - item.unitPrice) / item.listPrice) * 100) : 0;
  const saved = (item.listPrice - item.unitPrice) * quantity;
  const stockIssue = issues.find((issue) => issue.type === 'insufficient-stock');
  const priceIssue = issues.find((issue) => issue.type === 'price-changed');

  return (
    <li className="py-5">
      <div className="flex items-start gap-3 sm:gap-4">
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.name} from cart`}
          title="Remove"
          className="mt-1 p-1 text-muted/70 transition-colors hover:text-berry"
        >
          <CloseIcon className="h-4 w-4" />
        </button>

        <Link href={`/product/${item.slug}`} className="relative h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-lg border border-gold/30 bg-cream-card shadow-sm sm:h-28 sm:w-20">
          <Image
            src={item.image}
            alt={item.name}
            width={160}
            height={200}
            className={`h-full w-full object-cover ${soldOut ? 'opacity-60 grayscale' : ''}`}
          />
        </Link>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/product/${item.slug}`} className="font-display text-base font-bold text-maroon hover:underline sm:text-lg">
              {item.name}
            </Link>
            {percentOff > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#f5d5b7] bg-[#fdf3e9] px-2.5 py-0.5 text-[11px] font-medium text-[#b35e19]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#b35e19]" />
                {percentOff}% off
              </span>
            )}
            {saved > 0 && !soldOut && (
              <span className="rounded-full border border-[#f9cfd8] bg-[#faecec] px-2.5 py-0.5 text-[11px] font-semibold uppercase text-berry">
                You saved {formatPrice(saved)}
              </span>
            )}
          </div>

          <p className="text-xs text-muted">
            SKU: <span className="font-mono text-ink">{item.sku}</span>
            {item.variantLabel && <> · Colour: {item.variantLabel}</>} · {item.fabric}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            {soldOut ? (
              <span className="rounded-full bg-ink/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">Sold out</span>
            ) : (
              <QuantityStepper value={quantity} max={Math.min(item.stock, MAX_LINE_QUANTITY)} label={item.name} onChange={onQuantityChange} />
            )}
            <span className="text-xs text-muted">
              {formatPrice(item.unitPrice)}
              {percentOff > 0 && <s className="ml-1.5 opacity-70">{formatPrice(item.listPrice)}</s>} each
            </span>
            <button
              type="button"
              onClick={onMoveToWishlist}
              className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted transition-colors hover:text-maroon"
            >
              <HeartIcon className="h-3.5 w-3.5 text-gold" />
              Move to wishlist
            </button>
          </div>

          {(soldOut || stockIssue || priceIssue) && (
            <div role="status" aria-live="polite" className="space-y-1.5 pt-1">
              {soldOut && (
                <p className="rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink">
                  This piece sold out while it was in your bag. It is not included in your total — remove it or save it to your wishlist.
                </p>
              )}
              {stockIssue && !soldOut && (
                <p className="flex flex-wrap items-center gap-2 rounded-lg border border-gold/60 bg-gold-soft px-3 py-2 text-xs text-ink">
                  {stockIssue.message}
                  {stockIssue.maxQuantity !== undefined && (
                    <button
                      type="button"
                      onClick={() => onQuantityChange(stockIssue.maxQuantity!)}
                      className="font-semibold uppercase tracking-wider text-maroon underline"
                    >
                      Set to {stockIssue.maxQuantity}
                    </button>
                  )}
                </p>
              )}
              {priceIssue && priceIssue.currentPrice !== undefined && (
                <p className="flex flex-wrap items-center gap-2 rounded-lg border border-gold/60 bg-gold-soft px-3 py-2 text-xs text-ink">
                  Price changed from {formatPrice(priceIssue.previousPrice ?? 0)} to{' '}
                  <strong>{formatPrice(priceIssue.currentPrice)}</strong>.
                  <button
                    type="button"
                    onClick={() => onAcceptPrice(priceIssue.currentPrice!)}
                    className="font-semibold uppercase tracking-wider text-maroon underline"
                  >
                    Accept new price
                  </button>
                </p>
              )}
            </div>
          )}
        </div>

        <p className={`shrink-0 text-right text-base font-semibold ${soldOut ? 'text-muted line-through' : 'text-maroon'}`}>
          {formatPrice(item.unitPrice * quantity)}
        </p>
      </div>
    </li>
  );
}
