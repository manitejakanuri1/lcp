// The shop can now change its own website: shelves, home page sections and wording.
//
// Run against the live shop, because the things being proved are refusals and permissions -
// a shelf that does not exist, a wording key the website never reads, a section switched off
// by a role that should not be able to - and those only hold if the deployed service and the
// deployed grants agree. Every change is put back at the end.
//
//   POS_PASSWORD=... node tests/website_admin_test.mjs

const BASE = process.env.APP || 'https://inventory.lakshmisarees.in';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + String(detail).slice(0, 180) : ''}`);
    ok ? pass++ : fail++;
};

const token = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.POS_USER || 'srinu', password: process.env.POS_PASSWORD }),
}).then((r) => r.json()).then((d) => d.token);
if (!token) {
    console.error('could not log in');
    process.exit(1);
}

const call = async (path, options = {}) => {
    const res = await fetch(`${BASE}/api${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    });
    return { status: res.status, body: await res.json().catch(() => null) };
};

// ---- what the screen reads -------------------------------------------------------------
const first = await call('/website/site');
check('the screen can read the website settings', first.status === 200, `HTTP ${first.status}`);
const site = first.body;
check('the shelves come back with a saree count', Array.isArray(site.shelves) && site.shelves.every((s) => typeof s.products === 'number'),
    site.shelves?.map((s) => `${s.slug}:${s.products}`).join(' '));
check('the home page sections come back', Array.isArray(site.sections) && site.sections.length > 0, `${site.sections?.length} sections`);
check('the wording comes back', Array.isArray(site.settings) && site.settings.some((s) => s.key === 'tagline'));
check('the published sarees come back with their shelves', site.products.length > 0 && Array.isArray(site.products[0].shelves),
    site.products?.map((p) => `${p.saree_name}:[${p.shelves}]`).join(' '));

const saree = site.products[0];
const was = [...saree.shelves];
const emptyShelf = site.shelves.find((shelf) => shelf.products === 0);
check('there is an empty shelf to test with', Boolean(emptyShelf), emptyShelf?.slug);

// ---- shelves ----------------------------------------------------------------------------
const added = await call(`/website/products/${saree.id}/shelves`, {
    method: 'PUT',
    body: JSON.stringify({ shelves: [...was, emptyShelf.slug] }),
});
check('a saree can be put on another shelf', added.status === 200, JSON.stringify(added.body));

const afterAdd = (await call('/website/site')).body;
const nowOn = afterAdd.products.find((p) => p.id === saree.id).shelves;
check('the new shelf is remembered', nowOn.includes(emptyShelf.slug), `[${nowOn}]`);
check('the old shelves are kept', was.every((slug) => nowOn.includes(slug)), `[${nowOn}]`);
check('the empty shelf now counts one saree',
    afterAdd.shelves.find((s) => s.slug === emptyShelf.slug).products === 1,
    `${afterAdd.shelves.find((s) => s.slug === emptyShelf.slug).products}`);

const noShelf = await call(`/website/products/${saree.id}/shelves`, { method: 'PUT', body: JSON.stringify({ shelves: [] }) });
check('a saree cannot be left on no shelf at all', noShelf.status === 400, `HTTP ${noShelf.status} ${noShelf.body?.error}`);

const madeUp = await call(`/website/products/${saree.id}/shelves`, {
    method: 'PUT',
    body: JSON.stringify({ shelves: [...was, 'shelf-that-does-not-exist'] }),
});
check('a shelf that does not exist is refused', madeUp.status === 400, `HTTP ${madeUp.status} ${madeUp.body?.error}`);

const stillThere = (await call('/website/site')).body.products.find((p) => p.id === saree.id).shelves;
check('a refused change left the shelves alone', stillThere.includes(emptyShelf.slug) && was.every((s) => stillThere.includes(s)), `[${stillThere}]`);

const notPublished = await call('/website/products/00000000-0000-0000-0000-000000000000/shelves', {
    method: 'PUT',
    body: JSON.stringify({ shelves: [was[0]] }),
});
check('a saree that is not on the website is refused', notPublished.status === 404, `HTTP ${notPublished.status}`);

// ---- home page sections ------------------------------------------------------------------
const section = site.sections.find((s) => s.is_active);
const off = await call(`/website/sections/${section.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) });
check('a home page section can be switched off', off.status === 200 && off.body.is_active === false, JSON.stringify(off.body));
check('the section stays off when read back',
    (await call('/website/site')).body.sections.find((s) => s.id === section.id).is_active === false);

const rubbish = await call(`/website/sections/${section.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: 'yes' }) });
check('a section needs a true or false, not a word', rubbish.status === 400, `HTTP ${rubbish.status} ${rubbish.body?.error}`);

const missingSection = await call('/website/sections/00000000-0000-0000-0000-000000000000', {
    method: 'PATCH',
    body: JSON.stringify({ is_active: false }),
});
check('a section that does not exist is refused', missingSection.status === 404, `HTTP ${missingSection.status}`);

// ---- wording -----------------------------------------------------------------------------
const tagline = site.settings.find((s) => s.key === 'tagline');
const saved = await call('/website/settings', { method: 'PUT', body: JSON.stringify({ tagline: 'TEST TAGLINE' }) });
check('the wording can be changed', saved.status === 200, JSON.stringify(saved.body));
check('the new wording is read back',
    (await call('/website/site')).body.settings.find((s) => s.key === 'tagline').value === 'TEST TAGLINE');

const unknownKey = await call('/website/settings', { method: 'PUT', body: JSON.stringify({ not_a_real_setting: 'x' }) });
check('a setting the website never reads is refused', unknownKey.status === 400, `HTTP ${unknownKey.status} ${unknownKey.body?.error}`);
check('the refused save left the tagline alone',
    (await call('/website/settings', { method: 'PUT', body: JSON.stringify({}) })).status === 400);

// ---- put everything back ------------------------------------------------------------------
await call(`/website/products/${saree.id}/shelves`, { method: 'PUT', body: JSON.stringify({ shelves: was }) });
await call(`/website/sections/${section.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: true }) });
await call('/website/settings', { method: 'PUT', body: JSON.stringify({ tagline: tagline.value }) });

const back = (await call('/website/site')).body;
check('the shelves are back as they were',
    JSON.stringify(back.products.find((p) => p.id === saree.id).shelves.sort()) === JSON.stringify([...was].sort()),
    `[${back.products.find((p) => p.id === saree.id).shelves}] vs [${was}]`);
check('the section is switched back on', back.sections.find((s) => s.id === section.id).is_active === true);
check('the tagline is back as it was', back.settings.find((s) => s.key === 'tagline').value === tagline.value,
    String(back.settings.find((s) => s.key === 'tagline').value));

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
