'use client';

import { useRouter } from 'next/navigation';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { getProductPriceStock } from '@/lib/cloud-functions/catalog';
import { addCartItem, updateCartItem } from '@/lib/cloud-functions/cart';
import { MAX_LINE_QUANTITY, useCartWishlist } from '@/components/shared/CartWishlistProvider';
import { discountPercent, formatPrice } from '@/lib/format';
import { useShownPhoto } from '@/components/ProductGallery';
import type { Product, ProductVariantSummary } from '@/lib/types';

export function VariantSelector({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState(1);
  const [live, setLive] = useState<ProductVariantSummary | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { setCartQuantity, addToCart, cartQuantityOf, toggleWishlist, isWishlisted } = useCartWishlist();
  const [cartMessage, setCartMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const { index: shownPhoto, show: showPhoto } = useShownPhoto();
  const [adding, startAdding] = useTransition();

  // The chosen colour IS the photograph on show. Photographs are published one per colour and
  // in colour order, so one number says both which colour is being bought and which picture
  // is large - and a thumbnail cannot then highlight a colour the bag would not receive.
  const chosen = Math.min(shownPhoto, product.variants.length - 1);
  const selectedVariant = product.variants[chosen];
  const selectedVariantId = selectedVariant.id;
  const price = live?.price ?? selectedVariant.price;
  const discountPrice = live ? live.discountPrice : selectedVariant.discountPrice ?? null;
  const stock = live?.stock ?? selectedVariant.stock;
  const inStock = live ? live.inStock : stock > 0;
  const off = discountPercent(price, discountPrice);

  // Whatever moved the selection - a colour button or a thumbnail - the price and stock on
  // screen are re-checked against the shop for the colour now chosen.
  useEffect(() => {
    let current = true;
    startTransition(async () => {
      // Cleared inside the transition rather than straight away: React objects to a state
      // change made in the body of an effect, and the old figure is right until the new one
      // lands anyway.
      setLive(null);
      try {
        const result = await getProductPriceStock(product.slug, selectedVariantId);
        if (current) setLive(result.variants[0] ?? null);
      } catch {
        // Live re-check failed - fall back to the statically-cached price and stock.
      }
    });
    return () => { current = false; };
  }, [product.slug, selectedVariantId]);

  // The server re-prices and stock-caps the add; the stored line uses ITS price, not the one on screen.
  // The check covers the line's NEW TOTAL (already in the bag + this add), so repeated adds cannot
  // slip past the stock/max-quantity cap one click at a time.
  function handleAddToCart(thenCheckout = false) {
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
        // Buy now is the same add, followed by the checkout: the bag is still the record of
        // what is being bought, so anything already in it comes along.
        if (thenCheckout) router.push('/checkout');
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
        {off && <span className="off">{off}% OFF</span>}
      </p>
      {off && <p className="saving">You save {formatPrice(price - (discountPrice ?? price))}</p>}

      <p className="stock-status">
        {!inStock ? 'Sold out' : stock <= 5 ? `Low stock — only ${stock} left` : 'In stock'}
        {isPending && ' (checking…)'}
      </p>

      {hasColorVariants && (
        <div className="option-group">
          <p className="opt-label">Colour</p>
          <div className="swatches">
            {product.variants.map((variant, i) => (
              <button
                key={variant.id}
                type="button"
                className={i === shownPhoto ? 'swatch on' : 'swatch'}
                // The shop photographs every colour but never records a hex value, so a
                // coloured dot would be white. The colour's own photograph is both available
                // and more use to a shopper: images are published one per variant, in variant
                // order, so index lines them up. A hex value, if one is ever set, still wins.
                style={
                  variant.colorHex
                    ? { backgroundColor: variant.colorHex }
                    : product.images[i]
                      ? { backgroundImage: `url(${product.images[i]})` }
                      : undefined
                }
                aria-label={variant.color}
                title={variant.color}
                onClick={() => showPhoto(i)}
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
        <button type="button" className="btn-buy" disabled={!inStock || adding} onClick={() => handleAddToCart(true)}>
          {!inStock ? 'Sold out' : adding ? 'Opening…' : 'Buy now'}
        </button>
        <button type="button" className="btn-primary" disabled={!inStock || adding} onClick={() => handleAddToCart()}>
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
