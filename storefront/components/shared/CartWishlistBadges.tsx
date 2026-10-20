'use client';

import Link from 'next/link';
import { useCartWishlist } from './CartWishlistProvider';

/** Cart/wishlist icon counts, read from the shared client store (01-landing-page.md). */
export function CartWishlistBadges() {
  const { wishlistCount, cartCount } = useCartWishlist();

  return (
    <div className="flex items-center gap-space-lg">
      <Link
        href="/wishlist"
        className="flex items-center gap-1 text-warm-ivory/90 hover:text-antique-gold transition-colors"
        aria-label={`Wishlist, ${wishlistCount} items`}
      >
        <span aria-hidden>♡</span>
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-crimson-accent text-[10px] font-bold text-white">
          {wishlistCount}
        </span>
      </Link>
      <Link
        href="/cart"
        className="flex items-center gap-1 text-warm-ivory/90 hover:text-antique-gold transition-colors"
        aria-label={`Cart, ${cartCount} items`}
      >
        <span aria-hidden>🛍</span>
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-antique-gold text-[10px] font-bold text-primary">
          {cartCount}
        </span>
      </Link>
      <Link
        href="/account"
        className="hidden text-warm-ivory/80 transition-colors hover:text-antique-gold sm:block"
      >
        My Account
      </Link>
    </div>
  );
}
