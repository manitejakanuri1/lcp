export interface NavLink {
  label: string;
  href: string;
}

export interface NavCategoryLink extends NavLink {
  badge?: string;
}

export interface NavFooter {
  brandBlurb: string;
  certificationLabel: string;
  shopLinks: NavLink[];
  careLinks: NavLink[];
  newsletterBlurb: string;
  socialLinks: NavLink[];
  policyLinks: NavLink[];
  copyright: string;
}

export interface NavPayload {
  utilityLinks: NavLink[];
  trustBadge: { title: string; subtitle: string };
  tagline: string;
  categories: NavCategoryLink[];
  footer: NavFooter;
}

export interface ProductVariantSummary {
  variantId: string;
  price: number;
  discountPrice: number | null;
  stock: number;
  inStock: boolean;
}

export interface PriceStockPayload {
  productId: string;
  variants: ProductVariantSummary[];
}

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

export interface Breadcrumb {
  label: string;
  href: string;
}

export interface Category {
  slug: string;
  title: string;
  description: string;
  heroImage: string;
  breadcrumbLabel: string;
  breadcrumb: Breadcrumb[];
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface CategoryProductsSearchResult {
  products: ProductSummary[];
  facets: { fabric: FacetValue[]; color: FacetValue[] };
  pagination: { page: number; pageSize: number; total: number };
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

export interface HomepagePayload {
  blocks: HomepageBlock[];
}

/** Wishlist row with live price/stock (06-wishlist-page.md). */
export interface WishlistItem extends ProductSummary {
  sku: string;
  fabric: string;
  variantId: string;
  stock: number;
}

export type CartIssueType = 'unavailable' | 'out-of-stock' | 'insufficient-stock' | 'price-changed';

export interface CartIssue {
  lineId: string;
  type: CartIssueType;
  message: string;
  maxQuantity?: number;
  previousPrice?: number;
  currentPrice?: number;
}

/** Cart row resolved against the live catalog (04-cart-page.md). */
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
  listPrice: number;
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
  subtotal: number;
  savings: number;
  discount: number;
  /** Null until checkout can calculate it; 0 means free. */
  shipping: number | null;
  total: number;
  freeShippingThreshold: number;
}

export interface CartView {
  items: CartItem[];
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

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AccountProfile {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  memberSince: string;
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

export type AddressInput = Omit<Address, 'id' | 'isDefault'> & { id?: string; isDefault?: boolean };
