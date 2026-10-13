// Batch 5 proof: saree photos in Cloud Storage, bills in their own private bucket.
// Runs against the real buckets and the real database, and cleans both up afterwards.
import jwt from 'jsonwebtoken';
import pg from 'pg';
import sharp from 'sharp';
import { Storage } from '@google-cloud/storage';
import { storeBill, readBill, originalUrlFor, demo } from '../api/storage.js';

const BASE = process.env.BASE || 'http://127.0.0.1:3099';
const SECRET = process.env.JWT_SECRET;
const FOUNDER_ID = '00000000-0000-0000-0000-000000000001';
const SALES_ID = '00000000-0000-0000-0000-000000000002';
const founder = jwt.sign({ id: FOUNDER_ID, username: 'zzb5founder', role: 'founder' }, SECRET, { expiresIn: '10m' });
const salesman = jwt.sign({ id: SALES_ID, username: 'zzb5sales', role: 'salesman' }, SECRET, { expiresIn: '10m' });

const PHOTO_BUCKET = process.env.PHOTO_BUCKET || 'lakshmi-sarees-photos';
const BILL_BUCKET = process.env.BILL_BUCKET || 'lakshmi-sarees-bills';
const storage = new Storage();

const db = new pg.Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5433),
    user: process.env.DB_USER || 'schema_admin',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'lakshmi',
});

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + String(detail).slice(0, 220) : ''}`);
    ok ? pass++ : fail++;
};

async function call(method, path, { token = founder, body, file } = {}) {
    let payload;
    const headers = { Authorization: `Bearer ${token}` };
    if (file) {
        const form = new FormData();
        form.append('photo', new Blob([file.buffer], { type: file.type }), file.name);
        payload = form;
    } else if (body) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }
    const res = await fetch(BASE + path, { method, headers, body: payload });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* keep the text */ }
    return { status: res.status, json, text };
}

const listFolder = async (prefix) => {
    const [files] = await storage.bucket(PHOTO_BUCKET).getFiles({ prefix });
    return files.map((f) => f.name);
};

// A photo that is bigger than the web size and carries an EXIF "rotate 90" note, so the
// resize and the rotation both have something to do.
const sourcePhoto = await sharp({ create: { width: 2400, height: 3200, channels: 3, background: { r: 180, g: 30, b: 60 } } })
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 95 })
    .toBuffer();

check('storage path self-check', demo() === 'storage paths OK', demo());

await db.query(
    `insert into store.staff_users (id, provider, provider_uid, email, username, full_name, role, is_active, created_at, updated_at)
     values ($1,'firebase','zzb5-founder','zzb5-founder@example.invalid','zzb5founder','ZZ B5 Founder','founder',true,now(),now()),
            ($2,'firebase','zzb5-sales','zzb5-sales@example.invalid','zzb5sales','ZZ B5 Salesman','salesman',true,now(),now())
     on conflict (id) do nothing`,
    [FOUNDER_ID, SALES_ID],
);

const saree = await call('POST', '/api/products', {
    body: {
        sku: 'ZZB5-1', saree_name: 'ZZ Photo Saree', saree_type: 'Silk', material: 'Cotton', color: 'Red',
        quantity: 3, vendor_name: 'ZZ B5', purchase_date: '2026-10-13', cost_price: 400,
        selling_price: 900, selling_price_a: 900, status: 'available',
    },
});
check('test saree created', saree.status === 201, saree.status);
const id = saree.json?.id;

// ---- uploading a saree photo ---------------------------------------------------------
const upload = await call('POST', `/api/products/${id}/photo`, { file: { buffer: sourcePhoto, type: 'image/jpeg', name: 'zz.jpg' } });
check('photo uploaded', upload.status === 200 && !!upload.json?.image_url, `${upload.status} ${upload.json?.error || upload.json?.image_url}`);

const webUrl = upload.json?.image_url;
const files = await listFolder(`products/${id}/`);
check('both copies are kept - one web, one original', files.filter((f) => f.includes('/web/')).length === 1 && files.filter((f) => f.includes('/original/')).length === 1, files.join(', '));

const saved = await db.query('select image_url from pos.products where id = $1', [id]);
check('the saree row points at the web copy', saved.rows[0].image_url === webUrl, saved.rows[0].image_url);

const fetched = await fetch(webUrl);
const webBytes = Buffer.from(await fetched.arrayBuffer());
const webMeta = await sharp(webBytes).metadata();
check('anyone can open the web photo (the website needs that)', fetched.ok && fetched.headers.get('content-type') === 'image/webp', `${fetched.status} ${fetched.headers.get('content-type')}`);
// After the EXIF turn this photo is landscape, so it is the 1200 side that binds; a portrait
// saree photo comes out 1200x1600. Either way it must fit inside the box and have been shrunk.
check('the web copy is shrunk to fit inside 1200x1600', webMeta.width <= 1200 && webMeta.height <= 1600 && webMeta.width < 3200, `${webMeta.width}x${webMeta.height}`);
check('the web copy is small enough for shop mobile data', webBytes.length < 400_000, `${Math.round(webBytes.length / 1024)} KB of ${Math.round(sourcePhoto.length / 1024)} KB`);
check('it is turned the right way up (EXIF rotation applied)', webMeta.width > webMeta.height, `${webMeta.width}x${webMeta.height} from a 2400x3200 photo marked rotate-90`);

const originalUrl = originalUrlFor(webUrl);
const originalRes = await fetch(originalUrl);
const originalBytes = Buffer.from(await originalRes.arrayBuffer());
const originalMeta = await sharp(originalBytes).metadata();
check('the original is reachable by rewriting the URL', originalRes.ok, `${originalRes.status} ${originalUrl?.slice(-40)}`);
check('the original keeps its full size', Math.max(originalMeta.width, originalMeta.height) === 3200, `${originalMeta.width}x${originalMeta.height}`);
check('the original is the bigger file', originalBytes.length > webBytes.length, `${Math.round(originalBytes.length / 1024)} KB vs ${Math.round(webBytes.length / 1024)} KB`);

// ---- replacing it --------------------------------------------------------------------
const second = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: { r: 20, g: 90, b: 160 } } }).jpeg().toBuffer();
const replaced = await call('POST', `/api/products/${id}/photo`, { file: { buffer: second, type: 'image/jpeg', name: 'zz2.jpg' } });
const afterReplace = await listFolder(`products/${id}/`);
check('replacing a photo leaves exactly one pair behind, not two', replaced.status === 200 && afterReplace.length === 2, `${afterReplace.length} files: ${afterReplace.join(', ')}`);
check('the old photo is really gone from the bucket', !afterReplace.some((f) => f.includes(webUrl.split('/').pop())), afterReplace.join(', '));

// The old URL can still answer for a while from Google's cache - every upload has its own
// name and a one-year cache header, which is what makes the shop's pages fast. What matters is
// that the file is gone from the bucket, which is checked above.

// ---- permissions ---------------------------------------------------------------------
const salesmanUpload = await call('POST', `/api/products/${id}/photo`, { token: salesman, file: { buffer: second, type: 'image/jpeg', name: 'zz3.jpg' } });
check('a salesman cannot change a saree photo', salesmanUpload.status === 403, salesmanUpload.status);

const notAnImage = await call('POST', `/api/products/${id}/photo`, { file: { buffer: Buffer.from('not a picture'), type: 'text/plain', name: 'zz.txt' } });
check('a file that is not an image is refused', notAnImage.status === 400, notAnImage.status);

const ghostUpload = await call('POST', '/api/products/00000000-0000-0000-0000-0000000000ff/photo', { file: { buffer: second, type: 'image/jpeg', name: 'zz.jpg' } });
check('uploading to a saree that does not exist is a 404', ghostUpload.status === 404, ghostUpload.status);

// ---- removing it ---------------------------------------------------------------------
const removed = await call('DELETE', `/api/products/${id}/photo`);
const afterDelete = await listFolder(`products/${id}/`);
const clearedRow = await db.query('select image_url from pos.products where id = $1', [id]);
check('removing the photo empties the folder as well as the row', removed.status === 200 && afterDelete.length === 0 && clearedRow.rows[0].image_url === null,
    `${afterDelete.length} files left, image_url=${clearedRow.rows[0].image_url}`);

const removeGhost = await call('DELETE', '/api/products/00000000-0000-0000-0000-0000000000ff/photo');
check('removing the photo of a saree that does not exist is a 404', removeGhost.status === 404, removeGhost.status);

// ---- vendor bills: private, link expires ---------------------------------------------
const billPath = `zzb5-test-bill-${Date.now()}.webp`;
await storeBill(billPath, await sharp(second).webp().toBuffer(), 'image/webp');
const readBack = await readBill(billPath);
check('a bill can be stored and read back', !!readBack && readBack.contentType === 'image/webp', readBack?.contentType);

const publicAttempt = await fetch(`https://storage.googleapis.com/${BILL_BUCKET}/${billPath}`);
check('a bill is NOT readable by the public (it carries the vendor details)', publicAttempt.status === 403 || publicAttempt.status === 401, publicAttempt.status);

const vendorBill = await call('POST', '/api/vendor-bills', {
    body: { bill: { company_name: 'ZZ B5 Vendor', bill_date: '2026-10-13', total_amount: 100, bill_image_path: billPath }, products: [] },
});
check('the purchase bill keeps the path of the photo it was read from', vendorBill.status === 201 && vendorBill.json?.bill_image_path === billPath, vendorBill.json?.bill_image_path);

const preview = await fetch(`${BASE}/api/inventory/bill-image/${encodeURIComponent(billPath)}`, { headers: { Authorization: `Bearer ${founder}` } });
check('the shop can see the bill photo through the signed-in app', preview.ok && preview.headers.get('content-type') === 'image/webp', `${preview.status} ${preview.headers.get('content-type')}`);

const previewNoLogin = await fetch(`${BASE}/api/inventory/bill-image/${encodeURIComponent(billPath)}`);
check('without a login the bill photo is refused', previewNoLogin.status === 401, previewNoLogin.status);

const previewAsSalesman = await fetch(`${BASE}/api/inventory/bill-image/${encodeURIComponent(billPath)}`, { headers: { Authorization: `Bearer ${salesman}` } });
check('a salesman cannot see a vendor bill photo', previewAsSalesman.status === 403, previewAsSalesman.status);

const missingBill = await readBill('zzb5-no-such-bill.webp');
check('asking for a bill that is not there answers nothing, not an error', missingBill === null, String(missingBill));

// ---- clean up ------------------------------------------------------------------------
await storage.bucket(BILL_BUCKET).file(billPath).delete().catch(() => {});
await call('DELETE', `/api/products/${id}`);
await db.query("delete from pos.products where sku like 'ZZB5%'");
await db.query("delete from pos.vendor_bills where company_name like 'ZZ B5%'");
await db.query("delete from store.staff_users where provider_uid like 'zzb5-%'");
await db.query("select setval('pos.barcode_seq', 10000000, false)");

const [photoLeft] = await storage.bucket(PHOTO_BUCKET).getFiles({ prefix: 'products/' });
const [colourLeft] = await storage.bucket(PHOTO_BUCKET).getFiles({ prefix: 'colors/' });
const [billLeft] = await storage.bucket(BILL_BUCKET).getFiles({ prefix: 'zzb5' });
const rows = (await db.query('select (select count(*) from pos.products) as products, (select count(*) from store.staff_users) as staff, (select count(*) from pos.vendor_bills) as vendor_bills')).rows[0];
check('nothing left in either bucket or the database',
    photoLeft.length === 0 && colourLeft.length === 0 && billLeft.length === 0 && Number(rows.products) === 0 && Number(rows.staff) === 0 && Number(rows.vendor_bills) === 0,
    `photos=${photoLeft.length} colours=${colourLeft.length} bills=${billLeft.length} products=${rows.products} staff=${rows.staff}`);

await db.end();
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
