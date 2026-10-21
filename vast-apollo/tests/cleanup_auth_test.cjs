// Deletes the accounts left behind by tests/storefront_auth_test.mjs.
//
// Every test account uses the reserved .invalid domain, so nothing a real customer could own
// is matched. Sessions, credentials and auth events go with the customer row.
//
//   cloud-sql-proxy ... --port 5433
//   LAKSHMI_DB_PASS=... NODE_PATH=.../node_modules node tests/cleanup_auth_test.cjs

const { Client } = require('pg');

(async () => {
    const db = new Client({
        host: '127.0.0.1', port: 5433, database: 'lakshmi',
        user: 'schema_admin', password: process.env.LAKSHMI_DB_PASS,
    });
    await db.connect();

    const { rows } = await db.query(
        `select id, email::text as email from store.customers where email like '%@lakshmi-test.invalid'`);
    if (!rows.length) {
        console.log('no test accounts to delete');
    } else {
        for (const row of rows) console.log(`deleting ${row.email}`);
        // auth_events sets the customer to null rather than cascading, so the rows are taken
        // out by hand; everything else cascades from store.customers.
        await db.query(`delete from store.auth_events where email_tried like '%@lakshmi-test.invalid'`);
        await db.query(`delete from store.customers where email like '%@lakshmi-test.invalid'`);
        console.log(`deleted ${rows.length} test account(s)`);
    }

    const left = (await db.query(
        `select count(*)::int as n from store.customers where email like '%@lakshmi-test.invalid'`)).rows[0].n;
    console.log(`test accounts remaining: ${left}`);
    await db.end();
})().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });
