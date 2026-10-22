import { findProducts, toProductSummary } from '../../data/products';
import { sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';
import type { WishlistItem } from '../../shared/types';

const MAX_IDS = 100;

/**
 * Saved products with LIVE price/stock (06-wishlist-page.md). Accepts ?ids=ref1,ref2 (uuid or slug)
 * because the saved list itself lives client-side (localStorage) until the account copy exists; this
 * function only resolves those ids against the catalog. Unknown ids are skipped; sold-out items are
 * returned (flagged `inStock: false`), never dropped.
 */
export const wishlistGet = handle('GET', async (req, res) => {
  const ids = String(req.query.ids ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);
  const products = await findProducts(ids);

  const items: WishlistItem[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const product = products.get(id);
    if (!product || seen.has(product.id)) continue;
    seen.add(product.id);
    const variant = product.variants.find((v) => v.stock > 0) ?? product.variants[0];
    if (!variant) continue;
    items.push({
      ...toProductSummary({
        id: product.id,
        slug: product.slug,
        name: product.name,
        image: product.images[0],
        price: variant.price,
        discount_price: variant.discountPrice ?? null,
        in_stock: product.variants.some((v) => v.stock > 0),
        rating: product.rating,
        badge: product.badge ?? null,
      }),
      sku: variant.sku,
      fabric: product.fabric,
      variantId: variant.id,
      stock: variant.stock,
    });
  }

  sendJson(res, { items });
});
