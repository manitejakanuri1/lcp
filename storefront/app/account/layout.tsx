import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AccountShell } from '@/components/account/AccountShell';

// Per-user pages: never indexed (05-orders-page.md).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Shell for /account/**. The real auth gate (auth-session-verify in middleware, redirect to
 * login with a return-to) is blocked on the login/registration flow, which has no
 * requirements doc yet; until then these pages render against mock data.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
