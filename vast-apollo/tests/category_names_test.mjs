// Shelf names live in one place.
//
// The POS used to keep its own typed copy of the shelf names, so renaming a shelf on the
// Website screen left the Colours screen showing the old word. This renames a shelf through
// the API, checks the POS screens show the new word without a release, and puts the name back.
//
//   POS_PASSWORD=... node tests/category_names_test.mjs

import { chromium } from 'playwright';

const BASE = process.env.APP || 'https://inventory.lakshmisarees.in';
const SLUG = 'cotton';            // nothing is on this shelf, so nothing on the website moves
const TEST_NAME = 'Cotton Test Name';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + String(detail).slice(0, 160) : ''}`);
    ok ? pass++ : fail++;
};

const token = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'srinu', password: process.env.POS_PASSWORD }),
}).then((r) => r.json()).then((d) => d.token);
if (!token) { console.error('could not log in'); process.exit(1); }

const api = async (path) => (await fetch(`${BASE}/api${path}`, { headers: { Authorization: `Bearer ${token}` } })).json();

const categories = await api('/website/categories');
check('the POS can read the shelves from the website', Array.isArray(categories) && categories.length > 0,
    categories?.map?.((c) => c.slug).join(' '));
const was = categories.find((c) => c.slug === SLUG);
check(`the test shelf exists`, Boolean(was), was?.title);
if (!was) process.exit(1);

// The rename goes in through the database the same way the Website screen's own saves do.
const rename = async (title) => {
    const res = await fetch(`${BASE}/api/website/categories/${SLUG}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title }),
    });
    return res.status;
};

const renamed = await rename(TEST_NAME);
check('a shelf can be renamed from the POS', renamed === 200, `HTTP ${renamed}`);

const after = await api('/website/categories');
check('the new name comes back from the API', after.find((c) => c.slug === SLUG)?.title === TEST_NAME,
    after.find((c) => c.slug === SLUG)?.title);

// ---- the screens -------------------------------------------------------------------------
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.fill('input[name="username"], input[type="text"]', 'srinu');
await page.fill('input[type="password"]', process.env.POS_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForSelector('aside a[href="/website"]', { timeout: 60000 });

await page.click('aside a[href="/website"]');
await page.waitForSelector('section, h1', { timeout: 60000 });
await page.waitForTimeout(2500);
// The dropdown lives inside a saree, so one has to be opened first. Clicking the saree's own
// name is what a person does; waiting for the dropdown is what makes the check honest.
// The screen opens on "To do", the sarees not yet on the website; any saree there has the
// same dropdown, so the first one is opened rather than hunting for a published name.
const saree = page.getByText(/^S-[A-Z0-9]{8}$/).first();
await saree.click({ timeout: 30000 });
await page.waitForSelector('select', { timeout: 30000 });
await page.waitForTimeout(1500);
const options = await page.locator('select option').allInnerTexts();
console.log('   dropdown:', options.join(' | ').slice(0, 200));
check('the Colours screen shows the new name, with no release',
    options.some((o) => o.includes(TEST_NAME)), options.join(' | ').slice(0, 140));

// ---- put it back ----------------------------------------------------------------------------
const restored = await rename(was.title);
check('the name was put back', restored === 200 &&
    (await api('/website/categories')).find((c) => c.slug === SLUG)?.title === was.title, was.title);

await browser.close();
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
