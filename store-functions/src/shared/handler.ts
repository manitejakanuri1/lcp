import type { Request, Response } from 'express';
import { applyCors } from './cors';
import { sendStoreError, StoreError } from './envelope';

type Method = 'GET' | 'POST' | 'PATCH';

interface HandleOptions {
  /** Per-customer responses: tell browsers and shared caches never to store them. */
  private?: boolean;
  /** Public, non-personalised GET: let browsers and a CDN/edge cache the response (seconds). Errors are never cached. */
  cache?: { maxAge?: number; sMaxAge: number; staleWhileRevalidate?: number };
}

/** Wraps an async handler: CORS, method check, and contract error envelope. */
export function handle(
  method: Method | readonly Method[],
  fn: (req: Request, res: Response) => Promise<void>,
  options: HandleOptions = {},
): (req: Request, res: Response) => Promise<void> {
  const allowed: readonly Method[] = typeof method === 'string' ? [method] : method;
  return async (req, res) => {
    if (applyCors(req, res)) return;
    if (options.private) res.set('Cache-Control', 'private, no-store');
    else if (options.cache && req.method === 'GET') {
      const { maxAge = 0, sMaxAge, staleWhileRevalidate = sMaxAge * 2 } = options.cache;
      res.set('Cache-Control', `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`);
    }
    try {
      if (!(allowed as readonly string[]).includes(req.method)) {
        res.set('Allow', allowed.join(', '));
        throw new StoreError('METHOD_NOT_ALLOWED', `Use ${allowed.join(' or ')}.`);
      }
      await fn(req, res);
    } catch (err) {
      sendStoreError(res, err);
    }
  };
}
