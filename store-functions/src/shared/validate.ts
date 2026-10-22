import { StoreError } from './envelope';

const bad = (msg: string): never => {
  throw new StoreError('VALIDATION_ERROR', msg);
};

export function optString(v: unknown, name: string): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') return bad(`${name} must be a string.`);
  return v;
}

export function reqString(v: unknown, name: string): string {
  const s = optString(v, name)?.trim();
  return s ? s : bad(`${name} is required.`);
}

export function optNumber(v: unknown, name: string, min = 0): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < min) return bad(`${name} must be a number >= ${min}.`);
  return n;
}

export function reqNumber(v: unknown, name: string): number {
  return optNumber(v, name) ?? bad(`${name} is required.`);
}

export function optEnum<T extends string>(v: unknown, name: string, allowed: readonly T[]): T | undefined {
  const s = optString(v, name);
  if (s === undefined) return undefined;
  return (allowed as readonly string[]).includes(s) ? (s as T) : bad(`${name} must be one of: ${allowed.join(', ')}.`);
}

export function optDate(v: unknown, name: string): string | undefined {
  const s = optString(v, name);
  if (s === undefined) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : bad(`${name} must be YYYY-MM-DD.`);
}

export function reqDate(v: unknown, name: string): string {
  return optDate(v, name) ?? bad(`${name} is required.`);
}

export function optUuid(v: unknown, name: string): string | undefined {
  const s = optString(v, name);
  if (s === undefined) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : bad(`${name} must be a UUID.`);
}

export function pageParams(query: Record<string, unknown>): { page: number; pageSize: number; from: number; to: number } {
  const page = Math.floor(optNumber(query.page, 'page', 1) ?? 1);
  const pageSize = Math.min(100, Math.floor(optNumber(query.pageSize, 'pageSize', 1) ?? 20));
  const from = (page - 1) * pageSize;
  return { page, pageSize, from, to: from + pageSize - 1 };
}

/** Postgres unique violation (23505) -> true. */
export function isUniqueViolation(err: { code?: string } | null): boolean {
  return err?.code === '23505';
}
