import Image from 'next/image';
import Link from 'next/link';
import type { HomepageBlock } from '@/lib/types';

/**
 * One wide photograph across the top of the home page, with its words already set into the
 * picture. The shop supplies the artwork, so nothing is written over it here: an overlaid
 * headline would land on a model's face at one width and on a lamp at another.
 *
 * It is the first thing on the page, so the image loads at priority rather than lazily.
 */
export function HeroBanner({ block }: { block: Extract<HomepageBlock, { type: 'hero-banner' }> }) {
  const picture = (
    <Image
      src={block.image}
      alt={block.alt}
      width={1920}
      height={768}
      quality={92}
      priority
      sizes="100vw"
      className="h-auto w-full"
    />
  );

  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 md:px-8" aria-label={block.alt}>
      <div className="overflow-hidden rounded-2xl">
        {block.ctaHref ? <Link href={block.ctaHref}>{picture}</Link> : picture}
      </div>
    </section>
  );
}
