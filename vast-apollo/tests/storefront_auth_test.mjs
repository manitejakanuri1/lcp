// Customer sign-up and sign-in, against the live functions.
//
// The register function is new, so what is proved here is the things that only hold against
// the deployed service and its database: that a new account is created and signed in at once,
// that the same email cannot be taken twice, that a weak password is refused, and that the
// account it creates can then sign in through the older login function.
//
// The account it creates is deleted at the end by tests/cleanup_auth_test.cjs, which needs the
// Cloud SQL proxy; run that after this.
//
//   node tests/storefront_auth_test.mjs

const REGISTER = process.env.REGISTER_URL || 'https://auth-register-e5uho47kkq-el.a.run.app';
const LOGIN = process.env.LOGIN_URL || 'https://auth-login-e5uho47kkq-el.a.run.app';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + String(detail).slice(0, 160) : ''}`);
    ok ? pass++ : fail++;
};

const post = async (url, body) => {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
};

const email = `test-${Date.now()}@lakshmi-test.invalid`;
const password = 'saree-test-9981';
console.log(`test account: ${email}\n`);

const made = await post(REGISTER, { email, password, firstName: 'Test', lastName: 'Account', phone: '9876543210' });
check('a new customer can sign up', made.status === 201, `HTTP ${made.status} ${JSON.stringify(made.body)?.slice(0, 120)}`);
check('sign-up returns a usable token', typeof made.body?.accessToken === 'string' && made.body.accessToken.length > 20);
check('sign-up returns the profile', made.body?.profile?.email === email, JSON.stringify(made.body?.profile));
check('the display name is filled in', made.body?.profile?.displayName === 'Test Account', made.body?.profile?.displayName);

const again = await post(REGISTER, { email, password, firstName: 'Test' });
check('the same email cannot be taken twice', again.status === 400, `HTTP ${again.status} ${again.body?.error?.message}`);

const weak = await post(REGISTER, { email: `weak-${Date.now()}@lakshmi-test.invalid`, password: 'short', firstName: 'Test' });
check('a short password is refused', weak.status === 400, weak.body?.error?.message);

const badEmail = await post(REGISTER, { email: 'not-an-email', password, firstName: 'Test' });
check('a bad email is refused', badEmail.status === 400, badEmail.body?.error?.code);

const noName = await post(REGISTER, { email: `noname-${Date.now()}@lakshmi-test.invalid`, password });
check('a missing first name is refused', noName.status === 400, noName.body?.error?.message);

const badPhone = await post(REGISTER, { email: `phone-${Date.now()}@lakshmi-test.invalid`, password, firstName: 'Test', phone: 'call me' });
check('a bad phone number is refused', badPhone.status === 400, badPhone.body?.error?.code);

const signedIn = await post(LOGIN, { email, password });
check('the new account can sign in', signedIn.status === 200, `HTTP ${signedIn.status}`);
check('sign-in returns the same customer', signedIn.body?.profile?.email === email);

const wrongPassword = await post(LOGIN, { email, password: 'not-the-password' });
check('a wrong password is refused', wrongPassword.status === 401, wrongPassword.body?.error?.code);

console.log(`\n${pass}/${pass + fail} checks passed`);
console.log(`\nclean up with:  node tests/cleanup_auth_test.cjs   (deletes every @lakshmi-test.invalid account)`);
process.exit(fail ? 1 : 0);
