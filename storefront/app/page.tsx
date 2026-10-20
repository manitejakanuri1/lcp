import { getHomepage } from '@/lib/cloud-functions/cms';
import { SectionRenderer } from '@/components/sections/SectionRenderer';

// SDUI over SSR: the CMS payload is fetched server-side on every request and
// assembled into HTML here — never a client-side fetch-then-render (high level doc).
export default async function HomePage() {
  const { blocks } = await getHomepage();

  return (
    <div className="bg-warm-ivory text-primary">
      {blocks.map((block) => (
        <SectionRenderer key={block.id} block={block} />
      ))}
    </div>
  );
}
