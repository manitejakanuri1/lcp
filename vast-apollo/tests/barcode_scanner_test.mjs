// The wired barcode scanner, driven in a real browser against the live POS.
//
// A scanner is a keyboard that types very fast, so the test types the same way: a burst of
// keystrokes with no gap, then Enter. What has to hold is that a burst adds the saree, that
// ordinary typing never does, that a scan into a text box is left to that box, and that an
// unknown code says so instead of silently doing nothing.
//
//   POS_PASSWORD=... node tests/barcode_scanner_test.mjs

import { chromium } from 'playwright';

const BASE = process.env.APP || 'https://inventory.lakshmisarees.in';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + String(detail).slice(0, 160) : ''}`);
    ok ? pass++ : fail++;
};

// The scanner sends characters about 10ms apart; a person cannot.
const scan = async (page, code) => {
    for (const character of code) await page.keyboard.press(character === '-' ? 'Minus' : character, { delay: 8 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
};

// Slowly, the way a hand types: this must NOT be taken for a scan.
const typeByHand = async (page, code) => {
    for (const character of code) {
        await page.keyboard.press(character === '-' ? 'Minus' : character);
        await page.waitForTimeout(140);
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.fill('input[name="username"], input[type="text"]', 'srinu');
await page.fill('input[type="password"]', process.env.POS_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForSelector('aside a[href="/pos"]', { timeout: 60000 });

// A saree that is on the shelf, read from the POS itself so the test is not pinned to one SKU.
const token = await page.evaluate(() => localStorage.getItem('lakshmi_pos_token'));
const products = await fetch(`${BASE}/api/products?status=available`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.json())
    .catch(() => []);
const saree = (Array.isArray(products) ? products : products.products ?? []).find((p) => p.status === 'available');
check('found a saree to scan', Boolean(saree), saree?.sku);
if (!saree) process.exit(1);

await page.click('aside a[href="/pos"]');
await page.waitForSelector('text=Cart', { timeout: 60000 });
await page.waitForTimeout(1000);

// ---- a scan adds the saree ----------------------------------------------------------------
await page.locator('body').click({ position: { x: 5, y: 5 } }); // focus nothing in particular
await scan(page, saree.sku);
let cart = await page.locator('body').innerText();
check('a scanned saree lands in the bill', cart.includes(saree.sku), cart.match(/Cart \([^)]*\)/)?.[0]);

// ---- the same saree twice --------------------------------------------------------------------
// Counted from the bill's own heading: the toast repeats the code, so counting it anywhere on
// the page counts the message as if it were a line on the bill.
const billLine = async () => (await page.locator('body').innerText()).match(/Cart \((\d+) items/)?.[1];
await scan(page, saree.sku);
check('the same saree is not added twice', (await billLine()) === '1', `bill holds ${await billLine()}`);

// ---- an unknown code -------------------------------------------------------------------------
await scan(page, 'S-NOTAREALCODE');
const afterUnknown = await page.locator('body').innerText();
check('an unknown code is refused out loud',
    /not found|already sold|Not added|S-NOTAREALCODE/i.test(afterUnknown), 'toast or error shown');
check('the bill is unchanged by a bad scan', (await billLine()) === '1', `bill holds ${await billLine()}`);

// ---- typing by hand is not a scan ------------------------------------------------------------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('text=Cart', { timeout: 60000 });
await page.waitForTimeout(1200);
await page.locator('body').click({ position: { x: 5, y: 5 } });
await typeByHand(page, saree.sku);
const afterTyping = await page.locator('body').innerText();
check('slow typing does not bill a saree', !afterTyping.includes(saree.sku), afterTyping.match(/Cart \([^)]*\)/)?.[0]);

// ---- a scan into the manual box belongs to the box --------------------------------------------
const manual = page.locator('input[placeholder*="SKU"]').first();
await manual.click();
await scan(page, saree.sku);
const afterBox = await page.locator('body').innerText();
check('a scan into the code box still adds the saree once', afterBox.includes(saree.sku),
    afterBox.match(/Cart \([^)]*\)/)?.[0]);
check('it is added once, not twice', (afterBox.match(new RegExp(saree.sku, 'g')) || []).length <= 2);

// ---- the other screens ------------------------------------------------------------------------
await page.click('aside a[href="/search"]');
await page.waitForSelector('input[placeholder*="Search"]', { timeout: 60000 });
await page.waitForTimeout(800);
await page.locator('body').click({ position: { x: 5, y: 5 } });
await scan(page, saree.sku);
check('a scan on the search screen fills the search box',
    (await page.locator('input[placeholder*="Search"]').first().inputValue()) === saree.sku.toUpperCase(),
    await page.locator('input[placeholder*="Search"]').first().inputValue());

await browser.close();
console.log(`\n${pass}/${pass + fail} checks passed`);
console.log('The bill was never finished, so nothing was sold and no stock moved.');
process.exit(fail ? 1 : 0);
