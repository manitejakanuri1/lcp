// Staff passwords live in Firebase Auth (Identity Platform), not in our database.
//
// The login screen still asks for a username, so the browser never talks to Firebase: the API
// looks the username up in store.staff_users, takes the email from that row, and checks the
// password against Firebase itself. That keeps the screen as it was, keeps the password out of
// our tables, and gives us Google's lockout and reset machinery for free.
//
// Two different credentials are used, which is easy to mix up:
//   * the Web API key - public by design, only allows "try this password" calls;
//   * the service account's own token - needed to create a staff login or change a password,
//     and comes from the Cloud Run service account in production, from `gcloud auth
//     application-default login` on a laptop.
import { GoogleAuth } from 'google-auth-library';

const PROJECT = process.env.GCP_PROJECT_ID || 'lakshmi-sarees';
const API_KEY = process.env.FIREBASE_API_KEY;
const ADMIN = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}`;

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

export class AuthError extends Error {
    constructor(code, status = 400) {
        super(code);
        this.code = code;
        this.status = status;
    }
}

async function adminCall(path, body) {
    if (!API_KEY) throw new AuthError('FIREBASE_NOT_CONFIGURED', 500);
    const client = await auth.getClient();
    const token = (await client.getAccessToken()).token;
    // A personal Google login (a laptop running `gcloud auth application-default login`) has no
    // project of its own, and this API refuses to bill the call to nobody - hence the extra
    // header. A service account, which is what Cloud Run uses, carries its project already and
    // would need a further permission to send it, so the header goes only where it is needed.
    const isUserLogin = client.constructor?.name === 'UserRefreshClient';
    const res = await fetch(`${ADMIN}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(isUserLogin ? { 'x-goog-user-project': PROJECT } : {}),
        },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new AuthError(json?.error?.message || 'FIREBASE_ERROR', res.status);
    return json;
}

/**
 * Check a password. Returns the Firebase user id on success.
 * Firebase answers the same way for a wrong password and an unknown email, and so do we -
 * telling the two apart would let someone work out which usernames exist.
 */
export async function signIn(email, password) {
    if (!API_KEY) throw new AuthError('FIREBASE_NOT_CONFIGURED', 500);
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        const code = json?.error?.message || 'INVALID_LOGIN_CREDENTIALS';
        // A locked account and a throttled one are worth telling apart - the staff member can
        // do nothing about either, but the shop needs to know which it is.
        if (code === 'USER_DISABLED') throw new AuthError('USER_DISABLED', 403);
        if (code === 'TOO_MANY_ATTEMPTS_TRY_LATER') throw new AuthError('TOO_MANY_ATTEMPTS', 429);
        throw new AuthError('INVALID_CREDENTIALS', 401);
    }
    return json.localId;
}

/** Create a staff login. Returns its Firebase user id. */
export async function createLogin(email, password) {
    const json = await adminCall('/accounts', { email, password, emailVerified: true });
    return json.localId;
}

/** Set a new password for an existing staff login. */
export async function setPassword(uid, password) {
    await adminCall('/accounts:update', { localId: uid, password });
}

/** Turn a staff login off or on without deleting it. */
export async function setDisabled(uid, disabled) {
    await adminCall('/accounts:update', { localId: uid, disableUser: disabled });
}

/** Remove a staff login for good. */
export async function deleteLogin(uid) {
    await adminCall('/accounts:delete', { localId: uid });
}
