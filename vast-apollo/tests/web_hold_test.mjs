// The counter must not sell what a website order is holding.
//
// This is the one fault that costs a real saree: the shopper pays online for a piece that
// has just gone out of the door across the counter. It cannot be caught by reading the code
// alone, because it only appears when both tills touch the same pieces, so this puts a real
// hold on a real published colour and then tries to sell it on the live shop.
//
//   POS_PASSWORD=... LAKSHMI_DB_PASS=... node tests/web_hold_test.mjs
//
// Every hold and every bill it creates is removed again at the end.
import pg from 'pg';

const BASE = process.env.APP || 'https://inventory.lakshmisarees.in';
const ORDER = '33333333-3333-3333-3333-333333333333';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + String(detail).slice(0, 180) : ''}`);
    ok ? pass++ : fail++;
};

const db = new pg.Client({
    host: '127.0.0.1', port: 5433, database: 'lakshmi',
    user: 'schema_admin', password: process.env.LAKSHMI_DB_PASS,
});
await db.connect();

const token = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.POS_USER || 'srinu', password: process.env.POS_PASSWORD }),
}).then((r) => r.json()).then((d) => d.token);

const sell = async (productId, colorId, quantity) => {
    const res = await fetch(`${BASE}/api/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            bill: { customer_name: 'WEB HOLD TEST', customer_phone: '0000000000' },
            items: [{ product_id: productId, color_id: colorId, quantity }],
        }),
    });
    return { status: res.status, body: await res.json() };
};

// A colour that is really on the website, with a real piece count.
const { rows: [target] } = await db.query(
    `select s.variant_id, s.color_id, s.product_id, c.color_name, c.pieces
       from store.variant_stock_source s
       join pos.product_colors c on c.id = s.color_id
       join pos.products p on p.id = s.product_id
      where p.on_website and c.pieces > 0
      order by c.pieces desc limit 1`,
);
if (!target) {
    console.error('No published colour with pieces to test against. Publish a saree first.');
    process.exit(1);
}
console.log(`testing on ${target.color_name}, ${target.pieces} pieces in the shop\n`);

const stock = async () => (await db.query('select stock from store.variant_stock where variant_id = $1', [target.variant_id])).rows[0].stock;
const pieces = async () => (await db.query('select pieces from pos.product_colors where id = $1', [target.color_id])).rows[0].pieces;
const bills = [];
const startPieces = await pieces();

try {
    // ---- no hold: the counter sells exactly as it always did -----------------------------
    check('with no hold, the web shelf shows every piece', (await stock()) === startPieces, `${await stock()} of ${startPieces}`);

    // ---- a website order holds every piece ------------------------------------------------
    await db.query(
        `insert into store.variant_reservations (variant_id, order_id, qty, expires_at)
         values ($1, $2, $3, now() + interval '15 minutes')
         on conflict (order_id, variant_id) do update set qty = excluded.qty, expires_at = excluded.expires_at`,
        [target.variant_id, ORDER, startPieces],
    );
    check('the hold empties the web shelf', (await stock()) === 0, `shelf reads ${await stock()}`);

    const refused = await sell(target.product_id, target.color_id, 1);
    check('the counter refuses to sell a held piece', refused.status === 409, `http ${refused.status}: ${refused.body.error || ''}`);
    check('the refusal says how many are held', /held by a website order/i.test(refused.body.error || ''), refused.body.error);
    check('nothing was taken off the shop', (await pieces()) === startPieces, `${await pieces()} of ${startPieces}`);

    // ---- the website holds only part of the stock -----------------------------------------
    await db.query('update store.variant_reservations set qty = $2 where order_id = $1', [ORDER, startPieces - 1]);
    const partly = await sell(target.product_id, target.color_id, startPieces);
    check('asking for more than is free is refused', partly.status === 409, `http ${partly.status}`);
    check('the refusal names the number still sellable', /sell 1 now/i.test(partly.body.error || ''), partly.body.error);

    const allowed = await sell(target.product_id, target.color_id, 1);
    if (allowed.status === 201) bills.push(allowed.body.id);
    check('the piece that is free still sells', allowed.status === 201, `http ${allowed.status}: ${allowed.body.error || allowed.body.bill_number}`);
    check('that sale came off the shop', (await pieces()) === startPieces - 1, `${await pieces()} of ${startPieces}`);

    // ---- a hold that has run out blocks nobody ---------------------------------------------
    await db.query('update store.variant_reservations set expires_at = now() - interval \'1 minute\' where order_id = $1', [ORDER]);
    const afterExpiry = await sell(target.product_id, target.color_id, 1);
    if (afterExpiry.status === 201) bills.push(afterExpiry.body.id);
    check('an expired hold no longer blocks the counter', afterExpiry.status === 201, `http ${afterExpiry.status}: ${afterExpiry.body.error || ''}`);
    check('the expired hold was swept away',
        (await db.query('select count(*)::int n from store.variant_reservations where order_id = $1', [ORDER])).rows[0].n === 0);
} finally {
    // Put the shop back exactly as it was: the test bills go, and so do their pieces.
    for (const id of bills) {
        await fetch(`${BASE}/api/bills/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    }
    await db.query('delete from store.variant_reservations where order_id = $1', [ORDER]);
    const back = await pieces();
    check('the shop is back where it started', back === startPieces, `${back} of ${startPieces}`);
    await db.end();
}

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
