import Image from 'next/image';
import Link from 'next/link';
import type { HomepageBlock } from '@/lib/types';

export function EditsGrid({ block }: { block: Extract<HomepageBlock, { type: 'edits-grid' }> }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8" aria-labelledby={block.id}>
      <p className="font-body text-xs font-semibold uppercase tracking-[0.25em] text-antique-gold">{block.eyebrow}</p>
      <h2 id={block.id} className="mt-1 font-display text-3xl font-bold tracking-tight text-primary md:text-4xl">
        {block.title}
      </h2>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {block.edits.map((edit) => (
          <Link key={edit.label} href={edit.href} className="group block">
            <div className="overflow-hidden rounded-2xl">
              <Image
                src={edit.image}
                alt={edit.label}
                width={280}
                height={340}
                className="aspect-[4/5] w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <span className="mt-2 block font-body text-sm font-medium text-primary">{edit.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
