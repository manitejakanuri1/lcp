// Batch 2 proof: the six billing routes against the real Cloud SQL database.
// A sale must take the stock off, and cancelling it must put the stock back - including
// for a colour line, which the old code never restored.
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

const stock = async (sku) => (await db.query('select quantity, status from pos.products where sku = $1', [sku])).rows[0];
const colourStock = async (id) => (await db.query('select pieces, status from pos.product_colors where id = $1', [id])).rows[0];

// pos.bills.salesman_id points at store.staff_users, so the two tokens above need real
// staff rows. Both are removed again at the end.
await db.query(
    `insert into store.staff_users (id, provider, provider_uid, email, full_name, role, is_active, created_at, updated_at)
     values ($1,'firebase','zztest-founder','zztest-founder@example.invalid','ZZ Test Founder','founder',true,now(),now()),
            ($2,'firebase','zztest-salesman','zztest-salesman@example.invalid','ZZ Test Salesman','salesman',true,now(),now())
     on conflict (id) do nothing`,
    ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'],
);

const base = {
    saree_type: 'Silk', material: 'Cotton', color: 'Red', vendor_name: 'ZZ Vendor',
    purchase_date: '2026-10-13', cost_price: 400, selling_price: 900, selling_price_a: 900, status: 'available',
};

// --- set up two sarees: one sold plainly, one sold by colour -------------------------
const plain = await call('POST', '/api/products', { body: { ...base, sku: 'ZZB2-PLAIN', saree_name: 'ZZ Plain', quantity: 5 } });
const multi = await call('POST', '/api/products', { body: { ...base, sku: 'ZZB2-COLOUR', saree_name: 'ZZ Colour', quantity: 8 } });
check('two test sarees created', plain.status === 201 && multi.status === 201, `${plain.status}/${multi.status}`);

const colour = (await db.query(
    `insert into pos.product_colors (product_id, color_name, sku, pieces) values ($1, 'Maroon', 'ZZB2-COLOUR-MRN', 3) returning id, barcode_no`,
    [multi.json.id],
)).rows[0];

// --- bill number ---------------------------------------------------------------------
const number = await call('GET', '/api/bills/generate-number');
check('bill number comes from the database', number.status === 200 && /^B-\d{8}-\d{4}$/.test(number.json?.billNumber || ''), number.json?.billNumber);

// --- a plain sale --------------------------------------------------------------------
const sale = await call('POST', '/api/bills', {
    token: salesman,
    body: {
        bill: { customer_name: 'ZZ Customer', customer_phone: '9999900000', payment_method: 'cash' },
        items: [{ product_id: plain.json.id, selling_price: 900, quantity: 2 }],
    },
});
check('salesman can make a bill', sale.status === 201 && sale.json?.bill_number, `${sale.status} ${sale.json?.bill_number}`);
check('bill total is worked out by the server', Number(sale.json?.total_amount) === 1800, `total=${sale.json?.total_amount}`);
check('cost total comes from the database, not the till', Number(sale.json?.total_cost) === 800, `cost=${sale.json?.total_cost}`);

const afterSale = await stock('ZZB2-PLAIN');
check('plain sale took 2 pieces off stock', afterSale.quantity === 3 && afterSale.status === 'available', `qty=${afterSale.quantity} status=${afterSale.status}`);

// --- a colour sale -------------------------------------------------------------------
const colourSale = await call('POST', '/api/bills', {
    body: {
        bill: { customer_name: 'ZZ Colour Customer', payment_method: 'upi' },
        items: [{ product_id: multi.json.id, color_id: colour.id, selling_price: 950, quantity: 1 }],
    },
});
check('colour sale saved', colourSale.status === 201, colourSale.status);
const colourAfter = await colourStock(colour.id);
const sareeAfter = await stock('ZZB2-COLOUR');
check('colour sale took the piece off the colour and the saree', colourAfter.pieces === 2 && sareeAfter.quantity === 7, `colour=${colourAfter.pieces} saree=${sareeAfter.quantity}`);

// --- reading bills -------------------------------------------------------------------
const list = await call('GET', '/api/bills');
check('bill list includes the lines', list.status === 200 && list.json?.length === 2 && list.json[0].bill_items?.length === 1, `${list.json?.length} bills`);

const single = await call('GET', `/api/bills/${sale.json.id}`);
check('one bill reads back with its saree details', single.status === 200 && single.json?.bill_items?.[0]?.products?.sku === 'ZZB2-PLAIN', single.json?.bill_items?.[0]?.products?.sku);

const salesmanRead = await call('GET', '/api/bills', { token: salesman });
check('salesman cannot open the bills list', salesmanRead.status === 403, salesmanRead.status);

const ghost = await call('GET', '/api/bills/00000000-0000-0000-0000-0000000000ff');
check('unknown bill is a 404', ghost.status === 404, ghost.status);

// --- editing a bill ------------------------------------------------------------------
const edited = await call('PUT', `/api/bills/${sale.json.id}`, { body: { customer_name: 'ZZ Renamed', notes: 'changed' } });
check('customer name can be corrected', edited.status === 200 && edited.json?.customer_name === 'ZZ Renamed', edited.json?.customer_name);

const moneyGuard = await call('PUT', `/api/bills/${sale.json.id}`, { body: { total_amount: 1 } });
check('the money on a bill cannot be rewritten through the API', moneyGuard.status === 400, `${moneyGuard.status} ${moneyGuard.json?.error}`);

const emptyLines = await call('POST', '/api/bills', { body: { bill: {}, items: [] } });
check('a bill with no items is refused', emptyLines.status === 400, emptyLines.status);

// --- cancelling bills ----------------------------------------------------------------
const cancelled = await call('DELETE', `/api/bills/${sale.json.id}`);
const backPlain = await stock('ZZB2-PLAIN');
check('cancelling the plain bill puts 2 pieces back', cancelled.status === 200 && backPlain.quantity === 5, `qty=${backPlain.quantity}`);

const cancelColour = await call('DELETE', `/api/bills/${colourSale.json.id}`);
const backColour = await colourStock(colour.id);
const backSaree = await stock('ZZB2-COLOUR');
check('cancelling the colour bill puts the piece back on BOTH the colour and the saree',
    cancelColour.status === 200 && backColour.pieces === 3 && backSaree.quantity === 8,
    `colour=${backColour.pieces} saree=${backSaree.quantity}`);

const cancelTwice = await call('DELETE', `/api/bills/${sale.json.id}`);
check('cancelling the same bill twice is a 404, not a second restock', cancelTwice.status === 404, cancelTwice.status);

// --- clean up ------------------------------------------------------------------------
await call('DELETE', `/api/products/${plain.json.id}`);
await call('DELETE', `/api/products/${multi.json.id}`);
const left = (await db.query(
    `select (select count(*) from pos.products) as products, (select count(*) from pos.product_colors) as colours,
            (select count(*) from pos.bills) as bills, (select count(*) from pos.bill_items) as items`,
)).rows[0];
check('nothing left behind', Number(left.products) === 0 && Number(left.colours) === 0 && Number(left.bills) === 0 && Number(left.items) === 0,
    `products=${left.products} colours=${left.colours} bills=${left.bills} items=${left.items}`);

await db.query("delete from store.staff_users where provider_uid in ('zztest-founder','zztest-salesman')");
const staffLeft = (await db.query("select count(*) as n from store.staff_users")).rows[0].n;
check('test staff rows removed', Number(staffLeft) === 0, `staff_users=${staffLeft}`);

await db.end();
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
