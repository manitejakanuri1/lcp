// Where the signed-in staff token is kept in the browser.
//
// The API also sets an httpOnly cookie, which is the safer of the two and is what a normal
// browser session runs on. This copy exists because the shop's screens are opened from a phone
// home-screen shortcut and an installed app, where a third-party-cookie rule can drop the
// cookie; the header then still carries the token. Nothing secret beyond the token is stored,
// and it is removed the moment the server refuses it.
const KEY = 'lakshmi_pos_token';

export function getToken(): string | null {
    try {
        return localStorage.getItem(KEY);
    } catch {
        // Private mode, or storage blocked: fall back to the cookie alone.
        return null;
    }
}

export function setToken(token: string) {
    try {
        localStorage.setItem(KEY, token);
    } catch { /* nothing useful to do */ }
}

export function clearToken() {
    try {
        localStorage.removeItem(KEY);
        // Sessions from the Supabase era, left behind in this browser.
        Object.keys(localStorage)
            .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
            .forEach((k) => localStorage.removeItem(k));
    } catch { /* nothing useful to do */ }
}
