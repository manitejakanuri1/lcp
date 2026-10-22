// Mirrors the CHECK constraints in sql_schema (the "fixed" schema is the source of truth).

export const USER_ROLES = ['founder', 'salesman'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PRODUCT_STATUSES = ['available', 'sold'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PAYMENT_METHODS = ['cash', 'card', 'upi'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
