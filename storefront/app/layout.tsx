import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Playfair_Display, DM_Sans } from 'next/font/google';
import { getNav } from '@/lib/cloud-functions/nav';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { CartWishlistProvider } from '@/components/shared/CartWishlistProvider';
import './globals.css';

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Lakshmi Sarees — Handwoven silks for every celebration',
    template: '%s — Lakshmi Sarees',
  },
  description: 'Handwoven silk sarees — bridal, Kanjivaram, Banarasi, and festive collections.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nav = await getNav();

  return (
    <html lang="en" className={`${playfairDisplay.variable} ${dmSans.variable}`}>
      <body className="font-body antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Lakshmi Sarees',
              url: 'https://www.lakshmisarees.example',
            }),
          }}
        />
        <CartWishlistProvider>
          <Header nav={nav} />
          <main>{children}</main>
          <Footer nav={nav} />
        </CartWishlistProvider>
      </body>
    </html>
  );
}
