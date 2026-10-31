#!/usr/bin/env bash
# Deploy the variant function. Run from anywhere; needs gcloud logged in to the shop's project.
#
#   UPLOAD_BUCKET   private bucket the browser PUTs into   (default lakshmi-sarees-uploads)
#   PHOTO_BUCKET    public bucket the sizes are written to (default lakshmi-sarees-photos)
#
# One-time bucket setup is in README.md; this script only ships the code.
set -euo pipefail
cd "$(dirname "$0")"

UPLOAD_BUCKET="${UPLOAD_BUCKET:-lakshmi-sarees-uploads}"
PHOTO_BUCKET="${PHOTO_BUCKET:-lakshmi-sarees-photos}"
REGION="${REGION:-asia-south1}"

# The function must not drift from the API's idea of where a photo lives, and a deploy only
# uploads this folder, so the one shared file is copied in (and git-ignored) every time.
cp ../../api/image-naming.js ./image-naming.js

gcloud functions deploy make-image-variants \
  --gen2 --runtime=nodejs20 --region="$REGION" \
  --source=. --entry-point=makeImageVariants \
  --trigger-bucket="$UPLOAD_BUCKET" \
  --memory=1GiB --timeout=120s --max-instances=5 \
  --set-env-vars="PHOTO_BUCKET=$PHOTO_BUCKET"
