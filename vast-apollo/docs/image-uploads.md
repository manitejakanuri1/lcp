# Photo uploads: how a photo gets from a phone to the website

Requirement: [image_processing_req](image_processing_req). Decisions taken 31 Oct 2026:
stay on Google Cloud Storage (not R2/S3); the browser-shrunk file is the master, so the
untouched JPG original is no longer kept for new photos; WebP only (no AVIF yet).

```
phone ──shrink (Web Worker, ≤2500px WebP <1MB)──▶ POST /api/images/upload-url
      ◀── signed PUT URL, imageId ───────────────────────┘ (row in pos.images, status pending)
      ──PUT──▶ gs://lakshmi-sarees-uploads/<kind>/<owner>/<image>.webp        (private)
                    │ object finalized → Eventarc/Pub/Sub
                    ▼
              gcp/image-variants  ──▶ gs://lakshmi-sarees-photos/img/<kind>/<owner>/<image>/{400,800,2000}.webp
      ──poll GET /api/images/:id until ready──▶ save route with image_id
              (PUT /api/products/:id/photo, or image_id on the colour routes)
```

## Naming

| What | Path |
|---|---|
| Upload (private) | `<kind>/<owner id>/<image id>.webp` |
| Public sizes | `img/<kind>/<owner id>/<image id>/<400\|800\|2000>.webp` |
| `image_url` in the DB | the **2000** URL, so existing `<img src>` uses keep working |

`kind` is `product` or `colour` (a colour's owner is its **saree**, since the colour row may not
exist yet). The image id is minted by the API, never by the browser. Smaller sizes:
`variantUrl(image_url, 400)` in `api/image-naming.js`. Legacy photos
(`products/<id>/web/<stamp>.webp`) are untouched and still cleaned up by the old code paths.

## Why the API trusts an `image_id`

The save routes accept an `image_id`, not a URL. The API looks the row up and refuses unless it
was issued for **this** kind and owner, is still `pending`, and all three sizes exist. A
staff member therefore cannot attach someone else's photo, reuse one, or point a saree at an
arbitrary address.

## Switching it on

Nothing changes for staff until all of these are done, in order:

1. Run `gcp/migrations/09-images.sql`.
2. Create the bucket, CORS, lifecycle and IAM from `gcp/image-variants/README.md`, then deploy
   the function (`gcp/image-variants/deploy.sh`).
3. Redeploy `pos-api` (set `UPLOAD_BUCKET` if the name differs).
4. Build the screens with `VITE_DIRECT_UPLOADS=true`. Without it every upload keeps using the
   multipart routes, so the two paths can be compared and rolled back by rebuilding.

## Not done yet
- Backfill of existing photos into the new layout (not required; old URLs keep working).
- Category and CMS photos (`kind` exists in the naming, but no POS owner row to attach to).
- Storefront `srcset` using the 400/800 sizes — it still shows `image_url` (the 2000 size).
- Deleting `multer` photo routes once the new path has run in production for a while.
- `pos.images` rows left `pending` after an abandoned upload are not swept; the bucket
  lifecycle clears the file, the row is harmless.
