import Image from 'next/image';
import Link from 'next/link';
import { getProductSummaries } from '@/lib/cloud-functions/catalog';
import type { HomepageBlock } from '@/lib/types';
import { ProductRail } from '../ProductRail';

export async function BridalSpotlight({ block }: { block: Extract<HomepageBlock, { type: 'bridal-spotlight' }> }) {
  const { products } = await getProductSummaries({ collection: block.collectionSlug, limit: 6 });

  return (
    <section
      className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-12 md:px-8 lg:grid-cols-[1.2fr_1fr]"
      aria-labelledby={block.id}
    >
      <Link href={block.ctaHref} className="block overflow-hidden rounded-2xl">
        <Image
          src={block.heroImage}
          alt={block.title}
          width={640}
          height={760}
          className="aspect-[3/4] w-full object-cover transition-transform duration-500 hover:scale-105"
        />
      </Link>
      <div>
        <h2 id={block.id} className="font-display text-3xl font-bold tracking-tight text-primary md:text-4xl">
          {block.title}
        </h2>
        <div className="mt-6">
          <ProductRail products={products} />
        </div>
      </div>
    </section>
  );
}
