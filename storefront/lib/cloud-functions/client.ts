import { clearAccessToken, getAccessToken } from './session';

const BASE_URL = process.env.NEXT_PUBLIC_CLOUD_FUNCTIONS_BASE_URL ?? 'http://localhost:8090';

/**
 * On GCP every 2nd-gen function has its own URL, so production sets
 * NEXT_PUBLIC_CLOUD_FUNCTION_URLS to a JSON map `{ "nav-get": "https://nav-get-xxxx.a.run.app", ... }`
 * (from `npm run deploy` output). Names missing from the map, and local dev, use BASE_URL/<name>.
 */
function parseUrlMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    console.error('NEXT_PUBLIC_CLOUD_FUNCTION_URLS is not valid JSON; falling back to the base URL.');
    return {};
  }
}
const FUNCTION_URLS = parseUrlMap(process.env.NEXT_PUBLIC_CLOUD_FUNCTION_URLS);

function resolveUrl(name: string): URL {
  const mapped = FUNCTION_URLS[name];
  return mapped ? new URL(mapped) : new URL(`/${name}`, BASE_URL);
}

export class CloudFunctionError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** A hung function must not hang the page: fail after this long so the UI can offer a retry. */
const REQUEST_TIMEOUT_MS = 15_000;

interface CallOptions {
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Server-side only: Next.js fetch cache config (revalidate seconds / tags). Ignored by the browser. */
  next?: NextFetchRequestConfig;
  cache?: RequestCache;
  /** Customer-authenticated call: sends `Authorization: Bearer <token>` and is never cached. */
  auth?: boolean;
}

/**
 * Shared fetch wrapper for calling a cloud function by name (tech_req §2.4: JSON
 * envelope, `{ error: { code, message } }` on failure). Works from both server
 * components (build/revalidation/SSR) and client components — the base URL is a
 * NEXT_PUBLIC_ var since some calls (search, filters, price/stock) happen in-browser.
 */
export async function callFunction<T>(name: string, options: CallOptions = {}): Promise<T> {
  const url = resolveUrl(name);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (options.body) headers['Content-Type'] = 'application/json';
  if (options.auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // Only reads with an explicit `next` config are cacheable; mutations and per-customer calls never are.
  const cache = options.cache ?? (options.auth || method !== 'GET' || !options.next ? 'no-store' : undefined);

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache,
    next: cache === 'no-store' ? undefined : options.next,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && options.auth) clearAccessToken();
    const errorBody = json as { error?: { code: string; message: string } } | null;
    throw new CloudFunctionError(
      response.status,
      errorBody?.error?.code ?? 'UNKNOWN',
      errorBody?.error?.message ?? `${name} request failed with status ${response.status}`,
    );
  }

  return json as T;
}
