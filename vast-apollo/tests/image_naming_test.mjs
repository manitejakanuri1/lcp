// Pure checks for the direct-upload naming rules and the variant sizing. No network, no
// database: run with `node tests/image_naming_test.mjs`.
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
    LARGEST_WIDTH, VARIANT_WIDTHS, demo, isUuid, parseUploadPath, uploadPath, variantPath, variantUrl,
} from '../api/image-naming.js';
import { demo as storageDemo } from '../api/storage.js';

const parts = { kind: 'colour', ownerId: '11111111-1111-4111-8111-111111111111', imageId: '22222222-2222-4222-8222-222222222222' };

assert.equal(demo(), 'image naming OK');
assert.equal(storageDemo(), 'storage paths OK');

// layout is the documented one
assert.equal(uploadPath(parts), `colour/${parts.ownerId}/${parts.imageId}.webp`);
assert.equal(variantPath(parts, 800), `img/colour/${parts.ownerId}/${parts.imageId}/800.webp`);
assert.deepEqual(VARIANT_WIDTHS, [400, 800, 2000]);
assert.equal(LARGEST_WIDTH, 2000);

// nothing but real ids may build a path
assert.throws(() => uploadPath({ ...parts, ownerId: '../x' }));
assert.throws(() => uploadPath({ ...parts, kind: 'nope' }));
assert.throws(() => variantPath(parts, 999));
assert.equal(parseUploadPath(`colour/${parts.ownerId}/${parts.imageId}.jpg`), null);
assert.equal(isUuid('not-a-uuid'), false);
assert.equal(variantUrl(null, 400), null);

// the variant recipe: a 3000x4000 source gives 400/800/2000 wide; a 1200 source is never stretched
for (const [source, expected] of [[3000, [400, 800, 2000]], [1200, [400, 800, 1200]]]) {
    const input = await sharp({ create: { width: source, height: Math.round(source * 4 / 3), channels: 3, background: '#a33' } }).webp().toBuffer();
    const got = [];
    for (const w of VARIANT_WIDTHS) {
        const out = await sharp(input).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
        got.push((await sharp(out).metadata()).width);
    }
    assert.deepEqual(got, expected, `source ${source}`);
}
console.log('image naming + variant sizing: all checks passed');
