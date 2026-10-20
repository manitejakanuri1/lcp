import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AccountShell } from '@/components/account/AccountShell';

// The page itself is a client component (per-user data), so metadata lives here. Not indexable.
export const metadata: Metadata = {
  title: 'My Wishlist',
  robots: { index: false, follow: false },
};

export default function WishlistLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
