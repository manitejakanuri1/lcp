// Sign in as a real person would, in a real browser, and walk every screen.
// Nothing is created or changed: this only proves the pages load and the login works.
//
//   npm run start:local                       (in one terminal)
//   npm install --no-save playwright          (once)
//   npx playwright install chromium           (once)
//   POS_PASSWORD=... node tests/clickthrough_test.mjs
//
// The password is the one for the username below, so pass it in the environment rather than
// writing it anywhere.
import { chromium } from 'playwright';

const BASE = process.env.APP || 'http://localhost:5199';
const USERNAME = 'srinu';
const PASSWORD = process.env.POS_PASSWORD;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
const failedRequests = [];
page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${new URL(r.url()).pathname}`); });

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + String(detail).slice(0, 160) : ''}`);
    ok ? pass++ : fail++;
};

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
check('login page opens', /sign in|login|username/i.test(await page.content()), (await page.title()) || '');

await page.fill('input[name="username"], input#username, input[type="text"]', USERNAME);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1500);

const afterLogin = new URL(page.url()).pathname;
check('signed in and left the login page', !afterLogin.includes('login'), `now at ${afterLogin}`);

const screens = [
    ['/dashboard', /dashboard|today|sales/i],
    ['/inventory', /inventory|saree|stock|sku/i],
    ['/pos', /scan|cart|bill|checkout/i],
    ['/sales-bills', /bill/i],
    ['/purchases', /purchase|vendor/i],
    ['/expenses', /expense|rent|salary/i],
    ['/analytics', /analytics|profit|sales/i],
    ['/profit-loss', /profit|loss|revenue/i],
    ['/gst-report', /gst|cgst|sgst/i],
    ['/search', /search/i],
    ['/users', /user|staff|srinu/i],
    ['/website', /website|colour|color/i],
];

for (const [path, expect] of screens) {
    const before = errors.length;
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => null);
    await page.waitForTimeout(600);
    const body = await page.textContent('body').catch(() => '');
    const landed = new URL(page.url()).pathname;
    const ok = !!res && !landed.includes('login') && expect.test(body);
    check(`${path} opens for a founder`, ok, ok ? `${errors.length - before} console errors` : `at ${landed}, first words: ${body.slice(0, 60).replace(/\s+/g, ' ')}`);
}

const usersPage = await page.goto(`${BASE}/users`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
check('the Users screen shows the srinu account', /srinu/i.test(await page.textContent('body')), usersPage?.status());

console.log('requests that answered 400 or worse:', failedRequests.join(', ') || 'none');
// The only acceptable one is the /auth/me on the very first page load, before anybody has
// signed in: the screens ask "is somebody already signed in?" and 401 is the honest answer.
const unexpected = failedRequests.filter((r) => !r.endsWith('/api/auth/me'));
check('nothing failed except the pre-login "is anyone signed in?" check', unexpected.length === 0, unexpected.join(', ') || 'none');

await browser.close();
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
