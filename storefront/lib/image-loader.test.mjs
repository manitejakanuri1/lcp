// node storefront/lib/images.test.mjs
// The regex and the width choice are the whole of this file's behaviour, and a wrong pick is
// invisible: the page still shows a photograph, just the wrong-sized one.
import assert from 'node:assert/strict';

const READY_WIDTHS = [400, 800, 2000];
const READY = /\/(img\/[a-z]+\/[0-9a-f-]{36}\/[0-9a-f-]{36})\/\d+\.webp$/i;
const PHOTO_HOST = 'https://img.lakshmisarees.in';
const loader = ({ src, width }) => {
    const m = READY.exec(src);
    if (!m) return src;
    return `${PHOTO_HOST}/${m[1]}/${READY_WIDTHS.find((w) => w >= width) ?? 2000}.webp`;
};

// What the database stores, and what the loader must turn it into.
const stored = 'https://storage.googleapis.com/lakshmi-sarees-photos/img/product/'
    + '12efaac0-f12e-4176-a521-9486ea51eccd/38f750f8-ee98-4ca1-a31f-fbd345285b41';
const base = 'https://img.lakshmisarees.in/img/product/'
    + '12efaac0-f12e-4176-a521-9486ea51eccd/38f750f8-ee98-4ca1-a31f-fbd345285b41';
const ready = `${stored}/2000.webp`;

assert.equal(loader({ src: ready, width: 220 }), `${base}/400.webp`);
assert.equal(loader({ src: ready, width: 400 }), `${base}/400.webp`);
assert.equal(loader({ src: ready, width: 401 }), `${base}/800.webp`);
assert.equal(loader({ src: ready, width: 1200 }), `${base}/2000.webp`);
// Nothing wider exists; asking for 3840 must not produce a 404.
assert.equal(loader({ src: ready, width: 3840 }), `${base}/2000.webp`);
// A colour photograph is the same shape with a different kind.
assert.ok(READY.test(ready.replace('/product/', '/colour/')));
// An address already on the shop's own host must not gain a second one.
assert.equal(loader({ src: `${base}/2000.webp`, width: 400 }), `${base}/400.webp`);

// Left alone: photographs from before the variants, and the seeded artwork.
const old = 'https://storage.googleapis.com/lakshmi-sarees-photos/products/'
    + 'eb156ba8-e4db-4271-8947-9acdd4b0c140/web/1792500141743.webp';
assert.equal(loader({ src: old, width: 400 }), old);
assert.equal(loader({ src: '/logo.png', width: 96 }), '/logo.png');
assert.equal(loader({ src: 'https://picsum.photos/800/1200', width: 800 }), 'https://picsum.photos/800/1200');

console.log('images: all checks passed');
