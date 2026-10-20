import Image from 'next/image';
import Link from 'next/link';
import type { HomepageBlock } from '@/lib/types';

export function CampaignBanner({ block }: { block: Extract<HomepageBlock, { type: 'campaign-banner' }> }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8" aria-labelledby={block.id}>
      <p className="font-body text-xs font-semibold uppercase tracking-[0.25em] text-antique-gold">{block.eyebrow}</p>
      <h2 id={block.id} className="mt-1 font-display text-3xl font-bold tracking-tight text-primary md:text-4xl">
        {block.title}
      </h2>
      <p className="mt-2 max-w-md font-body text-sm text-on-surface-variant">{block.note}</p>
      <Link
        href={block.ctaHref}
        className="mt-4 inline-block rounded-lg border border-primary px-5 py-2.5 font-body text-sm font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-pale-gold"
      >
        {block.ctaLabel}
      </Link>
      <div className="mt-6 flex gap-4 overflow-x-auto pb-2">
        {block.looks.map((look) => (
          <div key={look.label} className="w-36 shrink-0 text-center">
            <div className="overflow-hidden rounded-2xl">
              <Image
                src={look.image}
                alt={look.label}
                width={220}
                height={280}
                className="aspect-[4/5] w-full object-cover"
              />
            </div>
            <span className="mt-2 block font-body text-sm font-medium text-primary">{look.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
