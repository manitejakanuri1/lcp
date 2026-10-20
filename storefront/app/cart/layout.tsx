import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

// The page itself is a client component (per-shopper data), so metadata lives here. Not indexable.
export const metadata: Metadata = {
  title: 'Shopping Bag',
  robots: { index: false, follow: false },
};

/** Maroon hero + breadcrumb, following the checkout mockup's banner (LakshmiSareeMandir_UIdesign/checkout). */
export default function CartLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-cream text-ink">
      <section className="relative overflow-hidden border-b border-gold/40 bg-gradient-to-r from-[#280411] via-maroon to-maroon-dark px-4 py-10 text-center text-white">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full border border-gold/15" />
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-88 w-88 rounded-full border border-gold/10" />
        <div className="relative mx-auto max-w-5xl">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.25em] text-gold-soft">Review before you pay</p>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Your Shopping Bag</h1>
          <nav aria-label="Breadcrumb" className="mt-3 flex items-center justify-center gap-2 text-xs text-gold-soft/80">
            <Link href="/" className="hover:underline">
              Home
            </Link>
            <span aria-hidden>/</span>
            <span className="font-semibold text-white" aria-current="page">
              Cart
            </span>
          </nav>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}
