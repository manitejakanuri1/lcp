import Image from 'next/image';
import type { HomepageBlock } from '@/lib/types';

export function FilmSlider({ block }: { block: Extract<HomepageBlock, { type: 'film-slider' }> }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8" aria-labelledby={block.id}>
      <h2 id={block.id} className="font-display text-3xl font-bold tracking-tight text-primary md:text-4xl">
        {block.title}
      </h2>
      <div className="mt-6 flex gap-4 overflow-x-auto pb-2">
        {block.slides.map((slide) => (
          <figure key={slide.title} className="w-60 shrink-0">
            <div className="overflow-hidden rounded-2xl">
              <Image
                src={slide.image}
                alt={slide.title}
                width={480}
                height={600}
                className="aspect-[4/5] w-full object-cover"
              />
            </div>
            <figcaption className="mt-2">
              <h3 className="font-display text-base font-bold text-primary">{slide.title}</h3>
              <p className="font-body text-xs text-on-surface-variant">{slide.story}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
