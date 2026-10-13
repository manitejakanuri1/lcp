// Batch 1 proof: the five inventory routes, against the real Cloud SQL database.
// Signs its own tokens because /api/auth/login is still on Supabase (batch 3).
import jwt from 'jsonwebtoken';

const BASE = process.env.BASE || 'http://127.0.0.1:3099';
const SECRET = process.env.JWT_SECRET;
const founder = jwt.sign({ id: '00000000-0000-0000-0000-000000000001', username: 'zztest-founder', role: 'founder' }, SECRET, { expiresIn: '10m' });
const salesman = jwt.sign({ id: '00000000-0000-0000-0000-000000000002', username: 'zztest-salesman', role: 'salesman' }, SECRET, { expiresIn: '10m' });

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + String(detail).slice(0, 220) : ''}`);
    ok ? pass++ : fail++;
};

async function call(method, path, { token = founder, body } = {}) {
    const res = await fetch(BASE + path, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* keep the text */ }
    return { status: res.status, json, text };
}

const saree = {
    sku: 'ZZB1-001',
    saree_name: 'ZZ Batch One Saree',
    saree_type: 'Silk',
    material: 'Cotton',
    color: 'Red',
    quantity: 5,
    vendor_name: 'ZZ Vendor',
    purchase_date: '2026-10-13',
    cost_price: 400,
    cost_code: 'DX',
    hsn_code: '5407',
    selling_price: 900,
    selling_price_a: 900,
    selling_price_b: 850,
    rack_location: 'R1',
    status: 'available',
};

const created = await call('POST', '/api/products', { body: saree });
check('create saree', created.status === 201 && created.json?.id, `${created.status} ${created.json?.sku} barcode=${created.json?.barcode_no}`);
const id = created.json?.id;
const barcode = created.json?.barcode_no;

const noAuth = await fetch(BASE + '/api/products');
check('create/list refused without a token', noAuth.status === 401, `GET without token = ${noAuth.status}`);

const salesmanCreate = await call('POST', '/api/products', { token: salesman, body: { ...saree, sku: 'ZZB1-002' } });
check('salesman may not add stock (requireStaff = founder/accounting)', salesmanCreate.status === 403, salesmanCreate.status);
const second = await call('POST', '/api/products', { body: { ...saree, sku: 'ZZB1-002' } });
check('create a second saree', second.status === 201, second.status);
const id2 = second.json?.id;

const list = await call('GET', '/api/products');
check('list sarees', list.status === 200 && Array.isArray(list.json) && list.json.length >= 2, `${list.status} ${list.json?.length} rows`);

const search = await call('GET', '/api/products?search=Batch%20One');
check('search by name', search.status === 200 && search.json?.some((p) => p.sku === 'ZZB1-001'), `${search.json?.length} hit(s)`);

const wild = await call('GET', '/api/products?search=%25');
check('a % in the search text matches nothing instead of everything', wild.status === 200 && wild.json?.length === 0, `${wild.json?.length} rows`);

const filtered = await call('GET', '/api/products?color=red&minPrice=800&maxPrice=1000&status=available');
check('filter by colour, price band and status', filtered.status === 200 && filtered.json?.length >= 1, `${filtered.json?.length} rows`);

const asSalesman = await call('GET', '/api/products', { token: salesman });
const leaked = Object.keys(asSalesman.json?.[0] || {}).filter((k) => ['cost_price', 'cost_code', 'vendor_name', 'purchase_date'].includes(k));
check('salesman sees no cost or vendor column', asSalesman.status === 200 && leaked.length === 0, leaked.join(', ') || 'none leaked');

const bySku = await call('GET', '/api/products/sku/ZZB1-001');
check('scan an old SKU label', bySku.status === 200 && bySku.json?.id === id, `${bySku.status} ${bySku.json?.sku}`);

const byBarcode = await call('GET', `/api/products/sku/${barcode}`);
check('scan the 8-digit barcode', byBarcode.status === 200 && byBarcode.json?.id === id, `${byBarcode.status} ${byBarcode.json?.barcode_no}`);

const missing = await call('GET', '/api/products/sku/ZZ-NOPE');
check('unknown code is a 404', missing.status === 404, missing.status);

const updated = await call('PUT', `/api/products/${id}`, { body: { selling_price_a: 950, rack_location: 'R9' } });
check('founder may change the price', updated.status === 200 && Number(updated.json?.selling_price_a) === 950 && updated.json?.rack_location === 'R9', `${updated.status} ${updated.json?.selling_price_a}`);

const salesmanEdit = await call('PUT', `/api/products/${id}`, { token: salesman, body: { selling_price_a: 1, quantity: 4 } });
const after = await call('GET', `/api/products/sku/ZZB1-001`);
check('salesman may change pieces but not the price', salesmanEdit.status === 200 && Number(after.json?.selling_price_a) === 950 && after.json?.quantity === 4, `price=${after.json?.selling_price_a} qty=${after.json?.quantity}`);

const empty = await call('PUT', `/api/products/${id}`, { body: { not_a_column: 'x' } });
check('an empty change is a clear 400, not a 500', empty.status === 400, `${empty.status} ${empty.json?.error}`);

const ghost = await call('PUT', '/api/products/00000000-0000-0000-0000-0000000000ff', { body: { quantity: 1 } });
check('updating a saree that does not exist is a 404', ghost.status === 404, ghost.status);

const gone = await call('DELETE', `/api/products/${id}`);
check('delete saree', gone.status === 200, `${gone.status} ${gone.json?.message}`);
const gone2 = await call('DELETE', `/api/products/${id2}`);
check('delete the second saree', gone2.status === 200, gone2.status);

const deletedTwice = await call('DELETE', `/api/products/${id}`);
check('deleting it again is a 404', deletedTwice.status === 404, deletedTwice.status);

const endList = await call('GET', '/api/products?search=ZZB1');
check('no test rows left behind', endList.json?.length === 0, `${endList.json?.length} rows`);

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
