# image-variants

Browser → signed PUT → **private upload bucket** → this function → **public photo bucket**.
Design and reasoning: [docs/image_processing_req](../../docs/image_processing_req).

| Piece | Name |
|---|---|
| Upload bucket (private) | `lakshmi-sarees-uploads` — objects `<kind>/<owner>/<image>.webp` |
| Public bucket | `lakshmi-sarees-photos` — objects `img/<kind>/<owner>/<image>/{400,800,2000}.webp` |
| Function | `make-image-variants`, gen2, Node 20, asia-south1 |

## One-time setup (not yet run)

```bash
PROJECT=<gcp project>; SA=<pos-api service account email>

# 1. private bucket: no public access, uniform access control
gcloud storage buckets create gs://lakshmi-sarees-uploads --location=asia-south1 \
  --uniform-bucket-level-access --public-access-prevention

# 2. let the browser PUT from the shop's origin
cat > cors.json <<'JSON'
[{"origin":["https://inventory.lakshmisarees.in"],"method":["PUT"],
  "responseHeader":["Content-Type","x-goog-content-length-range"],"maxAgeSeconds":3600}]
JSON
gcloud storage buckets update gs://lakshmi-sarees-uploads --cors-file=cors.json

# 3. backstop: an upload that can never be processed is deleted after a day
cat > lifecycle.json <<'JSON'
{"rule":[{"action":{"type":"Delete"},"condition":{"age":1}}]}
JSON
gcloud storage buckets update gs://lakshmi-sarees-uploads --lifecycle-file=lifecycle.json

# 4. the API signs URLs as itself (keyless, via IAM signBlob) ...
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --member="serviceAccount:$SA" --role=roles/iam.serviceAccountTokenCreator
#    ... and reads/deletes in both buckets
gcloud storage buckets add-iam-policy-binding gs://lakshmi-sarees-uploads \
  --member="serviceAccount:$SA" --role=roles/storage.objectAdmin
gcloud storage buckets add-iam-policy-binding gs://lakshmi-sarees-photos \
  --member="serviceAccount:$SA" --role=roles/storage.objectAdmin

# 5. database: gcp/migrations/09-images.sql
# 6. deploy the function (grants itself the Eventarc roles on first deploy; follow its prompts)
./deploy.sh
```

Set `UPLOAD_BUCKET` on the `pos-api` Cloud Run service if the name differs.

## Behaviour worth knowing
- Delivery is at-least-once; outputs are named by the photo id, so a repeat is harmless.
- The API treats a photo as ready only when all three sizes exist, and as failed three minutes after the handshake if they still don't.
- A local run can't sign URLs with user credentials; test the handshake against a deployed service or use a service-account key.
