'use client';

import { useCartWishlist } from '@/components/shared/CartWishlistProvider';

/** Heart toggle backed by the shared wishlist store, so "saved" reads the same on every page. */
export function WishlistToggle({ productId, productName }: { productId: string; productName: string }) {
  const { isWishlisted, toggleWishlist } = useCartWishlist();
  const saved = isWishlisted(productId);

  return (
    <button
      type="button"
      className="wishlist-toggle"
      style={{ opacity: 1, fontSize: 20, lineHeight: 1, color: saved ? '#8a1642' : '#46081f' }}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${productName} from wishlist` : `Add ${productName} to wishlist`}
      onClick={() => toggleWishlist(productId)}
    >
      {saved ? '♥' : '♡'}
    </button>
  );
}
