/**
 * Where next/image fetches a picture from. Named by `images.loaderFile` in next.config.ts,
 * so it decides the address of every entry in every srcset the app renders.
 *
 * A saree photograph uploaded through the till lands in the public bucket as three files:
 *
 *     img/<kind>/<saree id>/<photo id>/400.webp
 *                                     /800.webp
 *                                     /2000.webp
 *
 * and the database stores the 2000 one. Handing that to the built-in optimizer makes this app
 * download a 2000-wide file and shrink it again for every width a browser asks for - work the
 * bucket has already done, and not always well: the home page's hero came back 290,090 bytes
 * from the optimizer against 264,810 in the bucket, because re-encoding a WebP that is
 * already good makes it worse.
 *
 * Everything else next/image does is unchanged: srcset, sizes, lazy loading, priority and its
 * preload, and the reserved box that stops the page jumping. Only the address changes.
 *
 * The address is the shop's own img.lakshmisarees.in rather than the bucket: a Cloudflare
 * worker in front of the bucket (vast-apollo/gcp/cloudflare/photos-proxy.worker.js) means
 * the photographs are cached on the shop's own plan, and the address stops naming a supplier
 * the shop may one day leave. The bucket's address keeps working either way.
 */

/** The shop's own name for the photo bucket. */
const PHOTO_HOST = 'https://img.lakshmisarees.in';

/** What the till writes. 2000 is the largest, so it is also the fallback. */
const READY_WIDTHS = [400, 800, 2000];

/** .../img/<kind>/<owner>/<photo>/<width>.webp - anything else is not one of ours. */
const READY = /\/(img\/[a-z]+\/[0-9a-f-]{36}\/[0-9a-f-]{36})\/\d+\.webp$/i;

export default function readyVariantLoader({ src, width }: { src: string; width: number; quality?: number }): string {
    const match = READY.exec(src);
    // A photograph from before the variants existed, the seeded banner and category artwork,
    // and anything served from this app (the logo) have no sizes to choose between, so the
    // address is handed back as it came.
    if (!match) return src;
    return `${PHOTO_HOST}/${match[1]}/${READY_WIDTHS.find((w) => w >= width) ?? 2000}.webp`;
}
