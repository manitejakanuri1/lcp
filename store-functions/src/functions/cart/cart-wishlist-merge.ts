import { MAX_LINE_QUANTITY, parseLines, resolve } from '../../data/cart';
import { findProducts } from '../../data/products';
import { requireCustomer } from '../../shared/customer-auth';
import { query } from '../../shared/db';
import { sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

const MAX_WISHLIST = 200;

const ids = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 100).slice(0, MAX_WISHLIST)
    : [];

/**
 * SIGNED-IN ONLY. Merges the guest cart/wishlist from the request into the caller's ACCOUNT copy
 * (store.carts / cart_items / wishlist_items), which the server owns: a client cannot dictate what the
 * account already holds. Idempotent: store.merge_guest_state never duplicates a variant and the larger
 * quantity wins, so a repeat login cannot double a line. Lines for products that no longer exist are dropped.
 * Returns the merged state, which becomes the client's cart.
 */
export const cartWishlistMerge = handle(
  'POST',
  async (req, res) => {
    const { customer } = await requireCustomer(req);
    const body = req.body ?? {};

    // Guest lines may name a product by slug or uuid and may omit the variant: resolve both to uuids.
    const { resolved } = await resolve(parseLines(body.guestCart));
    const cart = resolved.map((r) => ({ variantId: r.variant.id, quantity: r.input.quantity, unitPrice: r.input.unitPrice ?? null }));
    const wishRefs = ids(body.guestWishlist);
    const wishProducts = await findProducts(wishRefs);
    const wish = [...new Set(wishRefs.flatMap((ref) => (wishProducts.get(ref) ? [wishProducts.get(ref)!.id] : [])))];

    await query('SELECT store.merge_guest_state($1, $2::jsonb, $3::jsonb, $4)', [
      customer.id,
      JSON.stringify(cart),
      JSON.stringify(wish),
      MAX_LINE_QUANTITY,
    ]);

    const [cartRows, wishRows] = await Promise.all([
      query<{ productId: string; variantId: string; quantity: number; unitPrice: number | null }>(
        `SELECT v.product_id AS "productId", i.variant_id AS "variantId", i.quantity, i.unit_price_seen AS "unitPrice"
           FROM store.carts c JOIN store.cart_items i ON i.cart_id = c.id JOIN store.product_variants v ON v.id = i.variant_id
          WHERE c.customer_id = $1 ORDER BY i.added_at, i.id`,
        [customer.id],
      ),
      query<{ product_id: string }>(`SELECT product_id FROM store.wishlist_items WHERE customer_id = $1 ORDER BY added_at, product_id`, [customer.id]),
    ]);
    sendJson(res, {
      cart: cartRows.rows.map((r) => ({
        productId: r.productId,
        variantId: r.variantId,
        quantity: r.quantity,
        ...(r.unitPrice === null ? {} : { unitPrice: r.unitPrice }),
      })),
      wishlist: wishRows.rows.map((r) => r.product_id),
    });
  },
  { private: true },
);
