'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { getProductPriceStock } from '@/lib/cloud-functions/catalog';
import { addCartItem, updateCartItem } from '@/lib/cloud-functions/cart';
import { MAX_LINE_QUANTITY, useCartWishlist } from '@/components/shared/CartWishlistProvider';
import { formatPrice } from '@/lib/format';
import type { Product, ProductVariantSummary } from '@/lib/types';

export function VariantSelector({ product }: { product: Product }) {
  const [selectedVariantId, setSelectedVariantId] = useState(product.variants[0].id);
  const [quantity, setQuantity] = useState(1);
  const [live, setLive] = useState<ProductVariantSummary | null>(null);
  const [isPending, startTransition] = useTransition();
  const { setCartQuantity, addToCart, cartQuantityOf, toggleWishlist, isWishlisted } = useCartWishlist();
  const [cartMessage, setCartMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [adding, startAdding] = useTransition();

  const selectedVariant = product.variants.find((variant) => variant.id === selectedVariantId) ?? product.variants[0];
  const price = live?.price ?? selectedVariant.price;
  const discountPrice = live ? live.discountPrice : selectedVariant.discountPrice ?? null;
  const stock = live?.stock ?? selectedVariant.stock;
  const inStock = live ? live.inStock : stock > 0;

  function selectVariant(variantId: string) {
    setSelectedVariantId(variantId);
    setLive(null);
    startTransition(async () => {
      try {
        const result = await getProductPriceStock(product.slug, variantId);
        setLive(result.variants[0] ?? null);
      } catch {
        // Live re-check failed — fall back to the statically-cached price/stock already shown.
      }
    });
  }

  // The server re-prices and stock-caps the add; the stored line uses ITS price, not the one on screen.
  // The check covers the line's NEW TOTAL (already in the bag + this add), so repeated adds cannot
  // slip past the stock/max-quantity cap one click at a time.
  function handleAddToCart() {
    setCartMessage(null);
    const already = cartQuantityOf(product.id, selectedVariantId);
    startAdding(async () => {
      try {
        const wanted = already + quantity;
        const { line, clamped } =
          already > 0
            ? await updateCartItem(product.id, selectedVariantId, wanted)
            : await addCartItem(product.id, selectedVariantId, quantity);
        if (already > 0) setCartQuantity(line.productId, line.variantId, line.quantity);
        else addToCart(line.productId, line.variantId, line.quantity, line.unitPrice);
        setCartMessage({
          text: clamped ? `Your bag now holds ${line.quantity} — that's the most we can offer.` : 'Added to your cart.',
          ok: true,
        });
      } catch (error) {
        setCartMessage({ text: error instanceof Error ? error.message : 'Could not add to cart.', ok: false });
      }
    });
  }

  const hasColorVariants = product.variants.some((variant) => variant.color);

  return (
    <div className="variant-selector">
      <p className="price">
        {formatPrice(discountPrice ?? price)}
        {discountPrice && <s>{formatPrice(price)}</s>}
      </p>

      <p className="stock-status">
        {!inStock ? 'Sold out' : stock <= 5 ? `Low stock — only ${stock} left` : 'In stock'}
        {isPending && ' (checking…)'}
      </p>

      {hasColorVariants && (
        <div className="option-group">
          <p className="opt-label">Colour</p>
          <div className="swatches">
            {product.variants.map((variant, index) => (
              <button
                key={variant.id}
                type="button"
                className={variant.id === selectedVariantId ? 'swatch on' : 'swatch'}
                // The shop photographs every colour but never records a hex value, so a
                // coloured dot would be white. The colour's own photograph is both available
                // and more use to a shopper: images are published one per variant, in variant
                // order, so index lines them up. A hex value, if one is ever set, still wins.
                style={
                  variant.colorHex
                    ? { backgroundColor: variant.colorHex }
                    : product.images[index]
                      ? { backgroundImage: `url(${product.images[index]})` }
                      : undefined
                }
                aria-label={variant.color}
                title={variant.color}
                onClick={() => selectVariant(variant.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="option-group">
        <p className="opt-label">Quantity</p>
        <div className="quantity-stepper">
          <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">
            −
          </button>
          <span>{quantity}</span>
          <button type="button" onClick={() => setQuantity((q) => Math.min(MAX_LINE_QUANTITY, stock, q + 1))} aria-label="Increase quantity">
            +
          </button>
        </div>
      </div>

      <div className="pdp-actions">
        <button type="button" className="btn-primary" disabled={!inStock || adding} onClick={handleAddToCart}>
          {!inStock ? 'Sold out' : adding ? 'Adding…' : 'Add to cart'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => toggleWishlist(product.id)}>
          {isWishlisted(product.id) ? 'Remove from wishlist' : 'Add to wishlist'}
        </button>
      </div>
      <p role="status" aria-live="polite" className="muted">
        {cartMessage?.text}
        {cartMessage?.ok && (
          <>
            {' '}
            <Link href="/cart" className="underline">
              View cart
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
