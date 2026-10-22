import { query } from '../shared/db';
import { placeholderImage } from '../shared/placeholder-image';
import type { Category } from '../shared/types';

interface CategoryRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  hero_image_url: string | null;
  breadcrumb_label: string;
}

/** A published category by slug, plus its uuid for joins. */
export async function findCategory(slug: string): Promise<(Category & { dbId: string }) | undefined> {
  const { rows } = await query<CategoryRow>(
    `SELECT id, slug, title, description, hero_image_url, breadcrumb_label
       FROM store.categories WHERE slug = $1 AND status = 'published'`,
    [slug],
  );
  const r = rows[0];
  if (!r) return undefined;
  return {
    dbId: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    heroImage: r.hero_image_url ?? placeholderImage(`cat-${r.slug}`, 1600, 700),
    breadcrumbLabel: r.breadcrumb_label,
  };
}
