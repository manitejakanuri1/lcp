import type { Request, Response } from 'express';

/**
 * Each handler applies this itself (rather than relying on shared middleware) because in
 * production each function is deployed standalone (tech_req §2.4).
 *
 * ALLOWED_ORIGIN is a comma-separated allow-list (e.g. "https://lakshmisarees.com,https://www.lakshmisarees.com").
 * Fail closed: outside local development an unset list allows NO cross-origin browser calls
 * (server-to-server calls, e.g. Next.js route handlers, are unaffected by CORS).
 * Local development (NODE_ENV !== 'production') falls back to "*" so `npm run dev` just works.
 */
const allowList = (): string[] =>
  (process.env.ALLOWED_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

export function applyCors(req: Request, res: Response): boolean {
  const origins = allowList();
  const origin = req.get('origin');

  res.set('Vary', 'Origin');
  if (origins.length === 0) {
    if (process.env.NODE_ENV !== 'production') res.set('Access-Control-Allow-Origin', '*');
  } else if (origins.includes('*')) {
    res.set('Access-Control-Allow-Origin', '*');
  } else if (origin && origins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Max-Age', '3600');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  return false;
}
