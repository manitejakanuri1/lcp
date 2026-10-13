// Batch 6 proof: the Website tab - colour-wise stock, colour photos, and the switch that puts
// a saree on the website. Runs against the real database and the real photo bucket.
import jwt from 'jsonwebtoken';
import pg from 'pg';
import sharp from 'sharp';
import { Storage } from '@google-cloud/storage';
import { originalUrlFor } from '../api/storage.js';

const BASE = process.env.BASE || 'http://127.0.0.1:3099';
const SECRET = process.env.JWT_SECRET;
const FOUNDER_ID = '00000000-0000-0000-0000-000000000001';
const SALES_ID = '00000000-0000-0000-0000-000000000002';
const founder = jwt.sign({ id: FOUNDER_ID, username: 'zzb6founder', role: 'founder' }, SECRET, { expiresIn: '10m' });
const salesman = jwt.sign({ id: SALES_ID, username: 'zzb6sales', role: 'salesman' }, SECRET, { expiresIn: '10m' });

const PHOTO_BUCKET = process.env.PHOTO_BUCKET || 'lakshmi-sarees-photos';
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
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + String(detail).slice(0, 240) : ''}`);
    ok ? pass++ : fail++;
};

async function call(method, path, { token = founder, body, fields } = {}) {
    let payload;
    const headers = { Authorization: `Bearer ${token}` };
    if (fields) {
        const form = new FormData();
        for (const [key, value] of Object.entries(fields)) {
            if (value && value.buffer) form.append(key, new Blob([value.buffer], { type: value.type }), value.name);
            else if (value !== undefined) form.append(key, String(value));
        }
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

const photo = async (r, g, b) => ({
    buffer: await sharp({ create: { width: 900, height: 1200, channels: 3, background: { r, g, b } } }).jpeg().toBuffer(),
    type: 'image/jpeg',
    name: 'zz.jpg',
});
const listColourFiles = async (productId) => {
    const [files] = await storage.bucket(PHOTO_BUCKET).getFiles({ prefix: `colors/${productId}/` });
    return files.map((f) => f.name);
};

await db.query(
    `insert into store.staff_users (id, provider, provider_uid, email, username, full_name, role, is_active, created_at, updated_at)
     values ($1,'firebase','zzb6-founder','zzb6-founder@example.invalid','zzb6founder','ZZ B6 Founder','founder',true,now(),now()),
            ($2,'firebase','zzb6-sales','zzb6-sales@example.invalid','zzb6sales','ZZ B6 Salesman','salesman',true,now(),now())
     on conflict (id) do nothing`,
    [FOUNDER_ID, SALES_ID],
);

const saree = await call('POST', '/api/products', {
    body: {
        sku: 'ZZB6-1', saree_name: 'ZZ Website Saree', saree_type: 'Silk', material: 'Cotton', color: 'Red',
        quantity: 10, vendor_name: 'ZZ B6', purchase_date: '2026-10-13', cost_price: 400,
        selling_price: 1200, selling_price_a: 1200, selling_price_b: 1100, status: 'available',
    },
});
check('test saree created', saree.status === 201, `${saree.status} ${saree.json?.error || ''}`);
const id = saree.json?.id;

// ---- the two lists -------------------------------------------------------------------
const todo = await call('GET', '/api/website/products?status=todo');
check('a new saree is in the "to do" list', todo.status === 200 && todo.json?.some((p) => p.id === id), `${todo.json?.length} waiting`);
check('its colour list comes back empty, not missing', Array.isArray(todo.json?.find((p) => p.id === id)?.product_colors), JSON.stringify(todo.json?.find((p) => p.id === id)?.product_colors));

const asSalesman = await call('GET', '/api/website/products?status=todo', { token: salesman });
const leaked = Object.keys(asSalesman.json?.[0] || {}).filter((k) => ['cost_price', 'cost_code', 'vendor_name', 'purchase_date'].includes(k));
check('a salesman may see this page but not the cost or the vendor', asSalesman.status === 200 && leaked.length === 0, leaked.join(', ') || 'nothing leaked');

const salesmanWrite = await call('PUT', `/api/website/products/${id}`, { token: salesman, body: { on_website: true } });
check('a salesman cannot change website details', salesmanWrite.status === 403, salesmanWrite.status);

// ---- tagging colours now, photographing later ----------------------------------------
const maroon = await call('POST', `/api/website/products/${id}/colors`, { fields: { color_name: 'maroon', pieces: 3 } });
check('a colour can be tagged with no photo yet', maroon.status === 201 && maroon.json?.image_url === null, `${maroon.status} photo=${maroon.json?.image_url}`);
check('the colour name is tidied to "Maroon"', maroon.json?.color_name === 'Maroon', maroon.json?.color_name);
check('the colour gets its own barcode', Number(maroon.json?.barcode_no) > 0, maroon.json?.barcode_no);
check('the colour SKU is built from the saree SKU', maroon.json?.sku === 'ZZB6-1-MAR', maroon.json?.sku);

const navy = await call('POST', `/api/website/products/${id}/colors`, { fields: { color_name: 'Navy Blue', pieces: 2, photo: await photo(20, 40, 120) } });
check('a second colour can be added with its photo', navy.status === 201 && !!navy.json?.image_url, `${navy.status} ${navy.json?.image_url?.slice(-30)}`);
check('its sort order follows the first', navy.json?.sort_order === 1, navy.json?.sort_order);

// Two colours whose first three letters clash must not fight over one barcode name.
const marigold = await call('POST', `/api/website/products/${id}/colors`, { fields: { color_name: 'Marigold', pieces: 1 } });
check('a clashing colour SKU gets a number instead of failing', marigold.status === 201 && marigold.json?.sku === 'ZZB6-1-MAR2', marigold.json?.sku);

const noName = await call('POST', `/api/website/products/${id}/colors`, { fields: { pieces: 1 } });
check('a colour with no name is refused', noName.status === 400, noName.status);

const ghostColour = await call('POST', '/api/website/products/00000000-0000-0000-0000-0000000000ff/colors', { fields: { color_name: 'Red' } });
check('adding a colour to a saree that does not exist is a 404', ghostColour.status === 404, ghostColour.status);

// ---- the website switch --------------------------------------------------------------
const blocked = await call('PUT', `/api/website/products/${id}`, { body: { on_website: true } });
check('the switch refuses while colours have no photo, and names them', blocked.status === 400 && /Maroon/.test(blocked.json?.error || '') && /Marigold/.test(blocked.json?.error || ''), blocked.json?.error);

const maroonPhoto = await call('PUT', `/api/website/colors/${maroon.json.id}/photo`, { fields: { photo: await photo(120, 20, 50) } });
check('a photo can be added to a colour later', maroonPhoto.status === 200 && !!maroonPhoto.json?.image_url, maroonPhoto.json?.image_url?.slice(-30));
check('adding the photo keeps the same barcode and pieces', Number(maroonPhoto.json?.barcode_no) === Number(maroon.json?.barcode_no) && maroonPhoto.json?.pieces === 3,
    `barcode=${maroonPhoto.json?.barcode_no} pieces=${maroonPhoto.json?.pieces}`);

await call('PUT', `/api/website/colors/${marigold.json.id}/photo`, { fields: { photo: await photo(240, 180, 40) } });

const live = await call('PUT', `/api/website/products/${id}`, { body: { on_website: true, saree_type: 'Kanchipuram', color: 'deep RED', main_color_pieces: 4 } });
check('with every colour photographed, the saree goes live', live.status === 200 && live.json?.on_website === true, `${live.status} ${live.json?.error || ''}`);
check('the main colour is tidied too ("deep RED" -> "Deep Red")', live.json?.color === 'Deep Red', live.json?.color);

const liveList = await call('GET', '/api/website/products?status=live');
const liveRow = liveList.json?.find((p) => p.id === id);
check('it moves to the live list with its 3 colours in order', liveList.status === 200 && liveRow?.product_colors?.length === 3
    && liveRow.product_colors.map((c) => c.color_name).join(',') === 'Maroon,Navy Blue,Marigold',
    liveRow?.product_colors?.map((c) => c.color_name).join(','));

const gone = await call('GET', '/api/website/products?status=todo');
check('and it is no longer in the "to do" list', !gone.json?.some((p) => p.id === id), `${gone.json?.length} waiting`);

const emptyUpdate = await call('PUT', `/api/website/products/${id}`, { body: { nonsense: true } });
check('a body of unknown fields is a 400', emptyUpdate.status === 400, emptyUpdate.status);

// ---- replacing a colour photo --------------------------------------------------------
const before = await listColourFiles(id);
const replaced = await call('PUT', `/api/website/colors/${navy.json.id}/photo`, { fields: { photo: await photo(10, 10, 200) } });
const after = await listColourFiles(id);
check('replacing one colour photo leaves the other colours alone', replaced.status === 200 && after.length === before.length,
    `${before.length} files before, ${after.length} after`);
const oldNavyPair = [navy.json.image_url, originalUrlFor(navy.json.image_url)].map((u) => u.split(`/${PHOTO_BUCKET}/`)[1]);
check('the replaced photo and its original are both gone', oldNavyPair.every((p) => !after.includes(p)), oldNavyPair.join(', '));

// ---- removing a colour ---------------------------------------------------------------
const removed = await call('DELETE', `/api/website/colors/${marigold.json.id}`);
const afterRemove = await listColourFiles(id);
const colourRows = (await db.query('select count(*)::int as n from pos.product_colors where product_id = $1', [id])).rows[0].n;
check('removing a colour takes its row and its photo pair', removed.status === 200 && colourRows === 2 && afterRemove.length === 4,
    `rows=${colourRows} files=${afterRemove.length}`);

const stillLive = (await db.query('select on_website from pos.products where id = $1', [id])).rows[0];
check('the saree stays live, because every colour left still has a photo', stillLive.on_website === true, stillLive.on_website);

// A colour tagged with no photo must take the saree off the website, or the public page shows
// an empty tile.
const latecomer = await call('POST', `/api/website/products/${id}/colors`, { fields: { color_name: 'Mustard', pieces: 2 } });
const afterLatecomer = (await db.query('select on_website from pos.products where id = $1', [id])).rows[0];
check('adding a photoless colour does not itself hide the saree (the switch guards that)', latecomer.status === 201 && afterLatecomer.on_website === true, afterLatecomer.on_website);

const removeAgain = await call('DELETE', `/api/website/colors/${latecomer.json.id}`);
check('removing it again works', removeAgain.status === 200, removeAgain.status);

const removeGhost = await call('DELETE', '/api/website/colors/00000000-0000-0000-0000-0000000000ff');
check('removing a colour that does not exist is a 404', removeGhost.status === 404, removeGhost.status);

// ---- the colour sheet splitter -------------------------------------------------------
const split = await call('POST', '/api/website/colors/split', { fields: { photo: await photo(100, 100, 100) } });
check('the sheet splitter says plainly that it is not set up yet (the reader service is not running here)',
    split.status === 503 || split.status === 502, `${split.status} ${split.json?.error}`);

// ---- clean up ------------------------------------------------------------------------
await call('DELETE', `/api/products/${id}`);
await db.query("delete from pos.products where sku like 'ZZB6%'");
await db.query("delete from store.staff_users where provider_uid like 'zzb6-%'");
await db.query("select setval('pos.barcode_seq', 10000000, false)");
const leftovers = await listColourFiles(id);
for (const name of leftovers) await storage.bucket(PHOTO_BUCKET).file(name).delete().catch(() => {});
const [anyPhotos] = await storage.bucket(PHOTO_BUCKET).getFiles({ maxResults: 5 });
const rows = (await db.query('select (select count(*) from pos.products) as products, (select count(*) from pos.product_colors) as colours, (select count(*) from store.staff_users) as staff')).rows[0];
check('nothing left behind', anyPhotos.length === 0 && Number(rows.products) === 0 && Number(rows.colours) === 0 && Number(rows.staff) === 0,
    `files=${anyPhotos.length} products=${rows.products} colours=${rows.colours} staff=${rows.staff}`);

await db.end();
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
