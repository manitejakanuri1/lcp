import Link from 'next/link';
import type { NavPayload } from '@/lib/types';
import { NewsletterForm } from './NewsletterForm';

export function Footer({ nav }: { nav: NavPayload }) {
  return (
    <footer className="w-full bg-heritage-black pt-16 pb-8 text-warm-ivory">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="grid grid-cols-1 gap-10 pb-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-3">
            <span className="font-display text-xl font-bold uppercase tracking-wide text-antique-gold">
              Lakshmi Sarees
            </span>
            <p className="font-body text-sm text-warm-ivory/70">{nav.footer.brandBlurb}</p>
            <div className="flex items-center gap-2 pt-1 font-body text-xs font-semibold text-antique-gold">
              <span aria-hidden>✓</span>
              {nav.footer.certificationLabel}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="font-body text-sm font-semibold uppercase tracking-wider text-antique-gold">
              Fabric Curations
            </h3>
            <ul className="flex flex-col gap-2 font-body text-sm text-warm-ivory/70">
              {nav.footer.shopLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition-colors hover:text-antique-gold">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="font-body text-sm font-semibold uppercase tracking-wider text-antique-gold">
              Customer Care
            </h3>
            <ul className="flex flex-col gap-2 font-body text-sm text-warm-ivory/70">
              {nav.footer.careLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition-colors hover:text-antique-gold">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="font-body text-sm font-semibold uppercase tracking-wider text-antique-gold">
              Stay Updated
            </h3>
            <p className="font-body text-sm text-warm-ivory/70">{nav.footer.newsletterBlurb}</p>
            <NewsletterForm />
            <div className="flex items-center gap-3 pt-1">
              {nav.footer.socialLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  aria-label={link.label}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-warm-ivory/10 text-antique-gold transition-colors hover:bg-antique-gold hover:text-heritage-black"
                >
                  <span className="text-xs" aria-hidden>
                    {link.label[0]}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-warm-ivory/10 pt-6 font-body text-xs text-warm-ivory/60 md:flex-row">
          <p>{nav.footer.copyright}</p>
          <div className="flex items-center gap-4">
            {nav.footer.policyLinks.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-antique-gold">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
