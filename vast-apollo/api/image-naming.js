// Where a photo lives, as a pure function of what it is for.
//
//   upload bucket (private)   <kind>/<owner id>/<image id>.webp
//   public bucket             img/<kind>/<owner id>/<image id>/<width>.webp     (400, 800, 2000)
//
// The image id is minted by the API at handshake time, never taken from the browser, so a
// client cannot choose a path, collide with another photo or smuggle a file name in. One folder
// per photo means removing a photo is one prefix delete, however many colours share an owner.
//
// The database stores the largest size's URL in image_url, so every screen that already shows
// image_url as an <img src> keeps working; variantUrl() derives the smaller sizes from it.
import { randomUUID } from 'node:crypto';

export const IMAGE_KINDS = ['product', 'colour', 'category', 'cms'];
export const VARIANT_WIDTHS = [400, 800, 2000];
export const LARGEST_WIDTH = VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1];

// What the browser is allowed to send. It has already turned the photo into a <1 MB WebP, so
// 2 MB is generous; anything bigger is a client that skipped the shrink step.
export const UPLOAD_MIME = 'image/webp';
export const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => typeof value === 'string' && UUID.test(value);

export const newImageId = () => randomUUID();

/** Object name in the private upload bucket. */
export function uploadPath({ kind, ownerId, imageId }) {
    assertParts(kind, ownerId, imageId);
    return `${kind}/${ownerId}/${imageId}.webp`;
}

/** Folder in the public bucket holding all sizes of one photo (no trailing slash). */
export function variantFolder({ kind, ownerId, imageId }) {
    assertParts(kind, ownerId, imageId);
    return `img/${kind}/${ownerId}/${imageId}`;
}

export const variantPath = (parts, width) => {
    if (!VARIANT_WIDTHS.includes(width)) throw new Error(`No ${width}px variant`);
    return `${variantFolder(parts)}/${width}.webp`;
};

/**
 * Pull the parts back out of an object name (either bucket's layout) - used by the variant
 * function, which only receives the name of the file that landed.
 */
export function parseUploadPath(name) {
    const m = /^([a-z]+)\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.webp$/i.exec(name || '');
    if (!m || !IMAGE_KINDS.includes(m[1]) || !isUuid(m[2]) || !isUuid(m[3])) return null;
    return { kind: m[1], ownerId: m[2], imageId: m[3] };
}

/** The same photo at another size, from the stored (largest) URL. Null if it is not ours. */
export function variantUrl(storedUrl, width) {
    if (!storedUrl || !new RegExp(`/${LARGEST_WIDTH}\\.webp$`).test(storedUrl) || !storedUrl.includes('/img/')) {
        return null;
    }
    return storedUrl.replace(new RegExp(`/${LARGEST_WIDTH}\\.webp$`), `/${width}.webp`);
}

function assertParts(kind, ownerId, imageId) {
    if (!IMAGE_KINDS.includes(kind)) throw new Error(`Unknown image kind "${kind}"`);
    if (!isUuid(ownerId)) throw new Error('Owner id must be a UUID');
    if (!isUuid(imageId)) throw new Error('Image id must be a UUID');
}

/** Self-check, in the style of storage.js's demo(). */
export function demo() {
    const parts = { kind: 'product', ownerId: '11111111-1111-4111-8111-111111111111', imageId: '22222222-2222-4222-8222-222222222222' };
    const stored = `https://storage.googleapis.com/b/${variantPath(parts, LARGEST_WIDTH)}`;
    if (variantUrl(stored, 400) !== `https://storage.googleapis.com/b/${variantPath(parts, 400)}`) throw new Error('variantUrl broke');
    if (variantUrl('https://storage.googleapis.com/b/products/x/web/1.webp', 400) !== null) throw new Error('legacy URL must not be rewritten');
    const round = parseUploadPath(uploadPath(parts));
    if (!round || round.imageId !== parts.imageId) throw new Error('parseUploadPath does not invert uploadPath');
    if (parseUploadPath('product/../../etc/passwd.webp') !== null) throw new Error('traversal must not parse');
    return 'image naming OK';
}
