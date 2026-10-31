// Photos live in Cloud Storage (bucket lakshmi-sarees-photos, asia-south1, public to read).
//
// Every picture is kept twice:
//
//   products/<saree id>/original/<stamp>.jpg   what the phone took, barely touched
//   products/<saree id>/web/<stamp>.webp       up to 2400x3200 WebP, a few hundred KB
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
import {
    LARGEST_WIDTH, UPLOAD_MAX_BYTES, UPLOAD_MIME, VARIANT_WIDTHS, isUuid, uploadPath, variantFolder, variantPath,
} from './image-naming.js';

const BUCKET = process.env.PHOTO_BUCKET || 'lakshmi-sarees-photos';
// A vendor's bill carries their GST number and often their bank details, so bill photos live
// in their own bucket with public access switched off at the bucket level, not merely unlinked.
// They are shown through a link that expires; saree photos are meant to be public.
const BILL_BUCKET = process.env.BILL_BUCKET || 'lakshmi-sarees-bills';
// Photos the browser uploads directly arrive here first, in a bucket with public access off,
// because nothing in it has been checked yet. The variant function reads from here and writes
// the public sizes to BUCKET, then the raw file is deleted.
const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || 'lakshmi-sarees-uploads';
const storage = new Storage();
const bucket = () => storage.bucket(BUCKET);
const bills = () => storage.bucket(BILL_BUCKET);
const uploads = () => storage.bucket(UPLOAD_BUCKET);

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
        // 2400 on the long side, not 1200: a saree is looked at closely for its weave and its
        // zari, and a phone camera gives 3000 or more, so the old ceiling threw away detail
        // the shop had already captured. withoutEnlargement keeps a small picture small -
        // the sarees taken from vendor colour sheets stay 1200 and nothing is stretched.
        image.clone().resize(2400, 3200, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 88, effort: 6 }).toBuffer(),
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

/**
 * Delete the pair behind one web photo URL.
 * Used where a folder holds more than one picture - every colour of a saree shares a folder -
 * so sweeping it would take the other colours' photos with it.
 */
export async function deletePhotoPair(webUrl) {
    const marker = `/${BUCKET}/`;
    const at = webUrl?.indexOf(marker) ?? -1;
    if (at < 0) return false;
    const webPath = webUrl.slice(at + marker.length);
    const originalPath = webPath.replace('/web/', '/original/').replace(/\.webp$/, '.jpg');
    await Promise.all([
        bucket().file(webPath).delete().catch(() => {}),
        bucket().file(originalPath).delete().catch(() => {}),
    ]);
    return true;
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

// ---- Direct-to-storage uploads (docs/image_processing_req) --------------------------------

const SIGNED_URL_MINUTES = 10;

/**
 * A short-lived URL the browser PUTs one WebP to. Content type and size range are part of the
 * signature, so a different type, or a file past the cap, is refused by storage itself.
 */
export async function signedUploadUrl(parts) {
    const expires = Date.now() + SIGNED_URL_MINUTES * 60_000;
    const headers = { 'x-goog-content-length-range': `1,${UPLOAD_MAX_BYTES}` };
    const [url] = await uploads().file(uploadPath(parts)).getSignedUrl({
        version: 'v4',
        action: 'write',
        expires,
        contentType: UPLOAD_MIME,
        extensionHeaders: headers,
    });
    return { url, headers: { 'Content-Type': UPLOAD_MIME, ...headers }, expiresAt: new Date(expires).toISOString() };
}

export const variantPublicUrl = (parts, width = LARGEST_WIDTH) => publicUrl(variantPath(parts, width));

/** True once the variant function has written every size. */
export async function variantsReady(parts) {
    const checks = await Promise.all(VARIANT_WIDTHS.map((w) => bucket().file(variantPath(parts, w)).exists().then(([e]) => e)));
    return checks.every(Boolean);
}

/** Has the browser's PUT landed yet (so the function can be expected to run)? */
export async function rawUploaded(parts) {
    const [exists] = await uploads().file(uploadPath(parts)).exists();
    return exists;
}

/** Remove every size of one photo, plus its upload if the function has not cleared it yet. */
export async function deleteImage(parts) {
    const [files] = await bucket().getFiles({ prefix: `${variantFolder(parts)}/` });
    await Promise.all([
        ...files.map((f) => f.delete().catch(() => {})),
        uploads().file(uploadPath(parts)).delete().catch(() => {}),
    ]);
}

/** Everything uploaded directly for one saree: its own photos and every colour's. */
export async function deleteOwnerImages(ownerId) {
    for (const kind of ['product', 'colour']) {
        const [files] = await bucket().getFiles({ prefix: `img/${kind}/${ownerId}/` });
        await Promise.all(files.map((f) => f.delete().catch(() => {})));
    }
}

/** The photo parts behind a stored image_url in the new layout, or null for a legacy URL. */
export function partsFromStoredUrl(storedUrl) {
    const marker = `/${BUCKET}/img/`;
    const at = storedUrl?.indexOf(marker) ?? -1;
    if (at < 0) return null;
    const m = new RegExp(`^([a-z]+)/([0-9a-f-]{36})/([0-9a-f-]{36})/${LARGEST_WIDTH}\.webp$`, 'i')
        .exec(storedUrl.slice(at + marker.length));
    if (!m || !isUuid(m[2]) || !isUuid(m[3])) return null;
    return { kind: m[1], ownerId: m[2], imageId: m[3] };
}

/** Delete whatever is behind a stored photo URL, in either the old or the new layout. */
export async function deleteStoredPhoto(storedUrl) {
    const parts = partsFromStoredUrl(storedUrl);
    if (parts) return deleteImage(parts).then(() => true);
    return deletePhotoPair(storedUrl);
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
    const parts = { kind: 'colour', ownerId: '11111111-1111-4111-8111-111111111111', imageId: '22222222-2222-4222-8222-222222222222' };
    const back = partsFromStoredUrl(variantPublicUrl(parts));
    if (!back || back.imageId !== parts.imageId || back.kind !== 'colour') throw new Error('new-layout URL did not round-trip');
    if (partsFromStoredUrl(web) !== null) throw new Error('a legacy URL must not parse as the new layout');
    return 'storage paths OK';
}
