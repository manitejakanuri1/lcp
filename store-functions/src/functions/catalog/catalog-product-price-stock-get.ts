import { findProduct } from '../../data/products';
import { sendError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

/**
 * Kept separate from catalog-product-get so the PDP can re-check price/stock
 * live (on ISR revalidation, and again client-side right before add-to-cart)
 * without trusting the statically-cached product page.
 */
export const catalogProductPriceStockGet = handle('GET', async (req, res) => {
  const slug = String(req.query.slug ?? '');
  const product = await findProduct(slug);

  if (!product) {
    sendError(res, 404, 'PRODUCT_NOT_FOUND', `No product found for slug "${slug}".`);
    return;
  }

  const variantId = req.query.variantId ? String(req.query.variantId) : undefined;
  const variants = variantId ? product.variants.filter((v) => v.id === variantId) : product.variants;

  if (variantId && variants.length === 0) {
    sendError(res, 404, 'VARIANT_NOT_FOUND', `No variant found with id "${variantId}".`);
    return;
  }

  sendJson(res, {
    productId: product.id,
    variants: variants.map((v) => ({
      variantId: v.id,
      price: v.price,
      discountPrice: v.discountPrice ?? null,
      stock: v.stock,
      inStock: v.stock > 0,
    })),
  });
});
