// Error codes for the { error: { code, message } } envelope (see ../shared/envelope.ts).

export const STORE_ERROR_CODES = [
  'UNAUTHENTICATED', // 401: no/invalid session
  'FORBIDDEN', // 403: role not allowed (e.g. salesman asking for cost data)
  'VALIDATION_ERROR', // 400
  'PRODUCT_NOT_FOUND', // 404
  'BILL_NOT_FOUND', // 404
  'DUPLICATE_SKU', // 409: products.sku UNIQUE
  'DUPLICATE_BILL_NUMBER', // 409: bills.bill_number UNIQUE (generate_bill_number race)
  'PRODUCT_ALREADY_SOLD', // 409: product.status is already 'sold'
  'INTERNAL_ERROR', // 500
  // Storefront (customer) codes
  'METHOD_NOT_ALLOWED', // 405
  'INVALID_CREDENTIALS', // 401: wrong email/password (never says which)
  'TOO_MANY_REQUESTS', // 429: login throttle
  'ACCOUNT_BLOCKED', // 403: customers.is_blocked
  'AUTH_NOT_CONFIGURED', // 503: required auth env vars missing (fails closed)
  'ADDRESS_NOT_FOUND', // 404
  'ORDER_NOT_FOUND', // 404 (also returned for another customer's order: no existence leak)
  'VARIANT_NOT_FOUND', // 404
  'OUT_OF_STOCK', // 409
  'INVALID_EMAIL', // 400
  'INVALID_PHONE', // 400
  'INVALID_PINCODE', // 400
] as const;
export type StoreErrorCode = (typeof STORE_ERROR_CODES)[number];

export interface ErrorBody {
  error: { code: StoreErrorCode; message: string };
}
