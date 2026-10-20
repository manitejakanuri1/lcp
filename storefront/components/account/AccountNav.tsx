'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getAccount } from '@/lib/cloud-functions/account';
import type { AccountProfile } from '@/lib/types';
import { useCartWishlist } from '@/components/shared/CartWishlistProvider';
import { ChevronRightIcon } from '@/components/icons';

export function AccountNav() {
  const pathname = usePathname();
  const { wishlistCount } = useCartWishlist();
  const [profile, setProfile] = useState<AccountProfile | null>(null);

  // Re-read on navigation so a name/email saved on the details page shows up here.
  useEffect(() => {
    let cancelled = false;
    getAccount()
      .then((result) => !cancelled && setProfile(result))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const links = [
    { href: '/account', label: 'Dashboard', active: pathname === '/account', count: undefined },
    { href: '/account/orders', label: 'Orders', active: pathname.startsWith('/account/orders'), count: undefined },
    { href: '/account/addresses', label: 'Address book', active: pathname.startsWith('/account/addresses'), count: undefined },
    { href: '/account/details', label: 'Account details', active: pathname.startsWith('/account/details'), count: undefined },
    { href: '/wishlist', label: 'Wishlist', active: pathname.startsWith('/wishlist'), count: wishlistCount },
  ];

  const initials = profile ? `${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}`.toUpperCase() : '';

  return (
    <aside className="space-y-4 lg:col-span-3">
      <div className="rounded-xl border border-line bg-cream-card p-3 shadow-sm lg:sticky lg:top-40">
        <div className="mb-1 flex items-center justify-between border-b border-line/70 px-4 py-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gold">My Account</h2>
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
        </div>
        <nav aria-label="Account" className="space-y-1 text-sm font-medium">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={link.active ? 'page' : undefined}
              className={`flex items-center justify-between rounded-lg px-4 py-2.5 transition-all ${
                link.active ? 'bg-maroon font-semibold text-white shadow-sm' : 'text-ink/80 hover:bg-cream hover:text-maroon'
              }`}
            >
              <span>{link.label}</span>
              {link.active ? (
                <ChevronRightIcon className="h-4 w-4 text-gold-soft" />
              ) : (
                link.count !== undefined && (
                  <span className="rounded-full border border-maroon/20 bg-maroon/10 px-2 py-0.5 text-[11px] font-bold text-maroon">
                    {link.count}
                  </span>
                )
              )}
            </Link>
          ))}
        </nav>

        {profile && (
          <div className="mt-3 flex items-center gap-3 border-t border-line/70 px-3 pb-1 pt-4">
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-maroon text-sm font-bold text-gold-soft">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{profile.displayName}</p>
              <p className="truncate text-xs text-muted">{profile.email}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
