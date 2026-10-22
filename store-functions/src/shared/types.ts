export interface ProductVariant {
  id: string;
  color?: string;
  colorHex?: string;
  sku: string;
  price: number;
  discountPrice?: number | null;
  stock: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  categorySlugs: string[];
  fabric: string;
  description: string;
  careInstructions: string;
  images: string[];
  rating: number;
  badge?: string | null;
  variants: ProductVariant[];
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  image: string;
  price: number;
  discountPrice?: number | null;
  inStock: boolean;
  rating: number;
  badge?: string | null;
}

/** Wishlist row with live price/stock (06-wishlist-page.md), never a frozen copy from add time. */
export interface WishlistItem extends ProductSummary {
  sku: string;
  fabric: string;
  variantId: string;
  stock: number;
}

/** Cart line as stored by the client (guest cart lives in localStorage). `unitPrice` is the price the shopper last saw. */
export interface CartLineInput {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice?: number;
}

export type CartIssueType = 'unavailable' | 'out-of-stock' | 'insufficient-stock' | 'price-changed';

export interface CartIssue {
  lineId: string;
  type: CartIssueType;
  message: string;
  /** insufficient-stock: the most the shopper can buy right now. */
  maxQuantity?: number;
  /** price-changed: what the shopper saw vs the live price. */
  previousPrice?: number;
  currentPrice?: number;
}

/** Cart row resolved against the live catalog — price/stock are never trusted from the browser. */
export interface CartItem {
  lineId: string;
  productId: string;
  variantId: string;
  slug: string;
  name: string;
  image: string;
  sku: string;
  fabric: string;
  variantLabel?: string;
  quantity: number;
  /** Live price before discount (per unit). */
  listPrice: number;
  /** Live price the shopper pays (per unit). */
  unitPrice: number;
  lineTotal: number;
  stock: number;
  inStock: boolean;
}

export interface CartCoupon {
  code: string;
  valid: boolean;
  message: string;
  discount: number;
}

export interface CartTotals {
  itemCount: number;
  /** Sum of in-stock lines at live prices. */
  subtotal: number;
  /** Savings already baked into prices (list price − sale price). */
  savings: number;
  /** Coupon discount. */
  discount: number;
  /** Null until checkout can calculate it; 0 means free. */
  shipping: number | null;
  total: number;
  freeShippingThreshold: number;
}

export interface CartView {
  items: CartItem[];
  /** Lines whose product/variant no longer exists in the catalog. */
  unavailable: { lineId: string; productId: string; variantId?: string }[];
  totals: CartTotals;
  coupon: CartCoupon | null;
}

export interface PromotionResult {
  code: string;
  valid: boolean;
  message: string;
  discount: number;
}

export type OrderStatus = 'placed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned';

export interface OrderLineItem {
  productId: string;
  slug: string;
  name: string;
  image: string;
  variant?: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  placedAt: string;
  status: OrderStatus;
  total: number;
  itemCount: number;
  thumbnails: { image: string; name: string }[];
}

export interface Order extends OrderSummary {
  items: OrderLineItem[];
  shippingAddress: { name: string; lines: string[]; phone: string };
  payment: { method: string; subtotal: number; shipping: number; discount: number; total: number };
  tracking: { carrier: string; trackingNumber: string } | null;
}

/** Signed-in customer's profile (account details page). */
export interface AccountProfile {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  memberSince: string;
  /** Loyalty tier label shown as the "Verified … Member" pill. */
  memberTier: string;
}

export interface Address {
  id: string;
  label: string;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export interface Category {
  slug: string;
  title: string;
  description: string;
  heroImage: string;
  breadcrumbLabel: string;
}

export interface NavLink {
  label: string;
  href: string;
}

export interface PolicySection {
  id: string;
  heading: string;
  bodyHtml: string;
}

export interface Policy {
  slug: string;
  title: string;
  lastUpdated: string;
  sections: PolicySection[];
}

export type HomepageBlock =
  | { id: string; type: 'six-moods'; eyebrow: string; title: string; note: string; moods: { label: string; image: string; href: string }[] }
  | { id: string; type: 'brand-story'; eyebrow: string; title: string; ctaLabel: string; ctaHref: string; products: string[] }
  | {
      id: string;
      type: 'product-carousel';
      eyebrow: string;
      title: string;
      collectionSlug: string;
      ctaLabel: string;
      ctaHref: string;
      layout: 'shelf' | 'mini';
    }
  | { id: string; type: 'bridal-spotlight'; title: string; heroImage: string; ctaHref: string; collectionSlug: string }
  | { id: string; type: 'campaign-banner'; eyebrow: string; title: string; note: string; ctaLabel: string; ctaHref: string; looks: { label: string; image: string }[] }
  | { id: string; type: 'edits-grid'; eyebrow: string; title: string; edits: { label: string; image: string; href: string }[] }
  | { id: string; type: 'collection-tiles'; tiles: { index: string; title: string; image: string; href: string }[] }
  | { id: string; type: 'editorial-panels'; eyebrow: string; title: string; ctaLabel: string; ctaHref: string; panels: { image: string; eyebrow: string; title: string; ctaLabel: string; highlighted?: boolean }[] }
  | { id: string; type: 'film-slider'; title: string; slides: { title: string; story: string; tags: string; image: string }[] }
  | { id: string; type: 'card-stack'; eyebrow: string; title: string; images: string[]; ranges: { label: string; count: number; href: string }[] };
