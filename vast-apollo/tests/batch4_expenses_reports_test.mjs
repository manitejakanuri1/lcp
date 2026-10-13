// Batch 4 proof: expenses, the two analytics numbers, the GST report and profit & loss,
// against the real Cloud SQL database. The money has to add up by hand, so this test builds a
// known shop month and checks every figure against arithmetic done here.
import jwt from 'jsonwebtoken';
import pg from 'pg';

const BASE = process.env.BASE || 'http://127.0.0.1:3099';
const SECRET = process.env.JWT_SECRET;
const FOUNDER_ID = '00000000-0000-0000-0000-000000000001';
const SALES_ID = '00000000-0000-0000-0000-000000000002';
const founder = jwt.sign({ id: FOUNDER_ID, username: 'zzfounder', role: 'founder' }, SECRET, { expiresIn: '10m' });
const salesman = jwt.sign({ id: SALES_ID, username: 'zzsales', role: 'salesman' }, SECRET, { expiresIn: '10m' });
const accounting = jwt.sign({ id: FOUNDER_ID, username: 'zzaccts', role: 'accounting' }, SECRET, { expiresIn: '10m' });

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
const near = (a, b, tolerance = 0.02) => Math.abs(Number(a) - Number(b)) <= tolerance;

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
    `insert into store.staff_users (id, provider, provider_uid, email, username, full_name, role, is_active, created_at, updated_at)
     values ($1,'firebase','zzb4-founder','zzb4-founder@example.invalid','zzb4founder','ZZ B4 Founder','founder',true,now(),now()),
            ($2,'firebase','zzb4-sales','zzb4-sales@example.invalid','zzb4sales','ZZ B4 Salesman','salesman',true,now(),now())
     on conflict (id) do nothing`,
    [FOUNDER_ID, SALES_ID],
);

const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);

// ---- expenses -------------------------------------------------------------------------
const rent = await call('POST', '/api/expenses', { body: { category: 'Rent', amount: 15000, description: 'ZZ shop rent', expense_date: today } });
check('expense saved', rent.status === 201 && Number(rent.json?.amount) === 15000, `${rent.status} ${rent.json?.amount}`);

const salary = await call('POST', '/api/expenses', { body: { category: 'Salary', amount: 8000, description: 'ZZ staff' } });
check('an expense with no date uses today', salary.status === 201 && salary.json?.expense_date?.slice(0, 10) === today, salary.json?.expense_date);

const badCategory = await call('POST', '/api/expenses', { body: { category: 'Chai', amount: 50 } });
check('an invented category is refused', badCategory.status === 400, `${badCategory.status} ${badCategory.json?.error}`);

const badAmount = await call('POST', '/api/expenses', { body: { category: 'Rent', amount: 'abc' } });
check('a mistyped amount is refused instead of saved as nothing', badAmount.status === 400, `${badAmount.status} ${badAmount.json?.error}`);

const zero = await call('POST', '/api/expenses', { body: { category: 'Rent', amount: 0 } });
check('a zero amount is refused', zero.status === 400, zero.status);

const list = await call('GET', '/api/expenses');
check('expense list reads back', list.status === 200 && list.json?.length === 2, `${list.json?.length} rows`);

const filtered = await call('GET', `/api/expenses?category=Rent&startDate=${today}&endDate=${today}`);
check('expenses filter by heading and dates', filtered.status === 200 && filtered.json?.length === 1, `${filtered.json?.length} rows`);

const edited = await call('PUT', `/api/expenses/${rent.json.id}`, { body: { amount: 16000 } });
check('founder can correct an amount', edited.status === 200 && Number(edited.json?.amount) === 16000, edited.json?.amount);

const salesmanEdit = await call('PUT', `/api/expenses/${rent.json.id}`, { token: salesman, body: { amount: 1 } });
check('a salesman cannot touch expenses', salesmanEdit.status === 403, salesmanEdit.status);

const accountingAdd = await call('POST', '/api/expenses', { token: accounting, body: { category: 'Electricity', amount: 2000 } });
check('an accounts person can add an expense', accountingAdd.status === 201, `${accountingAdd.status} ${accountingAdd.json?.error || ''}`);

const junkEdit = await call('PUT', `/api/expenses/${rent.json.id}`, { body: { nonsense: 1 } });
check('a body of unknown fields is a 400', junkEdit.status === 400, junkEdit.status);

const ghost = await call('PUT', '/api/expenses/00000000-0000-0000-0000-0000000000ff', { body: { amount: 10 } });
check('editing an expense that does not exist is a 404', ghost.status === 404, ghost.status);

const ghostDelete = await call('DELETE', '/api/expenses/00000000-0000-0000-0000-0000000000ff');
check('deleting one that does not exist is a 404', ghostDelete.status === 404, ghostDelete.status);

// Expenses now: Rent 16,000 + Salary 8,000 + Electricity 2,000 = 26,000
const EXPENSE_TOTAL = 26000;

// ---- a known shop month ---------------------------------------------------------------
// Buy: 2 sarees at 400 cost, 6 pieces each, on a local purchase bill of 10,500 incl 500 GST.
const purchase = await call('POST', '/api/vendor-bills', {
    body: {
        bill: {
            company_name: 'ZZ B4 Vendor', bill_number: 'ZZ-B4', bill_date: today,
            is_local_transaction: true, subtotal: 10000, gst_amount: 500, total_amount: 10500,
            cgst_rate: 2.5, sgst_rate: 2.5,
        },
        products: [1, 2].map((n) => ({
            sku: `ZZB4-${n}`, saree_name: `ZZ B4 Saree ${n}`, saree_type: 'Silk', material: 'Cotton',
            color: 'Red', quantity: 6, vendor_name: 'ZZ B4 Vendor', purchase_date: today,
            cost_price: 400, selling_price: 1050, selling_price_a: 1050, status: 'available',
        })),
    },
});
check('purchase bill for the test month saved', purchase.status === 201, purchase.status);

// Sell: 3 pieces of saree 1 at 1,050 each (GST-inclusive) = 3,150
const sale = await call('POST', '/api/bills', {
    body: { bill: { customer_name: 'ZZ B4 Customer' }, items: [{ product_id: purchase.json.products[0].id, quantity: 3, selling_price: 1050 }] },
});
check('sale for the test month saved', sale.status === 201 && Number(sale.json?.total_amount) === 3150, `${sale.status} total=${sale.json?.total_amount}`);

const SALES_INCL = 3150;
const SALES_EX_GST = SALES_INCL / 1.05;      // 3,000
const OUTPUT_GST = SALES_INCL - SALES_EX_GST; // 150
const COGS = 1200;                            // 3 pieces at 400

// ---- analytics ------------------------------------------------------------------------
const summary = await call('GET', '/api/analytics/summary');
check('analytics: sales and cost', summary.status === 200 && near(summary.json?.total_sales, SALES_INCL) && near(summary.json?.total_cost, COGS),
    `sales=${summary.json?.total_sales} cost=${summary.json?.total_cost}`);
check('analytics counts PIECES sold, not saree rows (3, not 1)', Number(summary.json?.total_items_sold) === 3, `items_sold=${summary.json?.total_items_sold}`);
check('analytics counts pieces in stock (3 left + 6 = 9, not 2 rows)', Number(summary.json?.total_items_in_stock) === 9, `in_stock=${summary.json?.total_items_in_stock}`);

const lastYear = await call('GET', '/api/analytics/summary?startDate=2020-01-01&endDate=2020-12-31');
check('a period with no sales reads zero, not the all-time count', Number(lastYear.json?.total_sales) === 0 && Number(lastYear.json?.total_items_sold) === 0,
    `sales=${lastYear.json?.total_sales} items_sold=${lastYear.json?.total_items_sold}`);

const daily = await call('GET', '/api/analytics/daily-sales?days=30');
check('daily sales has today with the right takings', daily.status === 200 && near(daily.json?.[0]?.total_amount, SALES_INCL) && Number(daily.json?.[0]?.bill_count) === 1,
    `${daily.json?.[0]?.sale_date} amount=${daily.json?.[0]?.total_amount} bills=${daily.json?.[0]?.bill_count}`);

const summaryAsSalesman = await call('GET', '/api/analytics/summary', { token: salesman });
check('a salesman cannot read the takings', summaryAsSalesman.status === 403, summaryAsSalesman.status);

// ---- GST report -----------------------------------------------------------------------
const gst = await call('GET', '/api/reports/gst');
const row = gst.json?.find((r) => r.month === month);
check('GST report has this month', gst.status === 200 && !!row, `${gst.json?.length} month(s)`);
check('input GST split half CGST half SGST on a local purchase', near(row?.input_cgst, 250) && near(row?.input_sgst, 250) && near(row?.input_igst, 0),
    `cgst=${row?.input_cgst} sgst=${row?.input_sgst} igst=${row?.input_igst}`);
check('output GST is the 5% inside the sale (150, split 75/75)', near(row?.output_total, OUTPUT_GST) && near(row?.output_cgst, 75) && near(row?.output_sgst, 75),
    `total=${row?.output_total} cgst=${row?.output_cgst}`);
check('purchase and sales totals on the GST report', near(row?.purchase_total, 10500) && near(row?.sales_total, SALES_INCL),
    `purchases=${row?.purchase_total} sales=${row?.sales_total}`);

// An out-of-state purchase must go to IGST instead.
const interState = await call('POST', '/api/vendor-bills', {
    body: { bill: { company_name: 'ZZ B4 Outstation', bill_date: today, is_local_transaction: false, gst_amount: 1000, total_amount: 21000 }, products: [] },
});
const gst2 = await call('GET', '/api/reports/gst');
const row2 = gst2.json?.find((r) => r.month === month);
check('an out-of-state purchase goes to IGST, not CGST/SGST', interState.status === 201 && near(row2?.input_igst, 1000) && near(row2?.input_cgst, 250),
    `igst=${row2?.input_igst} cgst=${row2?.input_cgst}`);

// ---- profit & loss --------------------------------------------------------------------
const pl = await call('GET', '/api/reports/profit-loss');
const m = pl.json?.months?.find((x) => x.month === month);
check('P&L revenue excludes the GST collected', pl.status === 200 && near(m?.revenue, SALES_EX_GST), `revenue=${m?.revenue} expected=${SALES_EX_GST.toFixed(2)}`);
check('P&L cost of goods is what those pieces cost', near(m?.cogs, COGS), `cogs=${m?.cogs}`);
check('P&L expenses add up', near(m?.expenses, EXPENSE_TOTAL), `expenses=${m?.expenses} expected=${EXPENSE_TOTAL}`);
check('P&L gross profit = revenue - cost', near(m?.gross_profit, SALES_EX_GST - COGS), `gross=${m?.gross_profit}`);
check('P&L net profit = gross - expenses', near(m?.net_profit, SALES_EX_GST - COGS - EXPENSE_TOTAL), `net=${m?.net_profit}`);
check('P&L breaks expenses down by heading', near(m?.expense_breakdown?.Rent, 16000) && near(m?.expense_breakdown?.Salary, 8000) && near(m?.expense_breakdown?.Electricity, 2000),
    JSON.stringify(m?.expense_breakdown));
check('P&L totals match the month', near(pl.json?.totals?.revenue, SALES_EX_GST) && near(pl.json?.totals?.net_profit, SALES_EX_GST - COGS - EXPENSE_TOTAL),
    `revenue=${pl.json?.totals?.revenue} net=${pl.json?.totals?.net_profit}`);

const plAsSalesman = await call('GET', '/api/reports/profit-loss', { token: salesman });
check('a salesman cannot read profit and loss', plAsSalesman.status === 403, plAsSalesman.status);

// ---- clean up --------------------------------------------------------------------------
await call('DELETE', `/api/bills/${sale.json.id}`);
await db.query("delete from pos.products where sku like 'ZZB4%'");
await db.query("delete from pos.vendor_bills where company_name like 'ZZ B4%'");
await db.query("delete from pos.expenses where description like 'ZZ%' or category = 'Electricity'");
await db.query("delete from store.staff_users where provider_uid like 'zzb4-%'");
await db.query('delete from pos.bill_counters');
await db.query("select setval('pos.barcode_seq', 10000000, false)");
const left = (await db.query(
    `select (select count(*) from pos.products) as products, (select count(*) from pos.bills) as bills,
            (select count(*) from pos.expenses) as expenses, (select count(*) from pos.vendor_bills) as vendor_bills,
            (select count(*) from store.staff_users where username like 'zz%') as staff`,
)).rows[0];
check('nothing left behind', Object.values(left).every((n) => Number(n) === 0), JSON.stringify(left));

await db.end();
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
