// The Website screen, driven in a real browser against the live shop.
//
// The API test beside this one proves the rules. This proves the screen: that a tick box moves
// the moment it is tapped rather than after the network answers, that the shelf counts beside
// the shelves move with it, that a change survives a reload, and that the two-part trust badge
// can be edited one part at a time without blanking the other. None of those can be read off
// the code - each one was wrong on a first attempt.
//
// Everything it changes is put back at the end.
//
//   POS_PASSWORD=... node tests/website_admin_ui_test.mjs

import { chromium, devices } from 'playwright';

const BASE = process.env.APP || 'https://inventory.lakshmisarees.in';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + String(detail).slice(0, 160) : ''}`);
    ok ? pass++ : fail++;
};

// Waits on the app shell rather than on a timer: a cold Cloud Run container can take a while
// to answer the first call, and a timer long enough for that makes every run slow.
const login = async (page) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.fill('input[name="username"], input[type="text"]', 'srinu');
    await page.fill('input[type="password"]', process.env.POS_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForSelector('aside', { timeout: 60000 });
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });

// Cloudflare injects its own analytics beacon into every page it serves and the shop's CSP
// refuses it; the 401 is the login screen asking who is there before anyone has logged in.
// Neither belongs to this screen, so neither is counted against it.
const errors = [];
const ours = (text) => !/cloudflareinsights|beacon\.min\.js|status of 401/.test(text);
page.on('console', (message) => { if (message.type() === 'error' && ours(message.text())) errors.push(message.text().slice(0, 140)); });
page.on('pageerror', (error) => errors.push('PAGEERROR ' + error.message.slice(0, 140)));

await login(page);
const nav = await page.locator('aside').first().innerText();
check('the menu has both Colours and Website', /Colours/.test(nav) && /Website/.test(nav), nav.replace(/\n+/g, ' | '));

await page.waitForSelector('aside a[href="/website-admin"]', { timeout: 60000 });
await page.click('aside a[href="/website-admin"]');
await page.waitForSelector('section', { timeout: 60000 });
await page.waitForTimeout(2000);

const open = async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('section', { timeout: 60000 });
    await page.waitForTimeout(2000);
};
const shelfBox = (saree, shelf) => page.locator('section').first()
    .locator('> div > div').filter({ hasText: saree }).first()
    .locator('label', { hasText: shelf }).locator('input');
const sectionBox = () => page.locator('section').nth(1).locator('input[type="checkbox"]').first();
const wording = () => page.locator('section').last();
// Each Input renders one label and one box in the same order, so a label's position is its box's.
const boxFor = async (needle) => {
    const labels = await wording().locator('label').allInnerTexts();
    const at = labels.findIndex((label) => label.toLowerCase().includes(needle));
    if (at < 0) throw new Error(`no box labelled ${needle} - have: ${labels.join(' | ')}`);
    return wording().locator('input').nth(at);
};

check('the page heading says Website', (await page.locator('h1').first().textContent())?.trim() === 'Website');
const body = await page.locator('body').innerText();
check('the three cards are there', /Shelves/.test(body) && /Home page sections/.test(body) && /Wording/.test(body));
check('an empty shelf is marked with a 0', /New Arrivals · 0/.test(body), body.match(/New Arrivals · \d+/)?.[0]);
check('the published sarees are listed', /SHANAYA/.test(body) && /SUNAYANA SILK/.test(body) && /SUNFLOWER/.test(body));
check('a section asking for an empty shelf is flagged', /shelf empty/.test(body));
check('the home page sections are listed', (await page.locator('section').nth(1).locator('input[type="checkbox"]').count()) === 13,
    `${await page.locator('section').nth(1).locator('input[type="checkbox"]').count()} tick boxes`);

// ---- a shelf ----------------------------------------------------------------------------
check('SHANAYA starts on Pattu & Silk only',
    (await shelfBox('SHANAYA', 'Pattu & Silk').isChecked()) && !(await shelfBox('SHANAYA', 'New Arrivals').isChecked()));
await shelfBox('SHANAYA', 'New Arrivals').click();
check('the box moves the moment it is tapped', await shelfBox('SHANAYA', 'New Arrivals').isChecked());
await page.waitForTimeout(2500);
check('the count beside the shelf went up', /New Arrivals · 1/.test(await page.locator('body').innerText()),
    (await page.locator('body').innerText()).match(/New Arrivals · \d+/)?.[0]);

await open();
check('the shelf survived a reload', await shelfBox('SHANAYA', 'New Arrivals').isChecked());
check('the saree kept its old shelf too', await shelfBox('SHANAYA', 'Pattu & Silk').isChecked());

// ---- a home page section -----------------------------------------------------------------
check('the first section is on', await sectionBox().isChecked());
await sectionBox().click();
check('the section box moves at once', !(await sectionBox().isChecked()));
await page.waitForTimeout(2500);
await open();
check('the section stayed off after a reload', !(await sectionBox().isChecked()));

// ---- wording, including the two-part badge ------------------------------------------------
const wasTitle = await (await boxFor('— title')).inputValue();
const wasSubtitle = await (await boxFor('— subtitle')).inputValue();
check('the badge is two boxes, not one locked line',
    (await wording().locator('label').allInnerTexts()).filter((label) => /badge/i.test(label)).length === 2);
check('nothing in the card is locked', (await wording().locator('input:disabled').count()) === 0);
check('the save button is off until something is typed', await wording().locator('button').isDisabled());

await (await boxFor('— subtitle')).fill('UI TEST SUBTITLE');
check('typing turns the save button on', !(await wording().locator('button').isDisabled()));
await wording().locator('button').click();
await page.waitForTimeout(2500);
await open();
check('the subtitle was saved', (await (await boxFor('— subtitle')).inputValue()) === 'UI TEST SUBTITLE');
check('the title beside it was not blanked', (await (await boxFor('— title')).inputValue()) === wasTitle,
    await (await boxFor('— title')).inputValue());

// ---- put everything back -------------------------------------------------------------------
await (await boxFor('— subtitle')).fill(wasSubtitle);
await wording().locator('button').click();
await page.waitForTimeout(2500);
await sectionBox().click();
await page.waitForTimeout(1500);
await shelfBox('SHANAYA', 'New Arrivals').click();
await page.waitForTimeout(2000);
await open();

const after = await page.locator('body').innerText();
check('the badge is back as it was',
    (await (await boxFor('— title')).inputValue()) === wasTitle && (await (await boxFor('— subtitle')).inputValue()) === wasSubtitle);
check('New Arrivals is empty again', /New Arrivals · 0/.test(after), after.match(/New Arrivals · \d+/)?.[0]);
check('the section is back on', await sectionBox().isChecked());
check('nothing broke in the page', errors.length === 0, errors.join(' | '));

// ---- phone ---------------------------------------------------------------------------------
const phone = await browser.newContext({ ...devices['Pixel 5'] });
const small = await phone.newPage();
await login(small);
await small.goto(`${BASE}/website-admin`, { waitUntil: 'networkidle' });
await small.waitForSelector('section', { timeout: 60000 });
await small.waitForTimeout(2000);
const onPhone = await small.locator('body').innerText();
check('the screen works on a phone', /Shelves/.test(onPhone) && /Wording/.test(onPhone));
check('no sideways scroll on a phone', await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    await small.evaluate(() => `${document.documentElement.scrollWidth}px of ${innerWidth}px`));

await browser.close();
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
