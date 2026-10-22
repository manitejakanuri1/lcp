import { findProduct, findProducts } from './products';
import { query } from '../shared/db';
import type {
  CartCoupon,
  CartIssue,
  CartItem,
  CartLineInput,
  CartTotals,
  CartView,
  Product,
  ProductVariant,
  PromotionResult,
} from '../shared/types';

/** Matches the wishlist page's complimentary-shipping goal (also store.site_settings.free_shipping_threshold). */
export const FREE_SHIPPING_ABOVE = 2999;
export const MAX_LINE_QUANTITY = 10;
/** Upper bound on lines per request: keeps the public pricing endpoints cheap to abuse-proof. */
export const MAX_CART_LINES = 50;
const MAX_ID_LENGTH = 100;

export const lineIdOf = (productId: string, variantId: string) => `${productId}:${variantId}`;

const effectivePrice = (variant: ProductVariant) => variant.discountPrice ?? variant.price;

export function resolveVariant(product: Product, variantId?: string): ProductVariant | undefined {
  return variantId ? product.variants.find((v) => v.id === variantId) : product.variants[0];
}

/** Sanitises untrusted client input into well-formed lines (positive integer quantities, bounded size). */
export function parseLines(raw: unknown): CartLineInput[] {
  if (!Array.isArray(raw)) return [];
  const lines: CartLineInput[] = [];
  for (const entry of raw.slice(0, MAX_CART_LINES)) {
    if (!entry || typeof entry !== 'object') continue;
    const { productId, variantId, quantity, unitPrice } = entry as Record<string, unknown>;
    if (typeof productId !== 'string' || !productId || productId.length > MAX_ID_LENGTH) continue;
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty < 1) continue;
    lines.push({
      productId,
      variantId: typeof variantId === 'string' && variantId && variantId.length <= MAX_ID_LENGTH ? variantId : undefined,
      quantity: Math.min(qty, MAX_LINE_QUANTITY),
      unitPrice: typeof unitPrice === 'number' && Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : undefined,
    });
  }
  return lines;
}

interface Resolved {
  input: CartLineInput;
  lineId: string;
  product: Product;
  variant: ProductVariant;
}

/**
 * Resolves lines against the live catalog (one query for all products). Lines that point at the same
 * product + variant (the client store may hold "no variant" and "first variant" separately) are folded
 * into one, quantity capped at MAX_LINE_QUANTITY, so a caller cannot exceed the cap by repeating a line
 * and the cart page never renders two rows with the same key.
 */
export async function resolve(lines: CartLineInput[]): Promise<{ resolved: Resolved[]; unavailable: CartView['unavailable'] }> {
  const products = await findProducts(lines.map((l) => l.productId));
  const byLine = new Map<string, Resolved>();
  const unavailableById = new Map<string, CartView['unavailable'][number]>();
  for (const input of lines) {
    const product = products.get(input.productId);
    const variant = product ? resolveVariant(product, input.variantId) : undefined;
    if (!product || !variant) {
      const lineId = lineIdOf(input.productId, input.variantId ?? 'default');
      unavailableById.set(lineId, { lineId, productId: input.productId, variantId: input.variantId });
      continue;
    }
    const lineId = lineIdOf(product.id, variant.id);
    const existing = byLine.get(lineId);
    if (existing) {
      existing.input = { ...existing.input, quantity: Math.min(existing.input.quantity + input.quantity, MAX_LINE_QUANTITY) };
    } else {
      byLine.set(lineId, { input, lineId, product, variant });
    }
  }
  return { resolved: [...byLine.values()], unavailable: [...unavailableById.values()] };
}

function toItem({ input, lineId, product, variant }: Resolved): CartItem {
  const unitPrice = effectivePrice(variant);
  return {
    lineId,
    productId: product.id,
    variantId: variant.id,
    slug: product.slug,
    name: product.name,
    image: product.images[0],
    sku: variant.sku,
    fabric: product.fabric,
    variantLabel: variant.color,
    quantity: input.quantity,
    listPrice: variant.price,
    unitPrice,
    lineTotal: unitPrice * input.quantity,
    stock: variant.stock,
    inStock: variant.stock > 0,
  };
}

interface PromotionRow {
  code: string;
  description: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  max_discount: number | null;
  min_subtotal: number;
  used: number;
  usage_limit: number | null;
}

/**
 * Advisory coupon check against a subtotal (checkout recomputes and redeems with store.redeem_promotion,
 * which also enforces the per-customer limit). Unknown, inactive, expired, exhausted and too-small-bag
 * codes all answer `valid: false` with a message the form can show.
 */
export async function applyPromotion(code: string, subtotal: number): Promise<PromotionResult> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { code: '', valid: false, message: 'Enter a coupon code.', discount: 0 };

  const { rows } = await query<PromotionRow>(
    `SELECT p.code::text AS code, p.description, p.discount_type, p.discount_value, p.max_discount, p.min_subtotal,
            p.usage_limit, (SELECT COUNT(*)::int FROM store.promotion_redemptions r WHERE r.promotion_id = p.id) AS used
       FROM store.promotions p
      WHERE p.code = $1 AND p.is_active
        AND (p.starts_at IS NULL OR p.starts_at <= NOW())
        AND (p.ends_at IS NULL OR p.ends_at > NOW())`,
    [normalized],
  );
  const promo = rows[0];
  if (!promo || (promo.usage_limit !== null && promo.used >= promo.usage_limit)) {
    return { code: normalized, valid: false, message: `"${normalized}" is not a valid coupon code.`, discount: 0 };
  }
  if (promo.min_subtotal > 0 && subtotal < promo.min_subtotal) {
    return {
      code: normalized,
      valid: false,
      message: `${normalized} needs a bag value of at least ₹${promo.min_subtotal.toLocaleString('en-IN')}.`,
      discount: 0,
    };
  }

  const raw = promo.discount_type === 'percent' ? Math.round((subtotal * promo.discount_value) / 100) : promo.discount_value;
  const discount = Math.min(raw, promo.max_discount ?? raw, subtotal);
  return { code: normalized, valid: true, message: `${normalized} applied — ${promo.description || 'discount'}.`, discount };
}

export async function buildCartView(lines: CartLineInput[], couponCode?: string): Promise<CartView> {
  const { resolved, unavailable } = await resolve(lines);
  const items = resolved.map(toItem);

  // Sold-out lines stay visible but are excluded from what the shopper would pay.
  const payable = items.filter((item) => item.inStock);
  const subtotal = payable.reduce((sum, item) => sum + item.lineTotal, 0);
  const savings = payable.reduce((sum, item) => sum + (item.listPrice - item.unitPrice) * item.quantity, 0);

  let coupon: CartCoupon | null = null;
  if (couponCode) {
    const result = await applyPromotion(couponCode, subtotal);
    coupon = { code: result.code, valid: result.valid, message: result.message, discount: result.discount };
  }
  const discount = coupon?.valid ? coupon.discount : 0;

  const totals: CartTotals = {
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal,
    savings,
    discount,
    // Free once the threshold is met; otherwise it depends on the address, so checkout decides.
    shipping: subtotal >= FREE_SHIPPING_ABOVE ? 0 : null,
    total: subtotal - discount,
    freeShippingThreshold: FREE_SHIPPING_ABOVE,
  };

  return { items, unavailable, totals, coupon };
}

export type PricedLine =
  | { ok: true; line: { productId: string; variantId: string; quantity: number; unitPrice: number }; clamped: boolean }
  | { ok: false; code: 'PRODUCT_NOT_FOUND' | 'VARIANT_NOT_FOUND' | 'OUT_OF_STOCK'; message: string };

/** Server-side price/stock check for a single add/update — the browser never supplies the price. */
export async function priceLine(productId: string, variantId: string | undefined, requested: number): Promise<PricedLine> {
  const product = await findProduct(productId);
  if (!product) return { ok: false, code: 'PRODUCT_NOT_FOUND', message: `No product found for id "${productId}".` };
  const variant = resolveVariant(product, variantId);
  if (!variant) return { ok: false, code: 'VARIANT_NOT_FOUND', message: `No variant "${variantId}" for ${product.name}.` };
  if (variant.stock <= 0) return { ok: false, code: 'OUT_OF_STOCK', message: `${product.name} is sold out.` };

  const quantity = Math.min(requested, variant.stock, MAX_LINE_QUANTITY);
  return {
    ok: true,
    clamped: quantity !== requested,
    line: { productId: product.id, variantId: variant.id, quantity, unitPrice: effectivePrice(variant) },
  };
}

/** Everything the shopper must be told about before paying (never silently reprice). */
export async function findIssues(lines: CartLineInput[]): Promise<CartIssue[]> {
  const { resolved, unavailable } = await resolve(lines);
  const issues: CartIssue[] = unavailable.map((entry) => ({
    lineId: entry.lineId,
    type: 'unavailable',
    message: 'This piece is no longer available.',
  }));

  for (const { input, lineId, product, variant } of resolved) {
    if (variant.stock <= 0) {
      issues.push({ lineId, type: 'out-of-stock', message: `${product.name} is sold out.` });
      continue;
    }
    if (input.quantity > variant.stock) {
      issues.push({
        lineId,
        type: 'insufficient-stock',
        message: `Only ${variant.stock} of ${product.name} ${variant.stock === 1 ? 'is' : 'are'} left.`,
        maxQuantity: variant.stock,
      });
    }
    const current = effectivePrice(variant);
    if (input.unitPrice !== undefined && input.unitPrice !== current) {
      issues.push({
        lineId,
        type: 'price-changed',
        message: `The price of ${product.name} changed.`,
        previousPrice: input.unitPrice,
        currentPrice: current,
      });
    }
  }
  return issues;
}
