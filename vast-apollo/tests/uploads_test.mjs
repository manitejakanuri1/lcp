// Proves the six file-upload calls work, through the live address, as a browser makes them.
//
// They broke in the Supabase removal: the shared token helper was renamed, and these six
// build their own request instead of going through request(), so they kept calling the old
// name. The typecheck that should have caught it was reading tsconfig.json, which lists no
// files, so it passed while checking nothing. This test uses the real endpoints instead, so
// a rename cannot pass unnoticed again.
//
//   POS_PASSWORD=... APP=https://inventory.lakshmisarees.in node tests/uploads_test.mjs
import pg from 'pg';
import sharp from 'sharp';

const BASE = process.env.APP || 'https://inventory.lakshmisarees.in';
const USERNAME = process.env.POS_USER || 'srinu';
const PASSWORD = process.env.POS_PASSWORD;

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + String(detail).slice(0, 200) : ''}`);
    ok ? pass++ : fail++;
};

if (!PASSWORD) {
    console.error('POS_PASSWORD is not set.');
    process.exit(1);
}

const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
});
const session = await login.json();
check('sign in', login.ok && !!session.token, session.error || session.user?.username);
if (!session.token) process.exit(1);
const auth = { Authorization: `Bearer ${session.token}` };

const photo = async (r, g, b) => sharp({ create: { width: 700, height: 950, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();
const form = (name, buffer, filename, type = 'image/jpeg') => {
    const f = new FormData();
    f.append(name, new Blob([buffer], { type }), filename);
    return f;
};
const call = async (method, path, body, isJson = true) => {
    const res = await fetch(BASE + path, {
        method,
        headers: isJson ? { ...auth, 'Content-Type': 'application/json' } : auth,
        body: isJson ? JSON.stringify(body) : body,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* keep the text */ }
    return { status: res.status, json, text };
};

// ---- 1. Stock In: a vendor bill with its sarees (vendorBillsApi.create) ---------------
const today = new Date().toISOString().slice(0, 10);
const purchase = await call('POST', '/api/vendor-bills', {
    bill: {
        company_name: 'ZZ Upload Check', bill_number: 'ZZ-UP-1', bill_date: today,
        is_local_transaction: true, subtotal: 1000, gst_amount: 50, total_amount: 1050,
        cgst_rate: 2.5, sgst_rate: 2.5,
    },
    products: [{
        sku: 'ZZUP-1', saree_name: 'ZZ Upload Saree', saree_type: 'Silk', material: 'Cotton',
        color: 'Red', quantity: 4, vendor_name: 'ZZ Upload Check', purchase_date: today,
        cost_price: 250, selling_price: 900, selling_price_a: 900, status: 'available',
    }],
});
check('Stock In saves a purchase with its sarees', purchase.status === 201 && purchase.json?.products?.length === 1,
    `${purchase.status} ${purchase.json?.error || ''}`);
const productId = purchase.json?.products?.[0]?.id;
const billId = purchase.json?.id;

// ---- 2. saree photo (productsApi.uploadPhoto) -----------------------------------------
const up = await fetch(`${BASE}/api/products/${productId}/photo`, {
    method: 'POST', headers: auth, body: form('photo', await photo(180, 30, 60), 'zz.jpg'),
});
const upJson = await up.json().catch(() => ({}));
check('saree photo uploads', up.ok && !!upJson.image_url, upJson.image_url?.slice(-28) || upJson.error);

// ---- 3. colour with a photo (websiteApi.addColor) -------------------------------------
const colourForm = form('photo', await photo(20, 40, 120), 'zz2.jpg');
colourForm.append('color_name', 'Navy Blue');
colourForm.append('pieces', '2');
const colour = await fetch(`${BASE}/api/website/products/${productId}/colors`, { method: 'POST', headers: auth, body: colourForm });
const colourJson = await colour.json().catch(() => ({}));
check('colour adds with its photo', colour.ok && !!colourJson.image_url, colourJson.sku || colourJson.error);

// ---- 4. replace a colour photo (websiteApi.setColorPhoto) -----------------------------
const replace = await fetch(`${BASE}/api/website/colors/${colourJson.id}/photo`, {
    method: 'PUT', headers: auth, body: form('photo', await photo(10, 10, 200), 'zz3.jpg'),
});
check('colour photo can be replaced', replace.ok, replace.status);

// ---- 5. colour sheet splitter (websiteApi.splitSheet) ---------------------------------
const sheet = await fetch(`${BASE}/api/website/colors/split`, {
    method: 'POST', headers: auth, body: form('photo', await photo(240, 180, 40), 'sheet.jpg'),
});
const sheetJson = await sheet.json().catch(() => ({}));
check('colour sheet reaches the splitter', sheet.status === 200 || sheet.status === 502,
    `${sheet.status} ${sheetJson.error || (sheetJson.photos ? sheetJson.photos.length + ' picture(s)' : '')}`);

// ---- 6. bill photo to the reader (inventoryApi.uploadBill) ----------------------------
// Off by default. Reading a bill spends a real DeepSeek call, and the owner's rule is that
// the AI is for actual vendor bills, not for test runs. The upload path shares its code with
// the five checks above, so a rename cannot break this one alone; run it deliberately with
// TEST_BILL_AI=1 when the reader itself is what changed.
if (process.env.TEST_BILL_AI === '1') {
    const bill = await fetch(`${BASE}/api/inventory/upload-bill`, {
        method: 'POST', headers: auth, body: form('billImage', await photo(250, 250, 250), 'bill.jpg'),
    });
    const billJson = await bill.json().catch(() => ({}));
    check('bill photo reaches the reader', [200, 422, 502].includes(bill.status),
        `${bill.status} ${billJson.error || (billJson.extracted_data ? 'read it' : '')}`);
} else {
    console.log('SKIP bill photo to the reader - set TEST_BILL_AI=1 to spend a DeepSeek call');
}

// ---- clean up --------------------------------------------------------------------------
await call('DELETE', `/api/products/${productId}`);
await call('DELETE', `/api/vendor-bills/${billId}`);

const db = process.env.DB_PASSWORD ? new pg.Pool({
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 5433),
    user: process.env.DB_USER || 'schema_admin', password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'lakshmi',
}) : null;
if (db) {
    await db.query("delete from pos.products where sku like 'ZZUP%'");
    await db.query("delete from pos.vendor_bills where company_name like 'ZZ Upload%'");
    const left = (await db.query('select count(*)::int as n from pos.products')).rows[0].n;
    check('nothing left behind', left === 0, `${left} sarees`);
    await db.end();
} else {
    const left = await call('GET', '/api/products?search=ZZUP');
    check('nothing left behind', Array.isArray(left.json) && left.json.length === 0, `${left.json?.length} sarees`);
}

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
