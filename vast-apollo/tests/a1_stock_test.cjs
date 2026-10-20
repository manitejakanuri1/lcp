// Prove A1 on a scratch database first: build the smallest shop that shows the fault,
// apply the migration, and check the numbers before and after. The live database is not
// touched by this file.
const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const MIGRATION = join(__dirname, '..', 'sql', 'a1_stock_from_pieces.sql');

const admin = () => new Client({ host: '127.0.0.1', port: 5433, database: 'postgres', user: 'schema_admin', password: process.env.PGPASS });
const scratch = () => new Client({ host: '127.0.0.1', port: 5433, database: 'a1_scratch', user: 'schema_admin', password: process.env.PGPASS });

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`); ok ? pass++ : fail++; };

(async () => {
    const a = admin();
    await a.connect();
    await a.query('DROP DATABASE IF EXISTS a1_scratch');
    await a.query('CREATE DATABASE a1_scratch');
    await a.end();

    const c = scratch();
    await c.connect();

    // The parts of the real shape these objects actually stand on - nothing more.
    await c.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE SCHEMA pos; CREATE SCHEMA store;
    CREATE TABLE pos.products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), sku TEXT, quantity INT NOT NULL DEFAULT 0,
      main_color_pieces INT NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'available',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE pos.product_colors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id UUID REFERENCES pos.products(id),
      color_name TEXT, pieces INT NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'available',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE store.products (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT);
    CREATE TABLE store.product_variants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id UUID REFERENCES store.products(id),
      color TEXT, position INT DEFAULT 0, is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE store.variant_inventory_items (
      inventory_product_id UUID PRIMARY KEY REFERENCES pos.products(id),
      variant_id UUID REFERENCES store.product_variants(id));
    CREATE TABLE store.inventory_reservations (
      inventory_product_id UUID PRIMARY KEY REFERENCES pos.products(id),
      order_id UUID NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
    CREATE VIEW store.variant_stock AS
      SELECT v.id AS variant_id, v.product_id,
             count(p.id) FILTER (WHERE p.status='available' AND (r.inventory_product_id IS NULL OR r.expires_at <= now()))::int AS stock
        FROM store.product_variants v
        LEFT JOIN store.variant_inventory_items vii ON vii.variant_id = v.id
        LEFT JOIN pos.products p ON p.id = vii.inventory_product_id
        LEFT JOIN store.inventory_reservations r ON r.inventory_product_id = p.id
       GROUP BY v.id, v.product_id;
  `);

    // One saree: Magenta 2 pieces as a colour row, Teal Blue 2 as the main photo colour.
    const { rows: [saree] } = await c.query(`INSERT INTO pos.products(sku, quantity, main_color_pieces) VALUES ('S-TEST', 4, 2) RETURNING id`);
    const { rows: [magenta] } = await c.query(`INSERT INTO pos.product_colors(product_id, color_name, pieces) VALUES ($1,'Magenta',2) RETURNING id`, [saree.id]);
    const { rows: [listing] } = await c.query(`INSERT INTO store.products(slug) VALUES ('test-saree') RETURNING id`);
    const { rows: [vMag] } = await c.query(`INSERT INTO store.product_variants(product_id, color) VALUES ($1,'Magenta') RETURNING id`, [listing.id]);
    const { rows: [vMain] } = await c.query(`INSERT INTO store.product_variants(product_id, color) VALUES ($1,'Teal Blue') RETURNING id`, [listing.id]);

    const stock = async (v) => (await c.query('SELECT stock FROM store.variant_stock WHERE variant_id=$1', [v])).rows[0].stock;

    // ---- the fault, as it stands today
    const beforeMag = await stock(vMag.id);
    const beforeMain = await stock(vMain.id);
    console.log(`\nBEFORE  Magenta ${beforeMag}   Teal Blue ${beforeMain}   (shop really has 2 and 2)`);
    check('today the shelf wrongly reads nought', beforeMag === 0 && beforeMain === 0, `${beforeMag} / ${beforeMain}`);

    // ---- apply A1
    await c.query(readFileSync(MIGRATION, 'utf8'));
    await c.query(`INSERT INTO store.variant_stock_source(variant_id, product_id, color_id) VALUES ($1,$2,$3)`, [vMag.id, saree.id, magenta.id]);
    await c.query(`INSERT INTO store.variant_stock_source(variant_id, product_id, color_id) VALUES ($1,$2,NULL)`, [vMain.id, saree.id]);

    const afterMag = await stock(vMag.id), afterMain = await stock(vMain.id);
    console.log(`AFTER   Magenta ${afterMag}   Teal Blue ${afterMain}\n`);
    check('the shelf now reads the real piece counts', afterMag === 2 && afterMain === 2, `${afterMag} / ${afterMain}`);

    // ---- holds
    const order = '11111111-1111-1111-1111-111111111111';
    await c.query('SELECT store.reserve_inventory($1,1,$2)', [vMag.id, order]);
    check('a hold takes one off the shelf', (await stock(vMag.id)) === 1);

    let refused = false;
    try { await c.query('SELECT store.reserve_inventory($1,5,$2)', [vMag.id, '22222222-2222-2222-2222-222222222222']); }
    catch (e) { refused = /INSUFFICIENT_STOCK/.test(e.message); }
    check('holding more than the shop has is refused', refused);

    await c.query('SELECT store.release_order_inventory($1)', [order]);
    check('releasing a hold puts it back', (await stock(vMag.id)) === 2);

    // ---- a sale
    await c.query('SELECT store.reserve_inventory($1,2,$2)', [vMag.id, order]);
    await c.query('SELECT store.commit_order_inventory($1)', [order]);
    const sold = (await c.query('SELECT pieces, status FROM pos.product_colors WHERE id=$1', [magenta.id])).rows[0];
    const parent = (await c.query('SELECT quantity FROM pos.products WHERE id=$1', [saree.id])).rows[0];
    check('a paid order takes the pieces off the shop', sold.pieces === 0 && sold.status === 'sold', `pieces ${sold.pieces}, ${sold.status}`);
    check('the saree own count follows', parent.quantity === 2, `quantity ${parent.quantity}`);
    check('the shelf shows sold out', (await stock(vMag.id)) === 0);

    // ---- a return
    await c.query('SELECT store.restock_order_inventory($1,$2,1)', [order, vMag.id]);
    check('a return puts a piece back', (await stock(vMag.id)) === 1);

    // ---- counter sale wins
    await c.query(`UPDATE pos.products SET status='sold' WHERE id=$1`, [saree.id]);
    check('a saree sold at the counter leaves the web shelf', (await stock(vMag.id)) === 0 && (await stock(vMain.id)) === 0);
    await c.query(`UPDATE pos.products SET status='available' WHERE id=$1`, [saree.id]);

    // ---- re-runnable
    await c.query(readFileSync(MIGRATION, 'utf8'));
    check('the migration can be run twice', (await stock(vMag.id)) === 1);

    await c.end();
    const a2 = admin();
    await a2.connect();
    await a2.query('DROP DATABASE a1_scratch');
    await a2.end();
    console.log(`\n${pass}/${pass + fail} checks passed`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
