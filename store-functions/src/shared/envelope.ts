import type { Response } from 'express';
import type { StoreErrorCode } from '../contracts';

export function sendJson(res: Response, body: unknown, status = 200): void {
  res.status(status).json(body);
}

/** Storefront (catalog/cms/newsletter) functions also use their own codes, so `code` stays a string here. */
export function sendError(res: Response, status: number, code: string, message: string): void {
  res.set('Cache-Control', 'no-store'); // never let a shared cache keep an error
  res.status(status).json({ error: { code, message } });
}

const STATUS_BY_CODE: Record<StoreErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  PRODUCT_NOT_FOUND: 404,
  BILL_NOT_FOUND: 404,
  DUPLICATE_SKU: 409,
  DUPLICATE_BILL_NUMBER: 409,
  PRODUCT_ALREADY_SOLD: 409,
  INTERNAL_ERROR: 500,
  METHOD_NOT_ALLOWED: 405,
  INVALID_CREDENTIALS: 401,
  TOO_MANY_REQUESTS: 429,
  ACCOUNT_BLOCKED: 403,
  AUTH_NOT_CONFIGURED: 503,
  ADDRESS_NOT_FOUND: 404,
  ORDER_NOT_FOUND: 404,
  VARIANT_NOT_FOUND: 404,
  OUT_OF_STOCK: 409,
  INVALID_EMAIL: 400,
  INVALID_PHONE: 400,
  INVALID_PINCODE: 400,
};

/** Throwable error carrying a contract error code; handlers catch it via `handle()`. */
export class StoreError extends Error {
  constructor(
    readonly code: StoreErrorCode,
    message: string,
  ) {
    super(message);
  }
  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
}

export function sendStoreError(res: Response, err: unknown): void {
  if (err instanceof StoreError) {
    sendError(res, err.status, err.code, err.message);
    return;
  }
  console.error(err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected error.');
}
