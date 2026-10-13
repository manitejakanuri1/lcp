// Photos live in Cloud Storage (bucket lakshmi-sarees-photos, asia-south1, public to read).
//
// Every picture is kept twice:
//
//   products/<saree id>/original/<stamp>.jpg   what the phone took, barely touched
//   products/<saree id>/web/<stamp>.webp       1200x1600 WebP, about 100-200 KB
//
// The web copy is what the shop screens and the website show, so a page of forty sarees loads
// on shop mobile data. The original is kept because a squeezed photo cannot be un-squeezed:
// it is there for a tighter crop later, for printing, or for a zoom view. Storage is about
// Rs 2 per GB per month, so a thousand originals cost a few rupees; sending the big file to
// every visitor is what would actually cost money.
//
// Both names share one stamp and the folder tells them apart, so the original of any web photo
// is found by swapping /web/ for /original/ and .webp for .jpg - see originalUrlFor().
import { Storage } from '@google-cloud/storage';
import sharp from 'sharp';

const BUCKET = process.env.PHOTO_BUCKET || 'lakshmi-sarees-photos';
// A vendor's bill carries their GST number and often their bank details, so bill photos live
// in their own bucket with public access switched off at the bucket level, not merely unlinked.
// They are shown through a link that expires; saree photos are meant to be public.
const BILL_BUCKET = process.env.BILL_BUCKET || 'lakshmi-sarees-bills';
const storage = new Storage();
const bucket = () => storage.bucket(BUCKET);
const bills = () => storage.bucket(BILL_BUCKET);

export const publicUrl = (path) => `https://storage.googleapis.com/${BUCKET}/${path}`;

/** The untouched photo behind a web photo's URL, or null if it is not one of ours. */
export function originalUrlFor(webUrl) {
    if (!webUrl || !webUrl.includes(`/${BUCKET}/`) || !webUrl.includes('/web/')) return null;
    return webUrl.replace('/web/', '/original/').replace(/\.webp$/, '.jpg');
}

/**
 * Store one picture under a folder, as both copies, and return the web copy's URL.
 * .rotate() first: a phone writes which way up it was held into the file rather than turning
 * the pixels, and that note is lost on re-encode, so without it half the photos come out
 * sideways.
 */
export async function storePhoto(folder, buffer) {
    const stamp = Date.now();
    const image = sharp(buffer).rotate();

    const [web, original] = await Promise.all([
        image.clone().resize(1200, 1600, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80, effort: 6 }).toBuffer(),
        // Not a straight copy: EXIF rotation is applied so the kept photo is the right way up
        // too, and quality 92 is past the point an eye can tell from the camera's own file.
        image.clone().jpeg({ quality: 92, mozjpeg: true }).toBuffer(),
    ]);

    const webPath = `${folder}/web/${stamp}.webp`;
    await Promise.all([
        bucket().file(webPath).save(web, { contentType: 'image/webp', metadata: { cacheControl: 'public, max-age=31536000' } }),
        bucket().file(`${folder}/original/${stamp}.jpg`).save(original, { contentType: 'image/jpeg', metadata: { cacheControl: 'public, max-age=31536000' } }),
    ]);

    return { url: publicUrl(webPath), stamp };
}

/**
 * Delete every photo in a folder except the one just written.
 * Each upload gets a fresh stamp, so replacing a saree's photo would otherwise leave the old
 * pair in the bucket for ever, paid for and never shown.
 */
export async function sweepFolder(folder, keepStamp = null) {
    const [files] = await bucket().getFiles({ prefix: `${folder}/` });
    const stale = files.filter((f) => !keepStamp || !f.name.includes(`/${keepStamp}.`));
    await Promise.all(stale.map((f) => f.delete().catch(() => {})));
    return stale.length;
}

/** Store a vendor bill as it is - no resizing, the small print has to stay readable. */
export async function storeBill(path, buffer, contentType) {
    await bills().file(path).save(buffer, { contentType, metadata: { cacheControl: 'private, max-age=0' } });
    return path;
}

/** Read one bill back out of the private bucket. */
export async function readBill(path) {
    const file = bills().file(path);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [buffer] = await file.download();
    const [metadata] = await file.getMetadata();
    return { buffer, contentType: metadata.contentType || 'application/octet-stream' };
}

/**
 * Self-check: the two paths of a stored pair must point at each other, because the zoom view
 * finds the original by rewriting the web photo's URL.
 */
export function demo() {
    const web = publicUrl('products/abc/web/123.webp');
    const original = originalUrlFor(web);
    if (original !== publicUrl('products/abc/original/123.jpg')) throw new Error(`bad original path: ${original}`);
    if (originalUrlFor('https://example.com/elsewhere.jpg') !== null) throw new Error('a stranger URL must not be rewritten');
    if (originalUrlFor(null) !== null) throw new Error('no URL must answer null');
    return 'storage paths OK';
}
