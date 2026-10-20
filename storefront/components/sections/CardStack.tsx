import Image from 'next/image';
import Link from 'next/link';
import type { HomepageBlock } from '@/lib/types';

export function CardStack({ block }: { block: Extract<HomepageBlock, { type: 'card-stack' }> }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8" aria-labelledby={block.id}>
      <p className="font-body text-xs font-semibold uppercase tracking-[0.25em] text-antique-gold">{block.eyebrow}</p>
      <h2 id={block.id} className="mt-1 font-display text-3xl font-bold tracking-tight text-primary md:text-4xl">
        {block.title}
      </h2>
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {block.images.map((image, index) => (
          <Image
            key={image}
            src={image}
            alt=""
            width={280}
            height={360}
            priority={index === 0}
            className="aspect-[3/4] w-36 shrink-0 rounded-2xl object-cover md:w-44"
          />
        ))}
      </div>
      <ul className="mt-6 divide-y divide-outline/20 border-t border-outline/20">
        {block.ranges.map((range) => (
          <li key={range.label}>
            <Link
              href={range.href}
              className="flex items-center justify-between py-3 font-body text-sm text-primary transition-colors hover:text-antique-gold"
            >
              {range.label}
              <span className="text-on-surface-variant">{range.count} Sarees</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
