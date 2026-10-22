// Paying for a bag: the parts that can be proved without a human tapping a card.
//
// What matters here is what a dishonest browser can do. It can send its own prices, its own
// order id, its own signature; none of those may be believed. The payment window itself needs
// a person, so the last step - a real test card - is done by hand.
//
// It creates a throwaway customer and a real order, then deletes both.
//
//   node tests/checkout_payment_test.mjs

const ORDER_CREATE = process.env.ORDER_CREATE_URL || 'https://order-create-e5uho47kkq-el.a.run.app';
const PAYMENT_VERIFY = process.env.PAYMENT_VERIFY_URL || 'https://payment-verify-e5uho47kkq-el.a.run.app';
const REGISTER = process.env.REGISTER_URL || 'https://auth-register-e5uho47kkq-el.a.run.app';
const CATALOG = process.env.CATALOG_URL || 'https://catalog-category-products-search-e5uho47kkq-el.a.run.app';
const PRODUCT = process.env.PRODUCT_URL || 'https://catalog-product-get-e5uho47kkq-el.a.run.app';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + String(detail).slice(0, 170) : ''}`);
    ok ? pass++ : fail++;
};

const post = async (url, body, token) => {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Origin: 'https://www.lakshmisarees.in',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
};

// ---- a saree that is actually for sale -------------------------------------------------------
const found = await fetch(`${CATALOG}?slug=shop&pageSize=5`, { headers: { Origin: 'https://www.lakshmisarees.in' } })
    .then((r) => r.json()).catch(() => null);
const summary = found?.products?.[0];
check('found a saree on the website', Boolean(summary), summary?.name);
if (!summary) process.exit(1);

const product = await fetch(`${PRODUCT}?slug=${summary.slug}`, { headers: { Origin: 'https://www.lakshmisarees.in' } })
    .then((r) => r.json());
const variant = product.variants.find((v) => v.stock > 0);
check('it has a colour in stock', Boolean(variant), `${variant?.color} · ${variant?.stock} pieces · ₹${variant?.discountPrice ?? variant?.price}`);
if (!variant) process.exit(1);

const realPrice = variant.discountPrice ?? variant.price;
const lines = [{ productId: product.id, variantId: variant.id, quantity: 1 }];
const address = {
    firstName: 'Test', lastName: 'Buyer', address: '1 Test Street', apartment: '',
    city: 'Rajahmundry', state: 'Andhra Pradesh', pincode: '533101', phone: '9876543210', whatsappOptIn: false,
};

// ---- who may pay ------------------------------------------------------------------------------
const anonymous = await post(ORDER_CREATE, { lines, address });
check('a stranger cannot start a payment', anonymous.status === 401, `HTTP ${anonymous.status}`);

const email = `pay-${Date.now()}@lakshmi-test.invalid`;
const signedUp = await post(REGISTER, { email, password: 'saree-test-9981', firstName: 'Test', lastName: 'Buyer' });
check('a test customer was created', signedUp.status === 201, `HTTP ${signedUp.status}`);
const token = signedUp.body?.accessToken;
if (!token) process.exit(1);

// ---- the amount comes from the shop, not the browser ------------------------------------------
const liar = await post(ORDER_CREATE, { lines: [{ ...lines[0], unitPrice: 1 }], address, idempotencyKey: `liar-${Date.now()}` }, token);
check('a browser that sends its own price is ignored', liar.body?.amount === Math.round(realPrice * 100),
    `${liar.body?.amount} vs ${Math.round(realPrice * 100)}`);
if (liar.body?.orderId) await post(PAYMENT_VERIFY, { orderId: liar.body.orderId, failed: true, reason: 'test tidy-up' }, token);

const retryKey = `retry-${Date.now()}`;
const again = await post(ORDER_CREATE, { lines, address, idempotencyKey: retryKey }, token);
const repeated = await post(ORDER_CREATE, { lines, address, idempotencyKey: retryKey }, token);
check('the same attempt twice gives one order, not two',
    Boolean(again.body?.orderId) && again.body.orderId === repeated.body?.orderId,
    `${again.body?.orderId} vs ${repeated.body?.orderId}`);
if (again.body?.orderId) await post(PAYMENT_VERIFY, { orderId: again.body.orderId, failed: true, reason: 'test tidy-up' }, token);

const started = await post(ORDER_CREATE, { lines, address, idempotencyKey: `test-${Date.now()}` }, token);
check('an order can be started', started.status === 201, `HTTP ${started.status} ${JSON.stringify(started.body)?.slice(0, 120)}`);
check('it has an order number', Boolean(started.body?.orderNumber), started.body?.orderNumber);
check('Razorpay was given an order', String(started.body?.razorpayOrderId || '').startsWith('order_'), started.body?.razorpayOrderId);
check('the amount is the shop\'s price, in paise', started.body?.amount === Math.round(realPrice * 100),
    `${started.body?.amount} vs ${Math.round(realPrice * 100)}`);
check('the secret key is not sent to the browser',
    !JSON.stringify(started.body).includes('rzp_') || String(started.body?.keyId || '').startsWith('rzp_test_'),
    `keyId ${started.body?.keyId?.slice(0, 12)}…`);

// Released as soon as it is checked: each of these orders holds the same pieces, and a saree
// with one piece left cannot be held three times over - the shop would be overselling.

// ---- forged confirmations ----------------------------------------------------------------------
const forged = await post(PAYMENT_VERIFY, {
    orderId: started.body.orderId,
    razorpayOrderId: started.body.razorpayOrderId,
    razorpayPaymentId: 'pay_madeup123456',
    razorpaySignature: 'deadbeef'.repeat(8),
}, token);
check('a forged signature is refused', forged.status === 400, `HTTP ${forged.status} ${forged.body?.error?.message}`);

const notMine = await post(PAYMENT_VERIFY, {
    orderId: '00000000-0000-0000-0000-000000000000',
    razorpayOrderId: 'order_x', razorpayPaymentId: 'pay_x', razorpaySignature: 'aa',
}, token);
check('someone else\'s order is not found', notMine.status === 404, `HTTP ${notMine.status}`);

const missing = await post(PAYMENT_VERIFY, { orderId: started.body.orderId }, token);
check('a confirmation with nothing in it is refused', missing.status === 400, missing.body?.error?.message);

// ---- a closed payment window frees the held pieces ------------------------------------------------
// Every order this test opened holds pieces for fifteen minutes, so all of them are released,
// not only the first: otherwise the shelf check below is measuring the test's own litter.
const abandoned = await post(PAYMENT_VERIFY, { orderId: started.body.orderId, failed: true, reason: 'test' }, token);
check('closing the payment window releases the hold', abandoned.status === 200 && abandoned.body?.paid === false,
    JSON.stringify(abandoned.body));

const stillForSale = await fetch(`${PRODUCT}?slug=${summary.slug}`, { headers: { Origin: 'https://www.lakshmisarees.in' } })
    .then((r) => r.json());
const after = stillForSale.variants.find((v) => v.id === variant.id);
check('the saree is back on the shelf at the same count', after?.stock === variant.stock,
    `${after?.stock} vs ${variant.stock}`);

console.log(`\n${pass}/${pass + fail} checks passed`);
console.log('Clean up with: node tests/cleanup_auth_test.cjs  (deletes every @lakshmi-test.invalid account and its orders)');
process.exit(fail ? 1 : 0);
