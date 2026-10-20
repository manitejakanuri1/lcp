import { callFunction } from './client';
import type { CartIssue, CartView, PromotionResult } from '../types';

export interface CartLineInput {
  productId: string;
  variantId?: string;
  quantity: number;
  /** Price the shopper last saw; lets the server flag a change instead of silently repricing. */
  unitPrice?: number;
}

export interface CartLineResult {
  line: { productId: string; variantId: string; quantity: number; unitPrice: number };
  /** True when the server capped the quantity at live stock. */
  clamped: boolean;
}

export interface CartWishlistCounts {
  cartCount: number;
  wishlistCount: number;
}

/** Header icon counts (01-landing-page.md) — client, after the SSR shell hydrates. */
export function getCartWishlistCount(): Promise<CartWishlistCounts> {
  return callFunction<CartWishlistCounts>('cart-wishlist-count-get');
}

/** Lines resolved to live price/stock with computed totals. */
export function getCart(lines: CartLineInput[], coupon?: string): Promise<CartView> {
  return callFunction('cart-get', { method: 'POST', body: { lines, coupon }, cache: 'no-store' });
}

export function validateCart(lines: CartLineInput[]): Promise<{ valid: boolean; issues: CartIssue[] }> {
  return callFunction('cart-validate', { method: 'POST', body: { lines }, cache: 'no-store' });
}

export function addCartItem(productId: string, variantId: string | undefined, quantity = 1): Promise<CartLineResult> {
  return callFunction('cart-item-add', { method: 'POST', body: { productId, variantId, quantity } });
}

export function updateCartItem(productId: string, variantId: string, quantity: number): Promise<CartLineResult> {
  return callFunction('cart-item-update', { method: 'POST', body: { productId, variantId, quantity } });
}

export function removeCartItem(productId: string, variantId: string): Promise<{ success: boolean; lineId: string }> {
  return callFunction('cart-item-remove', { method: 'POST', body: { productId, variantId } });
}

export function validatePromotion(code: string, subtotal: number): Promise<PromotionResult> {
  return callFunction('promotion-validate', { method: 'POST', body: { code, subtotal } });
}

/** Called by the login flow to fold the guest cart/wishlist into the account's. */
export function mergeCartWishlist(input: {
  guestCart: CartLineInput[];
  guestWishlist: string[];
}): Promise<{ cart: CartLineInput[]; wishlist: string[] }> {
  return callFunction('cart-wishlist-merge', { method: 'POST', body: input, auth: true });
}
