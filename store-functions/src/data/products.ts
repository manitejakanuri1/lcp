import { isUuid, query } from '../shared/db';
import { placeholderImage } from '../shared/placeholder-image';
import type { Product, ProductSummary, ProductVariant } from '../shared/types';

/**
 * Catalog reads over store.products / product_variants / product_images / product_categories.
 * A product is addressed by "ref": its uuid or its slug (the storefront used slugs before the database
 * existed, and its routes still do). Responses always carry the uuid in `id`.
 * Stock comes from store.variant_stock: linked POS pieces that are available and not held by an unpaid order.
 */

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  fabric: string;
  description: string;
  care_instructions: string;
  badge: string | null;
  rating: number;
  category_slugs: string[];
  images: string[];
  variants: {
    id: string;
    color: string | null;
    colorHex: string | null;
    sku: string;
    price: number;
    discountPrice: number | null;
    stock: number;
  }[];
}

const PRODUCT_SELECT = `
  SELECT p.id, p.slug, p.name, p.subtitle, p.fabric, p.description, p.care_instructions, p.badge,
         p.rating_avg AS rating,
         COALESCE((SELECT array_agg(c.slug ORDER BY pc.position, c.slug)
                     FROM store.product_categories pc JOIN store.categories c ON c.id = pc.category_id
                    WHERE pc.product_id = p.id AND c.status = 'published'), '{}') AS category_slugs,
         COALESCE((SELECT array_agg(i.url ORDER BY i.position, i.created_at)
                     FROM store.product_images i WHERE i.product_id = p.id), '{}') AS images,
         COALESCE((SELECT json_agg(json_build_object(
                          'id', v.id, 'color', v.color, 'colorHex', v.color_hex, 'sku', v.sku,
                          'price', v.price, 'discountPrice', v.discount_price, 'stock', COALESCE(s.stock, 0))
                          ORDER BY v.position, v.created_at)
                     FROM store.product_variants v LEFT JOIN store.variant_stock s ON s.variant_id = v.id
                    WHERE v.product_id = p.id AND v.is_active), '[]'::json) AS variants
    FROM store.products p
   WHERE p.status = 'published'`;

function toProduct(r: ProductRow): Product {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    subtitle: r.subtitle,
    categorySlugs: r.category_slugs,
    fabric: r.fabric,
    description: r.description,
    careInstructions: r.care_instructions,
    images: r.images.length ? r.images : [placeholderImage(`${r.slug}-1`)],
    rating: r.rating,
    badge: r.badge,
    variants: r.variants.map(
      (v): ProductVariant => ({
        id: v.id,
        ...(v.color ? { color: v.color } : {}),
        ...(v.colorHex ? { colorHex: v.colorHex } : {}),
        sku: v.sku,
        price: v.price,
        discountPrice: v.discountPrice,
        stock: v.stock,
      }),
    ),
  };
}

/** One published product by uuid or slug. */
export async function findProduct(ref: string): Promise<Product | undefined> {
  const { rows } = await query<ProductRow>(`${PRODUCT_SELECT} AND ${isUuid(ref) ? 'p.id = $1' : 'p.slug = $1'}`, [ref]);
  return rows[0] && toProduct(rows[0]);
}

/** Many published products at once, indexed by BOTH uuid and slug so callers can look up whichever they hold. */
export async function findProducts(refs: string[]): Promise<Map<string, Product>> {
  const unique = [...new Set(refs)];
  const out = new Map<string, Product>();
  if (unique.length === 0) return out;
  const ids = unique.filter(isUuid);
  const { rows } = await query<ProductRow>(`${PRODUCT_SELECT} AND (p.id = ANY($1::uuid[]) OR p.slug = ANY($2::text[]))`, [
    ids,
    unique,
  ]);
  for (const r of rows) {
    const product = toProduct(r);
    out.set(product.id, product);
    out.set(product.slug, product);
  }
  return out;
}

/** Row shape of store.product_summaries. */
export interface SummaryRow {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  price: number | null;
  discount_price: number | null;
  in_stock: boolean;
  rating: number;
  badge: string | null;
}

export function toProductSummary(r: SummaryRow): ProductSummary {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    image: r.image ?? placeholderImage(r.slug),
    price: r.price ?? 0,
    discountPrice: r.discount_price,
    inStock: r.in_stock,
    rating: r.rating,
    badge: r.badge,
  };
}

/** Summaries (cheapest active variant, any-variant-in-stock) for an explicit list of refs, in the order given. */
export async function summariesByRefs(refs: string[], limit: number): Promise<ProductSummary[]> {
  const unique = [...new Set(refs)].slice(0, limit);
  if (unique.length === 0) return [];
  const { rows } = await query<SummaryRow>(
    `SELECT * FROM store.product_summaries WHERE id = ANY($1::uuid[]) OR slug = ANY($2::text[])`,
    [unique.filter(isUuid), unique],
  );
  const byKey = new Map<string, SummaryRow>();
  for (const r of rows) {
    byKey.set(r.id, r);
    byKey.set(r.slug, r);
  }
  const seen = new Set<string>();
  const out: ProductSummary[] = [];
  for (const ref of unique) {
    const r = byKey.get(ref);
    if (r && !seen.has(r.id)) {
      seen.add(r.id);
      out.push(toProductSummary(r));
    }
  }
  return out;
}
