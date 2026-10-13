// Create one staff member: a Firebase login plus their row in store.staff_users.
//
// Used for the first founder, before anybody can sign in to add staff the normal way (the
// Users screen). The password is never typed here and never passed on the command line - it is
// read from the environment, so it stays out of this file, out of the shell history and out of
// any transcript:
//
//   setx POS_NEW_PASSWORD "the password"        (in a normal PowerShell window, once)
//   node scripts/create-staff.mjs srinu founder "Srinu"
//   setx POS_NEW_PASSWORD ""                    (clear it again)
//
// If anything fails half way the Firebase login is removed again, so a login the shop cannot
// see in its Users screen is never left behind.
import 'dotenv/config';
import { one } from '../api/db.js';
import { createLogin, deleteLogin } from '../api/firebase.js';

const ROLES = ['founder', 'accounting', 'salesman', 'admin'];
const [username, role = 'founder', fullName] = process.argv.slice(2);
const password = process.env.POS_NEW_PASSWORD;
const domain = process.env.STAFF_EMAIL_DOMAIN || 'pos.lakshmisarees.in';

function fail(message) {
    console.error(`\n${message}\n`);
    process.exit(1);
}

if (!username) fail('Usage: node scripts/create-staff.mjs <username> [role] [full name]');
if (!ROLES.includes(role)) fail(`Role must be one of: ${ROLES.join(', ')}`);
if (!password) fail('POS_NEW_PASSWORD is not set. Set it in a normal PowerShell window with:\n  setx POS_NEW_PASSWORD "the password"\nthen open a new terminal and run this again.');
if (password.length < 8) fail('Use at least 8 characters.');

const name = username.trim().toLowerCase();
const email = `${name}@${domain}`;

const taken = await one('select username, role from store.staff_users where username = $1', [name]);
if (taken) fail(`The username "${name}" already exists (role ${taken.role}). Pick another, or reset that password from the Users screen.`);

const uid = await createLogin(email, password);
try {
    const staff = await one(
        `insert into store.staff_users (id, provider, provider_uid, email, username, full_name, role, is_active, created_at, updated_at)
         values (gen_random_uuid(), 'firebase', $1, $2, $3, $4, $5, true, now(), now())
         returning id, username, email, full_name, role`,
        [uid, email, name, fullName || username, role],
    );
    console.log('\nStaff member created.');
    console.log(`  username : ${staff.username}`);
    console.log(`  role     : ${staff.role}`);
    console.log(`  sign-in  : the username above and the password you set`);
    console.log(`  (behind the scenes their login email is ${staff.email})`);
    console.log('\nNow clear the password from your environment:  setx POS_NEW_PASSWORD ""\n');
} catch (err) {
    await deleteLogin(uid).catch(() => {});
    fail(`Could not save the staff row, so the login was removed again: ${err.message}`);
}
process.exit(0);
