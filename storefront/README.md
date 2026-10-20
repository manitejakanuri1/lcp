# sareestorefront

Next.js (App Router) storefront for Lakshmi Sarees. See
[design_docs/high level](../design_docs/high%20level) and
[design_docs/tech_req](../design_docs/tech_req) for the target architecture — this
app never talks to a database/CMS/catalog directly; all dynamic data comes from the
cloud functions in [../store_functions](../store_functions).

## Scope (Phase 1 — browse)
This pass implements Build-Sequencing Phase 1 only: Home (`/`), Collections
(`/collections/[slug]`), Product (`/product/[slug]`), and Policies
(`/policies/[slug]`). No auth, cart, wishlist, or orders yet — the header's cart/
wishlist icons are inert placeholders until Phase 2.

## Getting started
1. In `../store_functions`, run `npm install && npm run dev` (serves the mock cloud
   functions on `http://localhost:8090`).
2. In this directory, copy `.env.local.example` to `.env.local` (defaults already
   point at that local dev-server).
3. `npm install && npm run dev`, then open `http://localhost:3000`.

## Structure
- `app/` — routes. `layout.tsx` fetches shared nav data; `page.tsx` is the SDUI
  homepage (SSR); `collections/[slug]`, `product/[slug]`, `policies/[slug]` are
  SSG/ISR.
- `components/` — `Header`/`Footer` (shell), `components/sections/*` (one per SDUI
  homepage block type, dispatched by `SectionRenderer`), product/collection/PDP UI.
- `lib/cloud-functions/` — one typed wrapper per cloud function call, all going
  through the shared `callFunction` helper in `client.ts` (JSON envelope, `{ error }`
  shape per tech_req §2.4).
- `lib/types.ts` — TS types mirroring the cloud functions' contract shapes.
