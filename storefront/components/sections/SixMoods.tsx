import Image from 'next/image';
import Link from 'next/link';
import type { HomepageBlock } from '@/lib/types';

export function SixMoods({ block }: { block: Extract<HomepageBlock, { type: 'six-moods' }> }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8" aria-labelledby={block.id}>
      <p className="font-body text-xs font-semibold uppercase tracking-[0.25em] text-antique-gold">{block.eyebrow}</p>
      <h2 id={block.id} className="mt-1 font-display text-3xl font-bold tracking-tight text-primary md:text-4xl">
        {block.title}
      </h2>
      <p className="mt-2 max-w-sm font-body text-sm text-on-surface-variant">{block.note}</p>
      <div className="mt-6 flex gap-4 overflow-x-auto pb-2">
        {block.moods.map((mood) => (
          <Link key={mood.label} href={mood.href} className="group w-36 shrink-0 text-center">
            <div className="overflow-hidden rounded-2xl">
              <Image
                src={mood.image}
                alt={mood.label}
                width={220}
                height={280}
                className="aspect-[4/5] w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <span className="mt-2 block font-body text-sm font-medium text-primary">{mood.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
