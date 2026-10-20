import Image from 'next/image';
import Link from 'next/link';
import type { HomepageBlock } from '@/lib/types';

export function CollectionTiles({ block }: { block: Extract<HomepageBlock, { type: 'collection-tiles' }> }) {
  return (
    <section
      className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-12 sm:grid-cols-2 md:px-8 lg:grid-cols-4"
      aria-label="Collections"
    >
      {block.tiles.map((tile) => (
        <Link key={tile.title} href={tile.href} className="group relative block overflow-hidden rounded-2xl">
          <Image
            src={tile.image}
            alt={tile.title}
            width={320}
            height={400}
            className="aspect-[4/5] w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-heritage-black/80 via-heritage-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 text-warm-ivory">
            <small className="font-body text-[11px] uppercase tracking-[0.2em] text-antique-gold">{tile.index}</small>
            <p className="mt-1 font-display text-xl font-bold">{tile.title}</p>
            <em className="mt-1 block font-body text-xs not-italic text-warm-ivory/80">Explore now →</em>
          </div>
        </Link>
      ))}
    </section>
  );
}
