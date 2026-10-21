'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCartWishlist } from './CartWishlistProvider';
import { getAccessToken } from '@/lib/cloud-functions/session';
import { getAccount } from '@/lib/cloud-functions/account';
import { logout } from '@/lib/cloud-functions/auth';

/**
 * The controls at the top right: account, search, wishlist and bag with its running total,
 * drawn as outlines in ink rather than in the shop's maroon, which is what the owner asked
 * for (01-landing-page.md).
 *
 * The bag always carries its count, zero included, because a shopper reads the absence of a
 * number as the page not having loaded.
 */

const INK = 'text-[#2b2b2b] transition-colors hover:text-antique-gold';

function Magnifier() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" strokeLinecap="round" />
    </svg>
  );
}

function Heart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path
        d="M12 20.5s-7.5-4.6-7.5-9.6a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 5-7.5 9.6-7.5 9.6Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Bag() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M5 8h14l-1 12H6L5 8Z" strokeLinejoin="round" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" strokeLinecap="round" />
    </svg>
  );
}

export function CartWishlistBadges() {
  const { wishlistCount, cartCount, cart } = useCartWishlist();
  const router = useRouter();
  // The token lives in the browser, so who is signed in can only be known after the page
  // has loaded; until then the header shows the signed-out state rather than guessing.
  const [firstName, setFirstName] = useState('');

  useEffect(() => {
    if (!getAccessToken()) return;
    let cancelled = false;
    getAccount()
      .then((profile) => {
        if (!cancelled) setFirstName(profile.firstName || profile.displayName || 'My account');
      })
      .catch(() => { /* an expired session simply shows Login again */ });
    return () => { cancelled = true; };
  }, []);

  const signOut = () => {
    logout();
    setFirstName('');
    router.push('/');
  };
  const total = cart.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.quantity, 0);

  // The search box sits on the other side of the logo, so the magnifier takes the shopper to
  // it rather than opening a second one.
  const focusSearch = () => document.getElementById('site-search')?.focus();

  return (
    <div className="flex items-center gap-4 sm:gap-5">
      {firstName ? (
        <span className="hidden items-center gap-3 font-body text-sm sm:flex">
          <Link href="/account" className={INK}>{firstName}</Link>
          <button type="button" onClick={signOut} className={`${INK} underline-offset-2 hover:underline`}>
            Sign out
          </button>
        </span>
      ) : (
        <Link href="/login" className={`hidden font-body text-sm sm:block ${INK}`}>
          Login / Register
        </Link>
      )}

      <button type="button" onClick={focusSearch} aria-label="Search" className={INK}>
        <Magnifier />
      </button>

      <Link href="/wishlist" aria-label={`Wishlist, ${wishlistCount} items`} className={`relative ${INK}`}>
        <Heart />
        {wishlistCount > 0 && (
          <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e8164b] px-1 text-[10px] font-bold text-white">
            {wishlistCount}
          </span>
        )}
      </Link>

      <Link href="/cart" aria-label={`Bag, ${cartCount} items`} className={`flex items-center gap-2 ${INK}`}>
        <span className="relative">
          <Bag />
          <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e8164b] px-1 text-[10px] font-bold text-white">
            {cartCount}
          </span>
        </span>
        {/* Two decimals here, unlike the price on a saree: a bag total that jumps between
            "₹0" and "₹1,550" reads as a glitch, and every other shop shows the paise. */}
        <span className="font-body text-sm tabular-nums">
          ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </Link>
    </div>
  );
}
