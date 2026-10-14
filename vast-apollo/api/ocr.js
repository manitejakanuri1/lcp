// Talking to the bill reader (the Python service: reads a vendor bill, cuts a colour sheet).
//
// The reader is deployed privately, so only this API may call it. Cloud Run checks that with
// an identity token, not a shared password: Google signs a short-lived token for this service's
// own account, and the reader rejects anything else. A password in an environment variable
// would have to be rotated by hand and would work from anywhere it leaked.
//
// On a laptop there is no metadata server to sign that token. If signing fails the call still
// goes out unsigned, which is what a local reader on localhost wants; a deployed reader simply
// answers 403 and the caller sees "Bill reader is unavailable" instead of a confusing crash.
import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth();
const clients = new Map();

/** The base URL of the reader, without a route. Empty when it is not configured. */
export function ocrBase() {
    const url = process.env.OCR_SERVICE_URL || process.env.TESSERACT_OCR_URL || '';
    return url.replace(/\/(ocr|split)$/, '').replace(/\/$/, '');
}

async function authHeader(audience) {
    if (!/^https:\/\//.test(audience)) return {}; // a local reader needs no token
    try {
        if (!clients.has(audience)) clients.set(audience, await auth.getIdTokenClient(audience));
        return await clients.get(audience).getRequestHeaders();
    } catch (err) {
        console.error('Could not sign a token for the bill reader:', err.message);
        return {};
    }
}

/**
 * Send one file to a route on the reader and return its answer.
 * `route` is 'ocr' (read a bill) or 'split' (cut a colour sheet).
 */
export async function callOcr(route, buffer, mimeType, filename) {
    const base = ocrBase();
    if (!base) throw Object.assign(new Error('OCR_NOT_CONFIGURED'), { code: 'OCR_NOT_CONFIGURED' });

    const url = `${base}/${route}`;
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), filename || 'upload');

    const response = await fetch(url, {
        method: 'POST',
        headers: await authHeader(base),
        body: form,
        // A big scanned bill takes a few seconds; a reader that has gone away must not hold
        // the till's screen for ever.
        signal: AbortSignal.timeout(Number(process.env.OCR_TIMEOUT_MS || 55_000)),
    });
    return response;
}
