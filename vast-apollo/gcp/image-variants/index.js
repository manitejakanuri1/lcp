// Makes the sizes of a freshly uploaded photo.
//
// Fires when the browser's PUT finishes (Cloud Storage "finalized" event, delivered through
// Eventarc/Pub/Sub). Reads the small WebP the browser sent from the private upload bucket,
// writes 400/800/2000-wide WebPs to the public bucket, then deletes the upload.
//
// Safe to run twice: Pub/Sub delivers at least once, and every output name is fixed by the
// photo's id, so a repeat overwrites the same files with the same bytes. The API decides a
// photo is ready by checking that all three exist (api/storage.js variantsReady), so this
// function needs no database access and no credentials beyond the two buckets.
import functions from '@google-cloud/functions-framework';
import { Storage } from '@google-cloud/storage';
import sharp from 'sharp';
import { VARIANT_WIDTHS, parseUploadPath, variantPath } from './image-naming.js';

const PUBLIC_BUCKET = process.env.PHOTO_BUCKET || 'lakshmi-sarees-photos';
const storage = new Storage();

// Variants are named by content-independent ids, so they can be cached for ever.
const CACHE = 'public, max-age=31536000, immutable';

functions.cloudEvent('makeImageVariants', async (event) => {
    const { bucket: uploadBucket, name } = event.data;

    const parts = parseUploadPath(name);
    if (!parts) {
        // Anything else in the bucket (a stray manual upload) is not ours to process.
        console.warn('Ignoring object with an unexpected name', { name });
        return;
    }

    const source = storage.bucket(uploadBucket).file(name);
    const [raw] = await source.download();

    // Each width is made from the same decoded input. withoutEnlargement keeps a small photo
    // small: the vendor colour sheets are 1200 wide and must not be stretched to 2000. A width
    // that equals the source is still written, because the API waits for all three names.
    await Promise.all(VARIANT_WIDTHS.map(async (width) => {
        const buffer = await sharp(raw)
            .rotate()
            .resize({ width, withoutEnlargement: true })
            .webp({ quality: width >= 2000 ? 88 : 82, effort: 5 })
            .toBuffer();
        await storage.bucket(PUBLIC_BUCKET).file(variantPath(parts, width)).save(buffer, {
            contentType: 'image/webp',
            metadata: { cacheControl: CACHE },
        });
    }));

    // Only after every size is written; if any failed we threw above and Pub/Sub retries, with
    // the upload still there to retry from. The bucket's lifecycle rule is the backstop for
    // an upload that can never be processed (see README).
    await source.delete().catch((err) => console.warn('Could not delete the upload', { name, err: err.message }));
    console.log('Variants written', { ...parts, widths: VARIANT_WIDTHS });
});
