import Link from 'next/link';
import { getProductSummaries } from '@/lib/cloud-functions/catalog';
import type { HomepageBlock } from '@/lib/types';
import { ProductRail } from '../ProductRail';

export async function ProductCarousel({ block }: { block: Extract<HomepageBlock, { type: 'product-carousel' }> }) {
  const { products } = await getProductSummaries({ collection: block.collectionSlug, limit: block.layout === 'mini' ? 4 : 8 });

  return (
    <section
      className={`mx-auto max-w-7xl px-4 py-12 md:px-8 ${block.layout === 'mini' ? 'shelf-mini' : ''}`}
      aria-labelledby={block.id}
    >
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
      <div className="mt-6">
        <ProductRail products={products} />
      </div>
    </section>
  );
}
