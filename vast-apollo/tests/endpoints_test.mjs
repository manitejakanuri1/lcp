// Every endpoint, through the live address, as a signed-in founder.
//
// The other suites run against a local API with a hand-signed token, which proves the SQL but
// not the deployment: a route can be correct in the file and still be unreachable because the
// image is old, a secret is missing, or a header blocks the browser. This suite touches all
// 43 routes on the real service and checks the whole round trip.
//
// It writes. Everything it creates is named ZZ... and deleted again at the end, and the last
// check fails if anything is left behind.
//
//   POS_PASSWORD=... node tests/endpoints_test.mjs
//
// Two routes are not exercised with real work, on purpose:
//   - POST /api/inventory/upload-bill spends a DeepSeek call, which is for real vendor bills
//     only, so it is behind TEST_BILL_AI=1.
//   - the three /api/users write routes would change a real staff login, so they are called
//     with a non-existent id or a taken name: that proves the route, the founder check and
//     the database lookup without touching anybody's account.
import sharp from 'sharp';

const BASE = process.env.APP || 'https://inventory.lakshmisarees.in';
const USERNAME = process.env.POS_USER || 'srinu';
const PASSWORD = process.env.POS_PASSWORD;

let pass = 0;
let fail = 0;
const seen = new Set();
const check = (route, name, ok, detail = '') => {
    seen.add(route);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${route.padEnd(42)} ${name}${detail ? ' - ' + String(detail).slice(0, 160) : ''}`);
    ok ? pass++ : fail++;
};

if (!PASSWORD) {
    console.error('POS_PASSWORD is not set.');
    process.exit(1);
}

let auth = {};
const call = async (method, path, body) => {
    const res = await fetch(BASE + path, {
        method,
        headers: { ...auth, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* keep the text */ }
    return { status: res.status, ok: res.ok, json, text, headers: res.headers };
};
const photo = (r, g, b) => sharp({ create: { width: 700, height: 950, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();
const upload = async (method, path, field, buffer, filename, extra = {}) => {
    const form = new FormData();
    form.append(field, new Blob([buffer], { type: 'image/jpeg' }), filename);
    for (const [k, v] of Object.entries(extra)) form.append(k, String(v));
    const res = await fetch(BASE + path, { method, headers: auth, body: form });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* keep the text */ }
    return { status: res.status, ok: res.ok, json, text };
};

const today = new Date().toISOString().slice(0, 10);

// ---- the way in ------------------------------------------------------------------------
const health = await call('GET', '/api/health');
check('GET /api/health', 'service answers', health.ok && health.json?.status === 'ok', health.status);

const closed = await call('GET', '/api/products');
check('(no token)', 'a request without a token is refused', closed.status === 401, closed.status);

const login = await call('POST', '/api/auth/login', { username: USERNAME, password: PASSWORD });
check('POST /api/auth/login', 'signs in', login.ok && !!login.json?.token, login.json?.error || login.json?.user?.role);
if (!login.json?.token) { console.log('\nCannot continue without a token.'); process.exit(1); }
auth = { Authorization: `Bearer ${login.json.token}` };

const me = await call('GET', '/api/auth/me');
check('GET /api/auth/me', 'knows who is signed in', me.ok && me.json?.user?.username === USERNAME, me.json?.user?.role);

// The screens are served by this same service, and their safety header has to allow the
// photo bucket or every saree picture is a blank square in the browser.
const page = await fetch(BASE + '/');
const csp = page.headers.get('content-security-policy') || '';
const directive = (name) => (csp.split(';').find((d) => d.trim().startsWith(name + ' ')) || '');
check('GET / (the screens)', 'the page may show a photo from the bucket',
    directive('img-src').includes('storage.googleapis.com'), directive('img-src') || 'no img-src');
// The service worker caches photos, and a fetch inside a worker is judged by connect-src.
// Allowing img-src alone leaves every photo blank on a phone that has the app installed.
check('GET /sw.js (the cache)', 'the service worker may fetch a photo from the bucket',
    directive('connect-src').includes('storage.googleapis.com'), directive('connect-src') || 'no connect-src');

// ---- Stock In: a purchase bill with its sarees -----------------------------------------
const purchase = await call('POST', '/api/vendor-bills', {
    bill: {
        company_name: 'ZZ Endpoint Sweep', bill_number: 'ZZ-EP-1', bill_date: today,
        vendor_gst_number: '36ZZZZZ0000Z1Z5', is_local_transaction: true,
        subtotal: 2000, gst_amount: 100, total_amount: 2100, cgst_rate: 2.5, sgst_rate: 2.5,
    },
    products: [{
        sku: 'ZZEP-1', saree_name: 'ZZ Sweep Saree', saree_type: 'Silk', material: 'Cotton',
        color: 'Red', quantity: 6, vendor_name: 'ZZ Endpoint Sweep', purchase_date: today,
        cost_price: 300, selling_price: 1200, selling_price_a: 1200, status: 'available',
    }],
});
check('POST /api/vendor-bills', 'saves a purchase with its sarees',
    purchase.status === 201 && purchase.json?.products?.length === 1, purchase.json?.error || purchase.status);
const billId = purchase.json?.id;
const productId = purchase.json?.products?.[0]?.id;
if (!productId) { console.log('\nNothing to test against; stopping.'); process.exit(1); }

const vendorList = await call('GET', '/api/vendor-bills');
check('GET /api/vendor-bills', 'lists purchases',
    vendorList.ok && vendorList.json?.some((b) => b.id === billId), vendorList.json?.length + ' bill(s)');

const vendorOne = await call('GET', `/api/vendor-bills/${billId}`);
check('GET /api/vendor-bills/:id', 'reads one purchase with its sarees',
    vendorOne.ok && vendorOne.json?.id === billId, vendorOne.json?.products?.length + ' saree row(s)');

const vendorEdit = await call('PUT', `/api/vendor-bills/${billId}`, { notes: 'ZZ sweep note' });
check('PUT /api/vendor-bills/:id', 'edits a purchase', vendorEdit.ok && vendorEdit.json?.notes === 'ZZ sweep note', vendorEdit.status);

// ---- sarees -----------------------------------------------------------------------------
const products = await call('GET', '/api/products?search=ZZEP');
check('GET /api/products', 'finds the saree by search', products.ok && products.json?.length === 1, products.json?.length + ' found');

const bySku = await call('GET', '/api/products/sku/ZZEP-1');
check('GET /api/products/sku/:sku', 'finds the saree by its barcode number',
    bySku.ok && bySku.json?.id === productId, bySku.json?.error || bySku.json?.sku);

const extra = await call('POST', '/api/products', {
    sku: 'ZZEP-2', saree_name: 'ZZ Sweep Saree 2', saree_type: 'Cotton', material: 'Cotton',
    color: 'Blue', quantity: 2, vendor_name: 'ZZ Endpoint Sweep', purchase_date: today,
    cost_price: 100, selling_price: 500, selling_price_a: 500, status: 'available',
});
check('POST /api/products', 'adds a saree on its own', extra.status === 201 && !!extra.json?.id, extra.json?.error || extra.status);
const extraId = extra.json?.id;

const edit = await call('PUT', `/api/products/${productId}`, { selling_price_a: 1300 });
check('PUT /api/products/:id', 'edits a saree', edit.ok && Number(edit.json?.selling_price_a) === 1300, edit.status);

// ---- photos ------------------------------------------------------------------------------
const sareePhoto = await upload('POST', `/api/products/${productId}/photo`, 'photo', await photo(180, 30, 60), 'zz.jpg');
check('POST /api/products/:id/photo', 'saree photo uploads', sareePhoto.ok && !!sareePhoto.json?.image_url, sareePhoto.json?.error);

// Uploading is only half of it: the browser then fetches that address itself, so the bucket
// has to serve it to a caller with no login at all.
if (sareePhoto.json?.image_url) {
    const fetched = await fetch(sareePhoto.json.image_url);
    check('(the photo bucket)', 'the photo is readable by a browser',
        fetched.ok && (fetched.headers.get('content-type') || '').startsWith('image/'),
        `${fetched.status} ${fetched.headers.get('content-type')}`);
}

const colour = await upload('POST', `/api/website/products/${productId}/colors`, 'photo', await photo(20, 40, 120), 'zz2.jpg',
    { color_name: 'Navy Blue', pieces: 2 });
check('POST /api/website/products/:id/colors', 'colour adds with its photo', colour.ok && !!colour.json?.image_url, colour.json?.error);
const colourId = colour.json?.id;

const colourPhoto = await upload('PUT', `/api/website/colors/${colourId}/photo`, 'photo', await photo(10, 10, 200), 'zz3.jpg');
check('PUT /api/website/colors/:id/photo', 'colour photo is replaced', colourPhoto.ok, colourPhoto.status);

const split = await upload('POST', '/api/website/colors/split', 'photo', await photo(240, 180, 40), 'sheet.jpg');
check('POST /api/website/colors/split', 'colour sheet reaches the cutter',
    split.ok, `${split.status} ${split.json?.photos ? split.json.photos.length + ' picture(s)' : split.json?.error || ''}`);

const websiteList = await call('GET', '/api/website/products');
check('GET /api/website/products', 'lists sarees for the website tab',
    websiteList.ok && Array.isArray(websiteList.json), websiteList.json?.length + ' saree(s)');

const websiteEdit = await call('PUT', `/api/website/products/${productId}`, { on_website: true, main_color_pieces: 4 });
check('PUT /api/website/products/:id', 'puts a saree on the website', websiteEdit.ok && websiteEdit.json?.on_website === true, websiteEdit.json?.error);

// ---- selling -----------------------------------------------------------------------------
const number = await call('GET', '/api/bills/generate-number');
check('GET /api/bills/generate-number', 'hands out the next bill number', number.ok && !!number.json?.billNumber, number.json?.billNumber);

const sale = await call('POST', '/api/bills', {
    bill: { customer_name: 'ZZ Sweep Customer', customer_phone: '9000000000', payment_method: 'cash' },
    items: [{ product_id: productId, color_id: colourId, quantity: 2 }],
});
check('POST /api/bills', 'sells two pieces', sale.status === 201 && !!sale.json?.id, sale.json?.error || sale.status);
const saleId = sale.json?.id;

const afterSale = await call('GET', '/api/products/sku/ZZEP-1');
check('(stock after a sale)', 'stock fell from 6 to 4', Number(afterSale.json?.quantity) === 4, afterSale.json?.quantity);

const bills = await call('GET', '/api/bills');
check('GET /api/bills', 'lists sales', bills.ok && bills.json?.some((b) => b.id === saleId), bills.json?.length + ' sale(s)');

const billOne = await call('GET', `/api/bills/${saleId}`);
check('GET /api/bills/:id', 'reads one sale with its items', billOne.ok && billOne.json?.bill_items?.length === 1, billOne.json?.error);

const billEdit = await call('PUT', `/api/bills/${saleId}`, { customer_name: 'ZZ Sweep Customer 2' });
check('PUT /api/bills/:id', 'edits a sale', billEdit.ok && billEdit.json?.customer_name === 'ZZ Sweep Customer 2', billEdit.status);

// ---- the numbers -------------------------------------------------------------------------
const summary = await call('GET', '/api/analytics/summary');
check('GET /api/analytics/summary', 'adds up the shop', summary.ok && summary.json !== null,
    summary.json ? `sold ${summary.json.total_items_sold}, in stock ${summary.json.total_items_in_stock}, sales ${summary.json.total_sales}` : summary.status);

const daily = await call('GET', '/api/analytics/daily-sales?days=7');
check('GET /api/analytics/daily-sales', 'returns a day per row', daily.ok && Array.isArray(daily.json), daily.json?.length + ' day(s)');

const gst = await call('GET', '/api/reports/gst');
check('GET /api/reports/gst', 'builds the GST report', gst.ok && Array.isArray(gst.json), gst.json?.length + ' month(s)');

const pl = await call('GET', '/api/reports/profit-loss');
check('GET /api/reports/profit-loss', 'builds the profit and loss report', pl.ok && !!pl.json, (pl.json?.months?.length ?? pl.json?.length) + ' month(s)');

// ---- spending ----------------------------------------------------------------------------
const expense = await call('POST', '/api/expenses', { category: 'Transport', description: 'ZZ sweep auto', amount: 123.45, expense_date: today });
check('POST /api/expenses', 'records a spend', expense.status === 201 && !!expense.json?.id, expense.json?.error);
const expenseId = expense.json?.id;

const expenses = await call('GET', '/api/expenses?category=Transport');
check('GET /api/expenses', 'lists spends', expenses.ok && expenses.json?.some((e) => e.id === expenseId), expenses.json?.length + ' row(s)');

const expenseEdit = await call('PUT', `/api/expenses/${expenseId}`, { amount: 200 });
check('PUT /api/expenses/:id', 'edits a spend', expenseEdit.ok && Number(expenseEdit.json?.amount) === 200, expenseEdit.status);

const expenseGone = await call('DELETE', `/api/expenses/${expenseId}`);
check('DELETE /api/expenses/:id', 'deletes a spend', expenseGone.ok, expenseGone.status);

// ---- staff -------------------------------------------------------------------------------
// Read is real; the three writes are proved without touching a live login (see the header).
const users = await call('GET', '/api/users');
check('GET /api/users', 'lists staff', users.ok && users.json?.some((u) => u.username === USERNAME), users.json?.length + ' staff');

const nobody = '00000000-0000-0000-0000-0000000000ff';
const roleCall = await call('PUT', `/api/users/${nobody}/role`, { role: 'salesman' });
check('PUT /api/users/:id/role', 'route and founder check work (unknown id refused)', roleCall.status === 404, roleCall.status);

const passwordCall = await call('PUT', `/api/users/${nobody}/password`, { password: 'zz-not-used-1234' });
check('PUT /api/users/:id/password', 'route and founder check work (unknown id refused)', passwordCall.status === 404, passwordCall.status);

const userCall = await call('PUT', `/api/users/${nobody}`, { full_name: 'ZZ Nobody' });
check('PUT /api/users/:id', 'route and founder check work (unknown id refused)', userCall.status === 404, userCall.status);

const registerCall = await call('POST', '/api/auth/register', { username: USERNAME, password: 'zz-not-used-1234' });
check('POST /api/auth/register', 'route works and refuses a name already taken',
    registerCall.status === 400 && /exists/i.test(registerCall.json?.error || ''), registerCall.json?.error);

// ---- the bill reader ---------------------------------------------------------------------
const billImage = await call('GET', '/api/inventory/bill-image/vendor-bills/zz-does-not-exist.jpg');
check('GET /api/inventory/bill-image/:path', 'route works and a missing bill photo is a clean 404', billImage.status === 404, billImage.status);

if (process.env.TEST_BILL_AI === '1') {
    const read = await upload('POST', '/api/inventory/upload-bill', 'billImage', await photo(250, 250, 250), 'bill.jpg');
    check('POST /api/inventory/upload-bill', 'bill photo is read by the AI', [200, 422].includes(read.status),
        `${read.status} ${read.json?.error || (read.json?.extracted_data ? 'read it' : '')}`);
} else {
    seen.add('POST /api/inventory/upload-bill');
    console.log('SKIP POST /api/inventory/upload-bill'.padEnd(52) + 'set TEST_BILL_AI=1 to spend a DeepSeek call');
}

// ---- undo everything ---------------------------------------------------------------------
const saleGone = await call('DELETE', `/api/bills/${saleId}`);
check('DELETE /api/bills/:id', 'cancels the sale', saleGone.ok, saleGone.json?.error || saleGone.status);

const restored = await call('GET', '/api/products/sku/ZZEP-1');
check('(stock after a cancel)', 'stock went back to 6', Number(restored.json?.quantity) === 6, restored.json?.quantity);

const colourGone = await call('DELETE', `/api/website/colors/${colourId}`);
check('DELETE /api/website/colors/:id', 'removes the colour', colourGone.ok, colourGone.status);

const photoGone = await call('DELETE', `/api/products/${productId}/photo`);
check('DELETE /api/products/:id/photo', 'removes the saree photo', photoGone.ok, photoGone.status);

const productGone = await call('DELETE', `/api/products/${productId}`);
check('DELETE /api/products/:id', 'deletes the saree', productGone.ok, productGone.status);
await call('DELETE', `/api/products/${extraId}`);

const purchaseGone = await call('DELETE', `/api/vendor-bills/${billId}`);
check('DELETE /api/vendor-bills/:id', 'deletes the purchase', purchaseGone.ok, purchaseGone.status);

const left = await call('GET', '/api/products?search=ZZEP');
check('(clean up)', 'nothing left behind', left.json?.length === 0, left.json?.length + ' saree(s) left');

const out = await call('POST', '/api/auth/logout');
check('POST /api/auth/logout', 'signs out', out.ok, out.status);

// Every route in api/index.js has to appear above, or the sweep is not a sweep.
const { readFileSync } = await import('node:fs');
const source = readFileSync(new URL('../api/index.js', import.meta.url), 'utf-8');
const routes = [...source.matchAll(/^app\.(get|post|put|patch|delete)\('([^']+)'/gm)]
    .map((m) => `${m[1].toUpperCase()} ${m[2]}`);
const missed = routes.filter((r) => !seen.has(r));
check('(coverage)', `all ${routes.length} routes were called`, missed.length === 0, missed.join(', '));

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
