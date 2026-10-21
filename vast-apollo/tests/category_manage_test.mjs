// The shop keeps its own shelves: add, rename, hide, delete.
//
// Run against the live shop, because what is proved here is the refusals: a shelf that still
// holds sarees cannot be deleted, nor can one a menu link points at, and two shelves cannot
// share a name. Everything this creates is deleted at the end.
//
//   POS_PASSWORD=... node tests/category_manage_test.mjs

const BASE = process.env.APP || 'https://inventory.lakshmisarees.in';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + String(detail).slice(0, 170) : ''}`);
    ok ? pass++ : fail++;
};

const token = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.POS_USER || 'srinu', password: process.env.POS_PASSWORD }),
}).then((r) => r.json()).then((d) => d.token);
if (!token) { console.error('could not log in'); process.exit(1); }

const call = async (path, options = {}) => {
    const res = await fetch(`${BASE}/api${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    });
    return { status: res.status, body: await res.json().catch(() => null) };
};

const NAME = `Test Shelf ${Date.now()}`;
const SLUG = NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// ---- add ---------------------------------------------------------------------------------
const made = await call('/website/categories', { method: 'POST', body: JSON.stringify({ title: NAME }) });
check('a shelf can be added', made.status === 201, `HTTP ${made.status} ${JSON.stringify(made.body)}`);
check('its web address is built from the name', made.body?.slug === SLUG, made.body?.slug);

const listed = (await call('/website/categories')).body;
check('it appears in the list with a count of zero',
    listed.find((c) => c.slug === SLUG)?.products === 0, JSON.stringify(listed.find((c) => c.slug === SLUG)));

const twice = await call('/website/categories', { method: 'POST', body: JSON.stringify({ title: NAME }) });
check('the same name cannot be added twice', twice.status === 409, `HTTP ${twice.status} ${twice.body?.error}`);

const blank = await call('/website/categories', { method: 'POST', body: JSON.stringify({ title: '   ' }) });
check('a blank name is refused', blank.status === 400, blank.body?.error);

// ---- rename ------------------------------------------------------------------------------
const renamed = await call(`/website/categories/${SLUG}`, { method: 'PATCH', body: JSON.stringify({ title: `${NAME} renamed` }) });
check('a shelf can be renamed', renamed.status === 200 && renamed.body?.title === `${NAME} renamed`, JSON.stringify(renamed.body));
check('renaming leaves the web address alone', renamed.body?.slug === SLUG, renamed.body?.slug);

// ---- hide and show -------------------------------------------------------------------------
const hidden = await call(`/website/categories/${SLUG}`, { method: 'PATCH', body: JSON.stringify({ status: 'draft' }) });
check('a shelf can be hidden', hidden.status === 200 && hidden.body?.status === 'draft', JSON.stringify(hidden.body));
check('a hidden shelf still shows in the POS list',
    (await call('/website/categories')).body.some((c) => c.slug === SLUG));
check('a hidden shelf is gone from the website',
    !(await call('/website/site')).body.shelves.some((s) => s.slug === SLUG));

const shown = await call(`/website/categories/${SLUG}`, { method: 'PATCH', body: JSON.stringify({ status: 'published' }) });
check('it can be shown again', shown.status === 200 && shown.body?.status === 'published');

const rubbish = await call(`/website/categories/${SLUG}`, { method: 'PATCH', body: JSON.stringify({ status: 'maybe' }) });
check('a made-up state is refused', rubbish.status === 400, rubbish.body?.error);

// ---- the refusals that matter ----------------------------------------------------------------
const held = await call('/website/categories/pattu-silk', { method: 'DELETE' });
check('a shelf holding sarees cannot be deleted', held.status === 409, held.body?.error);

const linkedTo = await call('/website/categories/kota', { method: 'DELETE' });
check('a shelf a menu link points at cannot be deleted', linkedTo.status === 409, linkedTo.body?.error);

const missing = await call('/website/categories/no-such-shelf-at-all', { method: 'DELETE' });
check('deleting a shelf that does not exist is refused', missing.status === 404, missing.body?.error);

// ---- delete the test shelf ---------------------------------------------------------------------
const gone = await call(`/website/categories/${SLUG}`, { method: 'DELETE' });
check('an empty, unlinked shelf can be deleted', gone.status === 200, JSON.stringify(gone.body));
check('it is gone from the list', !(await call('/website/categories')).body.some((c) => c.slug === SLUG));

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
