import Image from 'next/image';
import Link from 'next/link';
import type { HomepageBlock } from '@/lib/types';

export function EditorialPanels({ block }: { block: Extract<HomepageBlock, { type: 'editorial-panels' }> }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8" aria-labelledby={block.id}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-body text-xs font-semibold uppercase tracking-[0.25em] text-antique-gold">{block.eyebrow}</p>
          <h2 id={block.id} className="mt-1 font-display text-3xl font-bold tracking-tight text-primary md:text-4xl">
            {block.title}
          </h2>
        </div>
        <Link href={block.ctaHref} className="shrink-0 font-body text-sm font-semibold uppercase tracking-wider text-primary hover:text-antique-gold">
          {block.ctaLabel}
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        {block.panels.map((panel) => (
          <div
            key={panel.title}
            className={`overflow-hidden rounded-2xl ${panel.highlighted ? 'ring-2 ring-antique-gold' : ''}`}
          >
            <Image
              src={panel.image}
              alt={panel.title}
              width={280}
              height={340}
              className="aspect-[4/5] w-full object-cover"
            />
            <div className="p-3">
              <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-antique-gold">
                {panel.eyebrow}
              </p>
              <h3 className="mt-1 font-display text-lg font-bold text-primary">{panel.title}</h3>
              <span className="mt-1 block font-body text-xs font-medium text-on-surface-variant">{panel.ctaLabel}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
