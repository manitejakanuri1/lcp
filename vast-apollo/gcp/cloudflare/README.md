# inventory.lakshmisarees.in

The shop is one Cloud Run service, `pos-api` in asia-south1, which serves both the API and
the screens. Its own address is `pos-api-1015935854351.asia-south1.run.app`.

Cloud Run routes by the Host header and answers only to that name, so a plain CNAME from
`inventory.lakshmisarees.in` returns 404. The usual fix - Origin Rules "Override Host header" -
is Enterprise-only, and this zone is on the Free plan. A Worker does the same job for nothing:
`inventory-proxy.worker.js` rewrites the request URL to the run.app host (Cloudflare sets the
Host header from the URL), streams the body so 25 MB bill photos pass through, and rewrites any
redirect that names the run.app host back to the public one so the login cookie is never lost.

## How it is wired

| Piece | Value |
|---|---|
| Zone | `lakshmisarees.in` (Free, zone id `3c03b1cfbcb9bba8548805da01d7d51a`) |
| Worker | `lakshmi-pos-proxy` |
| Binding | Workers Custom Domain for `inventory.lakshmisarees.in` (it creates the proxied AAAA `100::` record and the certificate) |
| SSL | Full (strict), Always Use HTTPS on, minimum TLS 1.2 |

Two CNAMEs pointing at a deleted Cloudflare Tunnel (`5cc2f6ee-...cfargotunnel.com`) were
removed first - `inventory` and `supabase` - which is what had been answering error 1033.

## To change the worker

Edit the file here, then upload it:

    curl -X PUT "https://api.cloudflare.com/client/v4/accounts/<account>/workers/scripts/lakshmi-pos-proxy" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -F 'metadata={"main_module":"inventory-proxy.worker.js","compatibility_date":"2026-09-01"};type=application/json' \
      -F "inventory-proxy.worker.js=@gcp/cloudflare/inventory-proxy.worker.js;type=application/javascript+module"

## Known untidiness

Cloudflare Web Analytics has auto-install on for this zone, so it injects
`static.cloudflareinsights.com/beacon.min.js` into every HTML response. The app's own
Content-Security-Policy (`script-src 'self'`, from helmet) blocks it, so it never runs - the
only effect is one console error per page load. Switching it off needs
Analytics & Logs -> Web Analytics -> disable automatic setup for the site; the API token used
here does not carry that permission.
