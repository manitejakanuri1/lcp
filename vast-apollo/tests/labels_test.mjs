// Print a real label in a real browser and look at what came out.
//
// The label sheet opens in a blank window, which inherits the shop's security rules, and a
// script those rules refuse simply does not run - no error reaches the API, so neither the
// endpoint sweep nor the logs can see it. That is how the labels printed for days with the
// code in text and no bars, and Download PDF doing nothing at all. This opens the window the
// way a person does, then checks the drawing itself.
//
//   POS_PASSWORD=... node tests/labels_test.mjs
import { chromium } from 'playwright';
import { mkdtempSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.APP || 'https://inventory.lakshmisarees.in';
const USERNAME = process.env.POS_USER || 'srinu';
const PASSWORD = process.env.POS_PASSWORD;

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + String(detail).slice(0, 200) : ''}`);
    ok ? pass++ : fail++;
};

if (!PASSWORD) {
    console.error('POS_PASSWORD is not set.');
    process.exit(1);
}

const downloads = mkdtempSync(join(tmpdir(), 'labels-'));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await context.newPage();

// A script the rules refuse is reported here and nowhere else, so every one is collected.
const blocked = [];
page.on('console', (m) => { if (m.type() === 'error') blocked.push(m.text().slice(0, 160)); });

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[name="username"], input[type="text"]', USERNAME);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
check('sign in', true, page.url());

// Any saree already in the shop will do - nothing is created and nothing is changed.
await page.goto(`${BASE}/inventory`, { waitUntil: 'networkidle' });
// The inventory screen is a grid of cards, not a table; clicking a card opens that saree.
const card = page.locator('div.cursor-pointer').filter({ hasText: /S-/ }).first();
await card.waitFor({ timeout: 20_000 });
await card.click();
const barcodeButton = page.getByRole('button', { name: /View & Print Barcode/i });
await barcodeButton.waitFor({ timeout: 10_000 });
await barcodeButton.click();

// The sheet opens in its own window; printThermalLabels writes it with document.write.
const [sheet] = await Promise.all([
    context.waitForEvent('page', { timeout: 20_000 }),
    page.getByRole('button', { name: /Print Label/i }).first().click(),
]);
const sheetErrors = [];
sheet.on('console', (m) => { if (m.type() === 'error') sheetErrors.push(m.text().slice(0, 160)); });
await sheet.waitForLoadState('domcontentloaded');
check('the label sheet opens', true, await sheet.title());

// 1. Is there a barcode on the label, and is it a real one? A picture that failed to decode
// has no width, and a blank one would still be a sticker nobody can scan.
await sheet.waitForTimeout(1500);
const bars = await sheet.evaluate(async () => {
    const img = document.querySelector('.barcode-container img');
    if (!img) return { found: false };
    if (!img.complete) await new Promise((r) => { img.onload = r; img.onerror = r; });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, Math.max(1, canvas.height)).data;
    let dark = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 128) dark++;
    return { found: true, w: img.naturalWidth, h: img.naturalHeight, darkShare: dark / (pixels.length / 4) };
});
check('the barcode is on the label', bars.found && bars.w > 50, bars.found ? `${bars.w}x${bars.h}px` : 'no barcode picture');
// A real CODE128 is part black bars, part white gaps - all white or all black is not a barcode.
check('the barcode has real bars', bars.found && bars.darkShare > 0.15 && bars.darkShare < 0.85,
    bars.found ? `${Math.round(bars.darkShare * 100)}% black` : '');

// 2. The sheet must carry no script of its own: the rules refuse them, and a script that is
// refused is exactly how this broke.
const scripts = await sheet.evaluate(() => ({
    tags: document.querySelectorAll('script').length,
    inline: document.querySelectorAll('[onclick],[onload]').length,
}));
check('the sheet needs no script', scripts.tags === 0 && scripts.inline === 0,
    `${scripts.tags} script tag(s), ${scripts.inline} inline handler(s)`);

// 3. Download PDF - the button that did nothing at all.
const [download] = await Promise.all([
    Promise.race([
        page.waitForEvent('download', { timeout: 30_000 }),
        sheet.waitForEvent('download', { timeout: 30_000 }),
    ]).catch(() => null),
    sheet.getByRole('button', { name: /Download PDF/i }).click(),
]);
let size = 0;
if (download) {
    const file = join(downloads, download.suggestedFilename());
    await download.saveAs(file);
    size = statSync(file).size;
}
check('Download PDF saves a file', !!download && size > 2000,
    download ? `${download.suggestedFilename()}, ${Math.round(size / 1024)} KB` : 'no file was offered');

check('nothing was refused by the security rules', sheetErrors.length === 0, sheetErrors.join(' | '));

rmSync(downloads, { recursive: true, force: true });
await browser.close();

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
