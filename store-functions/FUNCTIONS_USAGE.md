# Cloud Functions — Storefront Usage Guide

How the Next.js storefront (`sareestorefront/`) should call the functions in this folder.
The endpoint-by-endpoint reference (inputs, outputs, error codes) is in [FUNCTION_MAP.md](FUNCTION_MAP.md); this guide covers **how to call them, what to cache, and what to avoid**.

- Project: `lakshmi-sarees` · Region: `asia-south1` · Runtime: Node 20, 2nd gen (Cloud Run underneath)
- Database: Cloud SQL (`lakshmi-store-db`), reached by the functions through IAM auth. The storefront never talks to the database.

---

## 1. Calling a function

Always go through the shared wrapper `callFunction()` in `sareestorefront/lib/cloud-functions/client.ts`. Do not call `fetch` directly; the wrapper gives you the timeout, the error type and the Next.js cache options.

```ts
import { callFunction } from '@/lib/cloud-functions/client';

const product = await callFunction<Product>('catalog-product-get', {
  query: { slug },              // GET params
  next: { revalidate: 300 },    // server-side cache (see section 3)
});

await callFunction('cart-item-add', {
  method: 'POST',
  body: { productId, variantId, quantity: 1 },
});
```

| Rule | Detail |
|---|---|
| Success | Plain JSON body (no wrapper object). |
| Failure | `{ "error": { "code": "...", "message": "..." } }`. `callFunction` throws a `CloudFunctionError` with `.status`, `.code`, `.message`. |
| Timeout | 15 s in the wrapper; functions time out at 30 s. Show a retry, don't hang the page. |
| Methods | Each function accepts only the methods listed in FUNCTION_MAP; others return 405 `METHOD_NOT_ALLOWED`. |
| Preflight | `OPTIONS` is handled on every function; browser calls need your origin in `ALLOWED_ORIGIN`. |

### Base URL — important

Locally every function lives under one host: `http://localhost:8090/<name>` (`npm run dev`), which is what `callFunction` assumes (`new URL('/<name>', BASE_URL)`).

On GCP each 2nd-gen function has its **own** URL, for example
`https://nav-get-e5uho47kkq-el.a.run.app` (the project-style alias is
`https://asia-south1-lakshmi-sarees.cloudfunctions.net/<name>`).
So **a single `NEXT_PUBLIC_CLOUD_FUNCTIONS_BASE_URL` will not work in production** until one of these is done:

1. **URL map (simplest):** keep a `{ [functionName]: url }` object, populated from `npm run deploy` output (or `gcloud functions list --project lakshmi-sarees --regions asia-south1 --format="table(name.basename(),serviceConfig.uri)"`), and make `callFunction` look the name up instead of joining it to a base.
2. **Single front door (recommended later):** put Firebase Hosting rewrites (or a load balancer) in front so `https://<site>/api/<name>` routes to each function. This also gives you a CDN that honours the `s-maxage` headers below.

Env vars the storefront needs: `NEXT_PUBLIC_CLOUD_FUNCTIONS_BASE_URL` (or the URL map), `NEXT_PUBLIC_SITE_URL`.

---

## 2. Which functions to call from where

| Where | Functions | Notes |
|---|---|---|
| **Server components** (build, ISR, SSR) | `nav-get`, `cms-homepage-get`, `cms-policy-get`, `catalog-*`, `search-products` (if SSR), `wishlist-get` | Use `next: { revalidate }`. Never pass customer tokens in a cached fetch. |
| **Browser / client components** | `catalog-product-price-stock-get`, `cart-*`, `promotion-validate`, `search-products`, `newsletter-subscribe`, `cart-wishlist-merge` | Live data or user actions. Use `cache: 'no-store'`. |
| **Customer-authenticated** (`Authorization: Bearer <accessToken>`) | `account-*`, `addresses-get`, `address-save`, `address-delete`, `orders-list-get`, `order-get`, `cart-wishlist-merge` | Always `cache: 'no-store'`. 401 `UNAUTHENTICATED` → send the user to sign in. |
| **Staff / POS only** | `inventory-*`, `billing-*`, `analytics-*` | Firebase ID token, role-checked server-side. Not used by the public storefront. |

Sign-in: `auth-login` (POST `{ email, password }`) returns `{ accessToken, tokenType, expiresIn, profile }`. Keep the token out of `localStorage` if you can (prefer an httpOnly cookie set by a Next.js route handler) and send it as `Authorization: Bearer …`.

---

## 3. Caching (cost and speed)

Function invocations are cheap (about $0.40 per million, 2M free per month); the real cost is the Cloud SQL instance and its load. Caching public reads protects it. There are two layers:

**Layer 1: Next.js (`next: { revalidate }`).** This is the one that cuts calls to the functions. Current settings in `lib/cloud-functions/`:

| Function | Next.js revalidate |
|---|---|
| `nav-get` | 3600 s |
| `cms-homepage-get` | 300 s |
| `cms-policy-get` | 3600 s |
| `catalog-category-get` | 300 s |
| `catalog-category-products-search` | 60 s |
| `catalog-product-get` | 300 s |
| `catalog-related-products-get` | 300 s |
| `catalog-product-summaries-get` | 120 s |

**Layer 2: HTTP `Cache-Control` headers set by the functions.** These help browsers (`max-age`) and any CDN placed in front (`s-maxage`). The raw Cloud Functions URL has **no shared cache**, so only `max-age` has an effect until a CDN/Hosting front door exists.

| Function | max-age | s-maxage |
|---|---|---|
| `nav-get` | 60 | 600 |
| `cms-homepage-get` | 60 | 300 |
| `cms-policy-get` | 300 | 3600 |
| `catalog-product-get` | 60 | 300 |
| `catalog-category-get` | 60 | 600 |
| `catalog-related-products-get` | 60 | 600 |
| `catalog-category-products-search`, `catalog-product-summaries-get`, `search-products` | 30 | 120 |

Always `stale-while-revalidate` = 2 × `s-maxage`. Error responses are always `Cache-Control: no-store`, so a temporary 404/500 is never cached.

**Never cache:**
- `catalog-product-price-stock-get`: must be live; re-check before add-to-cart (stale stock means overselling).
- `cart-*`, `promotion-validate`, `wishlist-get`, `cart-wishlist-count-get`.
- Everything customer-authenticated (these already send `private, no-store`) and all POST functions.

After a CMS or catalog edit the storefront shows the change within the revalidate window above. To force it sooner, use `revalidateTag`/`revalidatePath` from a route handler.

---

## 4. Error handling

```ts
try {
  const product = await getProduct(slug);
} catch (e) {
  if (e instanceof CloudFunctionError) {
    if (e.status === 404) return notFound();           // PRODUCT_NOT_FOUND etc.
    if (e.status === 401) redirect('/login');          // UNAUTHENTICATED
  }
  throw e;                                             // 500 / timeout → error boundary
}
```

Common storefront codes: `PRODUCT_NOT_FOUND`, `CATEGORY_NOT_FOUND`, `POLICY_NOT_FOUND`, `VARIANT_NOT_FOUND` (404) · `OUT_OF_STOCK` (409) · `VALIDATION_ERROR`, `INVALID_EMAIL`, `INVALID_PHONE`, `INVALID_PINCODE` (400) · `UNAUTHENTICATED`, `INVALID_CREDENTIALS` (401) · `TOO_MANY_REQUESTS` (429) · `INTERNAL_ERROR` (500).
Note `promotion-validate` returns **200 with `valid: false`** for a rejected code; check the flag, not the status.

---

## 5. Limits and behaviours to design around

- **Cart is stateless.** `cart-get`, `cart-validate` and `cart-item-*` price the lines you send; nothing is stored server-side for guests. Keep the cart in the client store. Max **50 lines** per request, quantity per line capped at **10**.
- **Stock is clamped.** `cart-item-add`/`update` return `{ line, clamped }`; if `clamped` is true, tell the user the quantity was reduced.
- **IDs.** Product references in requests may be the slug or the uuid; **variant ids must be uuids**.
- **Cold starts.** Instances scale to zero (max 10), so the first request after idle can take a couple of seconds. This is another reason to cache public reads in Next.js.
- **Pagination** (`catalog-category-products-search`, `orders-list-get`): `page`, `pageSize`; the response includes `pagination`/`total`.
- **Search:** empty `q` returns an empty list; `limit` defaults to 10.

---

## 6. Local development and checking a deployment

```bash
# local: all functions on one port
cd store_functions && npm run dev          # http://localhost:8090/<name>

# smoke test a deployed function and its cache header
curl -si https://<function-url>?slug=<slug> | grep -iE "^HTTP|cache-control"

# logs for a function
gcloud functions logs read <name> --gen2 --region asia-south1 --project lakshmi-sarees --limit 30
```

Deploy: `GCP_PROJECT=lakshmi-sarees ALLOWED_ORIGIN=<origin> npm run deploy [function-name ...]` (see `scripts/deploy.sh`). `ALLOWED_ORIGIN` is a comma-separated CORS allow-list; use the real storefront domain(s) in production, not `*`.
