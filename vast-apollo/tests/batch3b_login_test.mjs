// Batch 3b proof: login, the signed-in user, and the four staff routes, against the real
// Cloud SQL database and the real Firebase Auth project. Passwords are never stored by us, so
// this test creates its own throwaway logins through the API and deletes them at the end.
import jwt from 'jsonwebtoken';
import pg from 'pg';

const BASE = process.env.BASE || 'http://127.0.0.1:3099';
const SECRET = process.env.JWT_SECRET;
const FOUNDER_ID = '00000000-0000-0000-0000-000000000001';
const founderToken = jwt.sign({ id: FOUNDER_ID, username: 'zzboot', role: 'founder' }, SECRET, { expiresIn: '10m' });

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
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + String(detail).slice(0, 220) : ''}`);
    ok ? pass++ : fail++;
};

async function call(method, path, { token = founderToken, body, noAuth = false } = {}) {
    const res = await fetch(BASE + path, {
        method,
        headers: { ...(noAuth ? {} : { Authorization: `Bearer ${token}` }), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* keep the text */ }
    return { status: res.status, json, text };
}

// A first founder has to exist before anyone can be registered through the API; in real life
// this row is made once by hand. Its own login is created below through the API itself.
await db.query(
    `insert into store.staff_users (id, provider, provider_uid, email, username, full_name, role, is_active, created_at, updated_at)
     values ($1,'firebase','zzboot-no-login','zzboot@example.invalid','zzboot','ZZ Bootstrap Founder','founder',true,now(),now())
     on conflict (id) do nothing`,
    [FOUNDER_ID],
);

const PASSWORD = 'ZZtest-' + Math.random().toString(36).slice(2, 10);
const NEW_PASSWORD = 'ZZnew-' + Math.random().toString(36).slice(2, 10);

// --- registering staff ---------------------------------------------------------------
const created = await call('POST', '/api/auth/register', {
    body: { username: 'zzsales1', password: PASSWORD, fullName: 'ZZ Test Salesman', role: 'salesman' },
});
check('founder can register a salesman', created.status === 201 && created.json?.user?.role === 'salesman', `${created.status} ${created.json?.user?.email || created.json?.error}`);
const salesId = created.json?.user?.id;

const accounting = await call('POST', '/api/auth/register', {
    body: { username: 'zzaccts', password: PASSWORD, fullName: 'ZZ Test Accounts', role: 'accounting' },
});
check('the accounting role is now allowed (it was refused by the database before)', accounting.status === 201, `${accounting.status} ${accounting.json?.error || accounting.json?.user?.role}`);
const acctId = accounting.json?.user?.id;

const noEmail = await db.query('select email from store.staff_users where username = $1', ['zzsales1']);
check('staff with no email of their own get one at the shop domain', /@pos\.lakshmisarees\.in$/.test(noEmail.rows[0]?.email || ''), noEmail.rows[0]?.email);

const dupe = await call('POST', '/api/auth/register', { body: { username: 'zzsales1', password: PASSWORD, role: 'salesman' } });
check('a username cannot be taken twice', dupe.status === 400 && /already exists/.test(dupe.json?.error || ''), `${dupe.status} ${dupe.json?.error}`);

const weak = await call('POST', '/api/auth/register', { body: { username: 'zzweak', password: '123', role: 'salesman' } });
check('a short password is refused', weak.status === 400, `${weak.status} ${weak.json?.error}`);
const weakLeft = await db.query('select count(*)::int as n from store.staff_users where username = $1', ['zzweak']);
check('the refused registration left no staff row', weakLeft.rows[0].n === 0, weakLeft.rows[0].n);

const badRole = await call('POST', '/api/auth/register', { body: { username: 'zzbadrole', password: PASSWORD, role: 'manager' } });
check('an unknown role is refused', badRole.status === 400, `${badRole.status} ${badRole.json?.error}`);

const asSalesman = await call('POST', '/api/auth/register', {
    token: jwt.sign({ id: salesId, username: 'zzsales1', role: 'salesman' }, SECRET, { expiresIn: '5m' }),
    body: { username: 'zzsneak', password: PASSWORD, role: 'founder' },
});
check('a salesman cannot register anyone', asSalesman.status === 403, asSalesman.status);

// --- logging in ----------------------------------------------------------------------
const login = await call('POST', '/api/auth/login', { noAuth: true, body: { username: 'zzsales1', password: PASSWORD } });
check('a staff member can log in with username and password', login.status === 200 && login.json?.token, `${login.status} ${login.json?.user?.username || login.json?.error}`);
check('the role comes from the staff row, not the request', login.json?.user?.role === 'salesman', login.json?.user?.role);

const wrongPass = await call('POST', '/api/auth/login', { noAuth: true, body: { username: 'zzsales1', password: 'definitely-wrong' } });
check('a wrong password is refused', wrongPass.status === 401, wrongPass.status);

const noSuchUser = await call('POST', '/api/auth/login', { noAuth: true, body: { username: 'zznobody', password: PASSWORD } });
check('an unknown username answers exactly like a wrong password', noSuchUser.status === 401 && noSuchUser.json?.error === wrongPass.json?.error, `${noSuchUser.status} "${noSuchUser.json?.error}"`);

const emptyLogin = await call('POST', '/api/auth/login', { noAuth: true, body: {} });
check('an empty login is a 400', emptyLogin.status === 400, emptyLogin.status);

// --- who am I ------------------------------------------------------------------------
const me = await call('GET', '/api/auth/me', { token: login.json.token });
check('the signed-in user reads back from the staff row', me.status === 200 && me.json?.user?.username === 'zzsales1', me.json?.user?.username);

// --- the staff list ------------------------------------------------------------------
const users = await call('GET', '/api/users');
check('founder sees the staff list', users.status === 200 && users.json?.length >= 3, `${users.json?.length} staff`);
const leaked = users.json?.some((u) => 'password' in u || 'password_hash' in u);
check('no password of any kind comes back from the API', !leaked, leaked ? 'a password field was returned' : 'none');

const usersAsSalesman = await call('GET', '/api/users', { token: login.json.token });
check('a salesman cannot see the staff list', usersAsSalesman.status === 403, usersAsSalesman.status);

// --- changing a role -----------------------------------------------------------------
const promoted = await call('PUT', `/api/users/${salesId}/role`, { body: { role: 'accounting' } });
check('founder can change a role', promoted.status === 200 && promoted.json?.role === 'accounting', promoted.json?.role);
await call('PUT', `/api/users/${salesId}/role`, { body: { role: 'salesman' } });

const selfDemote = await call('PUT', `/api/users/${FOUNDER_ID}/role`, { body: { role: 'salesman' } });
check('the founder cannot demote themselves (the shop would lock itself out)', selfDemote.status === 400, `${selfDemote.status} ${selfDemote.json?.error}`);

const roleGhost = await call('PUT', '/api/users/00000000-0000-0000-0000-0000000000ff/role', { body: { role: 'salesman' } });
check('changing the role of someone who does not exist is a 404', roleGhost.status === 404, roleGhost.status);

// --- resetting a password ------------------------------------------------------------
const reset = await call('PUT', `/api/users/${salesId}/password`, { body: { password: NEW_PASSWORD } });
check('founder can reset a password', reset.status === 200, `${reset.status} ${reset.json?.error || ''}`);

const oldPass = await call('POST', '/api/auth/login', { noAuth: true, body: { username: 'zzsales1', password: PASSWORD } });
const newPass = await call('POST', '/api/auth/login', { noAuth: true, body: { username: 'zzsales1', password: NEW_PASSWORD } });
check('the old password stops working and the new one works', oldPass.status === 401 && newPass.status === 200, `old=${oldPass.status} new=${newPass.status}`);

const shortReset = await call('PUT', `/api/users/${salesId}/password`, { body: { password: '12345' } });
check('a short reset password is refused', shortReset.status === 400, shortReset.status);

// --- switching a login off -----------------------------------------------------------
const off = await call('PUT', `/api/users/${salesId}`, { body: { is_active: false } });
check('founder can switch a login off', off.status === 200 && off.json?.is_active === false, off.json?.is_active);

const blocked = await call('POST', '/api/auth/login', { noAuth: true, body: { username: 'zzsales1', password: NEW_PASSWORD } });
check('a switched-off staff member cannot log in', blocked.status === 401 || blocked.status === 403, blocked.status);

const staleToken = await call('GET', '/api/auth/me', { token: login.json.token });
check('their old session dies on the next page load, not in seven days', staleToken.status === 401, staleToken.status);

const selfOff = await call('PUT', `/api/users/${FOUNDER_ID}`, { body: { is_active: false } });
check('the founder cannot switch off their own login', selfOff.status === 400, selfOff.status);

const renamed = await call('PUT', `/api/users/${acctId}`, { body: { full_name: 'ZZ Accounts Renamed' } });
check('a staff name can be corrected', renamed.status === 200 && renamed.json?.full_name === 'ZZ Accounts Renamed', renamed.json?.full_name);

const junk = await call('PUT', `/api/users/${acctId}`, { body: { nonsense: 1 } });
check('a body of unknown fields is a 400', junk.status === 400, junk.status);

// --- clean up: the staff rows AND the Firebase logins --------------------------------
const uids = (await db.query("select provider_uid from store.staff_users where username like 'zz%' and provider_uid <> 'zzboot-no-login'")).rows.map((r) => r.provider_uid);
const { GoogleAuth } = await import('google-auth-library');
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const accessToken = (await (await auth.getClient()).getAccessToken()).token;
let removedLogins = 0;
for (const uid of uids) {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${process.env.GCP_PROJECT_ID || 'lakshmi-sarees'}/accounts:delete`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            // Same reason as api/firebase.js: a personal Google login has to name the project.
            'x-goog-user-project': process.env.GCP_PROJECT_ID || 'lakshmi-sarees',
        },
        body: JSON.stringify({ localId: uid }),
    });
    if (res.ok) removedLogins++;
}
await db.query("delete from store.staff_users where username like 'zz%'");
const left = (await db.query('select count(*)::int as n from store.staff_users')).rows[0].n;
check('every test staff row and Firebase login removed', left === 0 && removedLogins === uids.length, `staff rows=${left} logins deleted=${removedLogins}/${uids.length}`);

await db.end();
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
