'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';

/**
 * Single client store for wishlist + cart ids, mounted once in the root layout so every
 * heart icon / badge reads the same state (06-wishlist-page.md: toggle state stays in
 * sync across landing, section and product pages). localStorage is the source of truth
 * (read through useSyncExternalStore, so tabs stay in sync too). Guest-only for now;
 * merge-on-login (`cart-wishlist-merge`) lands with the login flow.
 */

export interface WishlistEntry {
  id: string;
  addedAt: number;
}

export interface CartLine {
  productId: string;
  variantId?: string;
  quantity: number;
  /** Price the shopper last saw for this line; the cart page flags it if the live price differs. */
  unitPrice?: number;
}

interface CartWishlistContextValue {
  /** False during SSR/hydration; consumers must not render empty states before this is true. */
  ready: boolean;
  wishlist: WishlistEntry[];
  cart: CartLine[];
  wishlistCount: number;
  cartCount: number;
  isWishlisted: (productId: string) => boolean;
  toggleWishlist: (productId: string) => void;
  removeFromWishlist: (productId: string) => void;
  addToCart: (productId: string, variantId?: string, quantity?: number, unitPrice?: number) => void;
  /** Units of this product + variant already in the bag (0 if none). */
  cartQuantityOf: (productId: string, variantId: string | undefined) => number;
  setCartQuantity: (productId: string, variantId: string | undefined, quantity: number) => void;
  removeFromCart: (productId: string, variantId: string | undefined) => void;
  /** Records the price the shopper has now accepted for a line. */
  acceptCartPrice: (productId: string, variantId: string | undefined, unitPrice: number) => void;
  addToWishlist: (productId: string) => void;
}

/** Mirrors the server's per-line cap (store_functions MAX_LINE_QUANTITY; later site_settings.max_line_quantity). */
export const MAX_LINE_QUANTITY = 10;

const WISHLIST_KEY = 'ls.wishlist.v1';
const CART_KEY = 'ls.cart.v1';
const CHANGE_EVENT = 'ls:store-change';

const CartWishlistContext = createContext<CartWishlistContextValue | null>(null);

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange); // other tabs
  window.addEventListener(CHANGE_EVENT, onChange); // this tab
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Raw string snapshot: stable between reads, so useSyncExternalStore doesn't loop. */
const rawSnapshot = (key: string) => () => {
  try {
    return window.localStorage.getItem(key) ?? '[]';
  } catch {
    return '[]';
  }
};

const serverSnapshot = () => '[]';

function parse<T>(raw: string): T[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function update<T>(key: string, change: (current: T[]) => T[]) {
  try {
    const current = parse<T>(window.localStorage.getItem(key) ?? '[]');
    window.localStorage.setItem(key, JSON.stringify(change(current)));
  } catch {
    // Storage unavailable (private mode / quota): nothing to persist to.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const sameLine = (line: CartLine, productId: string, variantId: string | undefined) =>
  line.productId === productId && line.variantId === variantId;

const wishlistSnapshot = rawSnapshot(WISHLIST_KEY);
const cartSnapshot = rawSnapshot(CART_KEY);
const noopSubscribe = () => () => {};

export function CartWishlistProvider({ children }: { children: ReactNode }) {
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const wishlistRaw = useSyncExternalStore(subscribe, wishlistSnapshot, serverSnapshot);
  const cartRaw = useSyncExternalStore(subscribe, cartSnapshot, serverSnapshot);

  const wishlist = useMemo(() => parse<WishlistEntry>(wishlistRaw), [wishlistRaw]);
  const cart = useMemo(() => parse<CartLine>(cartRaw), [cartRaw]);

  const removeFromWishlist = useCallback((productId: string) => {
    update<WishlistEntry>(WISHLIST_KEY, (current) => current.filter((entry) => entry.id !== productId));
  }, []);

  const toggleWishlist = useCallback((productId: string) => {
    update<WishlistEntry>(WISHLIST_KEY, (current) =>
      current.some((entry) => entry.id === productId)
        ? current.filter((entry) => entry.id !== productId)
        : [...current, { id: productId, addedAt: Date.now() }],
    );
  }, []);

  const addToWishlist = useCallback((productId: string) => {
    update<WishlistEntry>(WISHLIST_KEY, (current) =>
      current.some((entry) => entry.id === productId) ? current : [...current, { id: productId, addedAt: Date.now() }],
    );
  }, []);

  const addToCart = useCallback((productId: string, variantId?: string, quantity = 1, unitPrice?: number) => {
    update<CartLine>(CART_KEY, (current) => {
      const existing = current.find((line) => sameLine(line, productId, variantId));
      if (existing) {
        return current.map((line) =>
          line === existing ? { ...line, quantity: Math.min(line.quantity + quantity, MAX_LINE_QUANTITY), unitPrice: unitPrice ?? line.unitPrice } : line,
        );
      }
      return [...current, { productId, variantId, quantity: Math.min(quantity, MAX_LINE_QUANTITY), unitPrice }];
    });
  }, []);

  const setCartQuantity = useCallback((productId: string, variantId: string | undefined, quantity: number) => {
    update<CartLine>(CART_KEY, (current) =>
      current.map((line) => (sameLine(line, productId, variantId) ? { ...line, quantity: Math.min(Math.max(1, quantity), MAX_LINE_QUANTITY) } : line)),
    );
  }, []);

  const removeFromCart = useCallback((productId: string, variantId: string | undefined) => {
    update<CartLine>(CART_KEY, (current) => current.filter((line) => !sameLine(line, productId, variantId)));
  }, []);

  const acceptCartPrice = useCallback((productId: string, variantId: string | undefined, unitPrice: number) => {
    update<CartLine>(CART_KEY, (current) =>
      current.map((line) => (sameLine(line, productId, variantId) ? { ...line, unitPrice } : line)),
    );
  }, []);

  const value = useMemo<CartWishlistContextValue>(
    () => ({
      ready,
      wishlist,
      cart,
      wishlistCount: wishlist.length,
      cartCount: cart.reduce((sum, line) => sum + line.quantity, 0),
      isWishlisted: (productId) => wishlist.some((entry) => entry.id === productId),
      toggleWishlist,
      removeFromWishlist,
      addToCart,
      cartQuantityOf: (productId, variantId) => cart.find((line) => sameLine(line, productId, variantId))?.quantity ?? 0,
      setCartQuantity,
      removeFromCart,
      acceptCartPrice,
      addToWishlist,
    }),
    [
      ready,
      wishlist,
      cart,
      toggleWishlist,
      removeFromWishlist,
      addToCart,
      setCartQuantity,
      removeFromCart,
      acceptCartPrice,
      addToWishlist,
    ],
  );

  return <CartWishlistContext.Provider value={value}>{children}</CartWishlistContext.Provider>;
}

export function useCartWishlist(): CartWishlistContextValue {
  const context = useContext(CartWishlistContext);
  if (!context) throw new Error('useCartWishlist must be used inside <CartWishlistProvider>');
  return context;
}
