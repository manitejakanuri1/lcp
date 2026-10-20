import type { ReactNode } from 'react';
import { AccountNav } from '@/components/account/AccountNav';

/** Maroon hero + left navigation + content column, shared by /account/** and /wishlist. */
export function AccountShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-cream text-ink">
      <section className="border-b border-gold/40 bg-gradient-to-r from-[#280411] via-maroon to-maroon-dark py-10 text-white sm:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h1 className="font-display text-4xl tracking-tight text-cream sm:text-5xl">My Account</h1>
        </div>
      </section>
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-10 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:px-8">
        <AccountNav />
        <section className="min-w-0 lg:col-span-9">{children}</section>
      </div>
    </div>
  );
}
