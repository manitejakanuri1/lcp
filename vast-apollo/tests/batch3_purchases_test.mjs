// Batch 3 proof: the five purchase-bill routes against the real Cloud SQL database.
// A purchase bill and the sarees that came in on it must save together or not at all, and a
// bill whose sarees are already sold must not be deletable.
import jwt from 'jsonwebtoken';
import pg from 'pg';

const BASE = process.env.BASE || 'http://127.0.0.1:3099';
const SECRET = process.env.JWT_SECRET;
const founder = jwt.sign({ id: '00000000-0000-0000-0000-000000000001', username: 'zztest-founder', role: 'founder' }, SECRET, { expiresIn: '10m' });
const salesman = jwt.sign({ id: '00000000-0000-0000-0000-000000000002', username: 'zztest-salesman', role: 'salesman' }, SECRET, { expiresIn: '10m' });

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

await db.query(
    `insert into store.staff_users (id, provider, provider_uid, email, full_name, role, is_active, created_at, updated_at)
     values ($1,'firebase','zztest-founder','zztest-founder@example.invalid','ZZ Test Founder','founder',true,now(),now()),
            ($2,'firebase','zztest-salesman','zztest-salesman@example.invalid','ZZ Test Salesman','salesman',true,now(),now())
     on conflict (id) do nothing`,
    ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'],
);

const saree = (sku, name) => ({
    sku, saree_name: name, saree_type: 'Silk', material: 'Cotton', color: 'Red', quantity: 4,
    vendor_name: 'ZZ Chhaya', purchase_date: '2026-10-13', cost_price: 535, cost_code: 'DX',
    hsn_code: '5407', selling_price: 1000, selling_price_a: 1000, selling_price_b: 950, status: 'available',
});

// --- a real purchase: a Chhaya bill, 3 sarees, local sale so CGST + SGST ---------------
const purchase = await call('POST', '/api/vendor-bills', {
    body: {
        bill: {
            company_name: 'ZZ Chhaya Sarees', bill_number: 'ZZ-329', bill_date: '2026-10-13',
            vendor_gst_number: '37ABCDE1234F1Z5', is_local_transaction: true,
            subtotal: 38520, gst_amount: 1926, total_amount: 40446, cgst_rate: 2.5, sgst_rate: 2.5,
        },
        products: [saree('ZZB3-1', 'ZZ Purchase One'), saree('ZZB3-2', 'ZZ Purchase Two'), saree('ZZB3-3', 'ZZ Purchase Three')],
    },
});
check('purchase bill saved with its sarees', purchase.status === 201 && purchase.json?.products?.length === 3, `${purchase.status} ${purchase.json?.products?.length} sarees`);
check('GST details kept as printed', Number(purchase.json?.gst_amount) === 1926 && Number(purchase.json?.cgst_rate) === 2.5 && purchase.json?.vendor_gst_number === '37ABCDE1234F1Z5', `gst=${purchase.json?.gst_amount} cgst=${purchase.json?.cgst_rate} gstin=${purchase.json?.vendor_gst_number}`);

const billId = purchase.json?.id;
const linked = await db.query('select count(*)::int as n from pos.products where vendor_bill_id = $1', [billId]);
check('each saree points back at the bill', linked.rows[0].n === 3, `${linked.rows[0].n} linked`);

const noVendor = await call('POST', '/api/vendor-bills', { body: { bill: { bill_number: 'ZZ-NO-NAME' }, products: [] } });
check('a bill without a vendor name is refused', noVendor.status === 400, `${noVendor.status} ${noVendor.json?.error}`);

// A saree with a duplicate SKU must take the whole bill down with it, not leave a bill
// behind with half its sarees.
const beforeCount = (await db.query('select count(*)::int as n from pos.vendor_bills')).rows[0].n;
const clash = await call('POST', '/api/vendor-bills', {
    body: {
        bill: { company_name: 'ZZ Half Saved', bill_number: 'ZZ-HALF', total_amount: 100 },
        products: [saree('ZZB3-OK', 'ZZ Fine'), saree('ZZB3-1', 'ZZ Duplicate SKU')],
    },
});
const afterCount = (await db.query('select count(*)::int as n from pos.vendor_bills')).rows[0].n;
const orphan = (await db.query("select count(*)::int as n from pos.products where sku = 'ZZB3-OK'")).rows[0].n;
check('one bad saree rolls the whole bill back', clash.status === 500 && afterCount === beforeCount && orphan === 0, `status=${clash.status} bills=${afterCount} orphan sarees=${orphan}`);

// --- reading ---------------------------------------------------------------------------
const list = await call('GET', '/api/vendor-bills');
check('purchase list reads back with a saree count', list.status === 200 && list.json?.[0]?.product_count === '3', `${list.json?.length} bill(s), count=${list.json?.[0]?.product_count}`);

const single = await call('GET', `/api/vendor-bills/${billId}`);
check('one purchase bill reads back with its sarees', single.status === 200 && single.json?.products?.length === 3, single.json?.products?.length);

const ghost = await call('GET', '/api/vendor-bills/00000000-0000-0000-0000-0000000000ff');
check('unknown purchase bill is a 404', ghost.status === 404, ghost.status);

const asSalesman = await call('GET', '/api/vendor-bills', { token: salesman });
check('salesman cannot see purchase bills (they carry cost)', asSalesman.status === 403, asSalesman.status);

// --- editing ---------------------------------------------------------------------------
const edited = await call('PUT', `/api/vendor-bills/${billId}`, { body: { bill_number: 'ZZ-329-A', gst_amount: 2000 } });
check('a purchase bill can be corrected', edited.status === 200 && edited.json?.bill_number === 'ZZ-329-A' && Number(edited.json?.gst_amount) === 2000, `${edited.json?.bill_number} gst=${edited.json?.gst_amount}`);

const junkOnly = await call('PUT', `/api/vendor-bills/${billId}`, { body: { nonsense: 1 } });
check('a body of unknown fields is a 400, not the old 500', junkOnly.status === 400, `${junkOnly.status} ${junkOnly.json?.error}`);

const editGhost = await call('PUT', '/api/vendor-bills/00000000-0000-0000-0000-0000000000ff', { body: { bill_number: 'x' } });
check('editing a purchase bill that does not exist is a 404', editGhost.status === 404, editGhost.status);

// --- deleting --------------------------------------------------------------------------
// Sell one saree off this bill, then try to delete the bill.
const sale = await call('POST', '/api/bills', {
    body: { bill: { customer_name: 'ZZ Buyer' }, items: [{ product_id: purchase.json.products[0].id, quantity: 1, selling_price: 1000 }] },
});
const blocked = await call('DELETE', `/api/vendor-bills/${billId}`);
check('a purchase bill with a sold saree cannot be deleted', blocked.status === 409 && /already been sold/.test(blocked.json?.error || ''), `${blocked.status} ${blocked.json?.error}`);

await call('DELETE', `/api/bills/${sale.json.id}`);
const deleted = await call('DELETE', `/api/vendor-bills/${billId}`);
check('once nothing is sold, the bill and its 3 sarees go together', deleted.status === 200 && deleted.json?.sarees_removed === 3, `${deleted.status} removed=${deleted.json?.sarees_removed}`);

const deleteTwice = await call('DELETE', `/api/vendor-bills/${billId}`);
check('deleting it again is a 404', deleteTwice.status === 404, deleteTwice.status);

// --- clean up ---------------------------------------------------------------------------
await db.query("delete from pos.products where sku like 'ZZB3%'");
await db.query("delete from pos.vendor_bills where company_name like 'ZZ %'");
await db.query("delete from store.staff_users where provider_uid in ('zztest-founder','zztest-salesman')");
await db.query('delete from pos.bill_counters');
const left = (await db.query(
    `select (select count(*) from pos.products) as products, (select count(*) from pos.vendor_bills) as vendor_bills,
            (select count(*) from pos.bills) as bills, (select count(*) from store.staff_users where username like 'zz%') as staff`,
)).rows[0];
check('nothing left behind', Number(left.products) === 0 && Number(left.vendor_bills) === 0 && Number(left.bills) === 0 && Number(left.staff) === 0,
    `products=${left.products} vendor_bills=${left.vendor_bills} bills=${left.bills} staff=${left.staff}`);

await db.end();
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
