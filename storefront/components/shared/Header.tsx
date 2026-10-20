import Link from 'next/link';
import type { NavPayload } from '@/lib/types';
import { SearchBox } from './SearchBox';
import { CartWishlistBadges } from './CartWishlistBadges';

export function Header({ nav }: { nav: NavPayload }) {
  return (
    <header className="sticky top-0 z-50 w-full bg-warm-ivory/95 shadow-[0_4px_24px_rgba(107,29,47,0.05)] backdrop-blur-xl">
      {/* Utility bar */}
      <div className="flex h-10 items-center justify-between bg-primary-container px-4 font-body text-[11px] uppercase tracking-[0.18em] text-warm-ivory md:px-8">
        <div className="hidden items-center gap-4 sm:flex">
          {nav.utilityLinks.map((link, i) => (
            <span key={link.href} className="flex items-center gap-4">
              {i > 0 && <span className="text-antique-gold/40">•</span>}
              <Link href={link.href} className="text-warm-ivory/80 transition-colors hover:text-antique-gold">
                {link.label}
              </Link>
            </span>
          ))}
        </div>
        <CartWishlistBadges />
      </div>

      {/* Logo / trust badge / search */}
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 md:px-8">
        <div className="hidden w-1/4 items-center gap-2 lg:flex">
          <span className="text-antique-gold" aria-hidden>
            ✓
          </span>
          <div className="flex flex-col">
            <span className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              {nav.trustBadge.title}
            </span>
            <span className="font-body text-xs text-on-surface-variant">{nav.trustBadge.subtitle}</span>
          </div>
        </div>

        <Link href="/" className="flex w-full flex-col items-center lg:w-1/2">
          <span className="font-display text-2xl font-bold uppercase tracking-tight text-primary lg:text-3xl">
            Lakshmi Sarees
          </span>
          <span className="mt-1 font-body text-[10px] font-semibold uppercase tracking-[0.25em] text-secondary">
            {nav.tagline}
          </span>
        </Link>

        <div className="hidden w-1/4 justify-end lg:flex">
          <SearchBox />
        </div>
      </div>

      {/* Category nav */}
      <div className="border-t border-antique-gold/20 bg-warm-ivory">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-7xl items-center gap-6 overflow-x-auto px-4 py-2 md:px-8"
        >
          {nav.categories.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap font-body text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant transition-colors hover:text-primary"
            >
              {link.label}
              {link.badge && (
                <span className="rounded-full bg-royal-emerald px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-normal text-white">
                  {link.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
