// Record a payment the shop took but never finished writing down.
//
// Needed once, because a bad column name aborted the transaction that marks an order paid:
// the money was captured at Razorpay and the shop's books knew nothing about it. It does
// exactly what the live code does now - places the order, takes the pieces off the shelf,
// writes the payment, and puts the sale in the till's own books - and refuses to run twice.
//
//   ORDER_NUMBER=LS-2610-01017 PAYMENT_ID=pay_... LAKSHMI_DB_PASS=... node tests/reconcile_order.cjs

const { Client } = require('pg');

const ORDER_NUMBER = process.env.ORDER_NUMBER;
const PAYMENT_ID = process.env.PAYMENT_ID;
const METHOD = process.env.METHOD || 'card';
if (!ORDER_NUMBER || !PAYMENT_ID) {
    console.error('ORDER_NUMBER and PAYMENT_ID are required');
    process.exit(1);
}

(async () => {
    const db = new Client({
        host: '127.0.0.1', port: 5433, database: 'lakshmi',
        user: 'schema_admin', password: process.env.LAKSHMI_DB_PASS,
    });
    await db.connect();
    await db.query('BEGIN');
    try {
        const order = (await db.query(
            `SELECT id, order_number, total, payment_status::text
               FROM store.orders WHERE order_number = $1 FOR UPDATE`, [ORDER_NUMBER])).rows[0];
        if (!order) throw new Error(`no order ${ORDER_NUMBER}`);
        if (order.payment_status === 'captured') {
            console.log(`${ORDER_NUMBER} is already recorded as paid - nothing to do`);
            await db.query('ROLLBACK');
            await db.end();
            return;
        }

        const items = (await db.query(
            `SELECT variant_id, quantity, unit_price, product_name, variant_label
               FROM store.order_items WHERE order_id = $1`, [order.id])).rows;

        const lines = [];
        for (const item of items) {
            const source = (await db.query(
                `SELECT product_id, color_id FROM store.variant_stock_source WHERE variant_id = $1`,
                [item.variant_id])).rows[0];
            if (!source) continue;
            const product = (await db.query(
                `SELECT id, quantity, cost_price, saree_name FROM pos.products WHERE id = $1 FOR UPDATE`,
                [source.product_id])).rows[0];
            if (!product) continue;

            if (source.color_id) {
                const colour = (await db.query(
                    `UPDATE pos.product_colors
                        SET pieces = GREATEST(0, pieces - $2),
                            status = CASE WHEN pieces - $2 <= 0 THEN 'sold' ELSE 'available' END,
                            updated_at = NOW()
                      WHERE id = $1 RETURNING color_name, pieces`,
                    [source.color_id, item.quantity])).rows[0];
                console.log(`  ${product.saree_name} · ${colour.color_name}: ${item.quantity} sold, ${colour.pieces} left`);
            }
            const left = (await db.query(
                `UPDATE pos.products
                    SET quantity = GREATEST(0, quantity - $2),
                        status = CASE WHEN quantity - $2 <= 0 THEN 'sold' ELSE 'available' END,
                        updated_at = NOW()
                  WHERE id = $1 RETURNING quantity`,
                [product.id, item.quantity])).rows[0];
            console.log(`  ${product.saree_name}: ${left.quantity} pieces left in total`);

            lines.push({
                productId: product.id, colorId: source.color_id, quantity: item.quantity,
                price: Number(item.unit_price), cost: Number(product.cost_price ?? 0),
            });
        }

        await db.query(`DELETE FROM store.variant_reservations WHERE order_id = $1`, [order.id]);
        await db.query(
            `UPDATE store.orders SET status = 'placed', payment_status = 'captured',
                    placed_at = NOW(), updated_at = NOW() WHERE id = $1`, [order.id]);
        await db.query(
            `INSERT INTO store.payments (order_id, provider, provider_ref, method, amount, status)
             VALUES ($1, 'razorpay', $2, $3, $4, 'captured')
             ON CONFLICT (provider, provider_ref) DO NOTHING`,
            [order.id, PAYMENT_ID, METHOD, order.total]);
        await db.query(
            `INSERT INTO store.order_status_history (order_id, from_status, to_status, note)
             VALUES ($1, 'pending_payment', 'placed', $2)`,
            [order.id, `Paid online · ${PAYMENT_ID} · recorded by hand`]);

        if (lines.length) {
            const billNumber = `W-${order.order_number}`;
            const total = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
            const cost = lines.reduce((sum, l) => sum + l.cost * l.quantity, 0);
            const bill = (await db.query(
                `INSERT INTO pos.bills (bill_number, total_amount, total_cost, payment_method, customer_name, customer_phone)
                 VALUES ($1, $2, $3, 'online',
                         (SELECT shipping_address->>'name' FROM store.orders WHERE id = $4),
                         (SELECT shipping_address->>'phone' FROM store.orders WHERE id = $4))
                 ON CONFLICT (bill_number) DO NOTHING RETURNING id`,
                [billNumber, total, cost, order.id])).rows[0];
            if (bill) {
                for (const line of lines) {
                    await db.query(
                        `INSERT INTO pos.bill_items (bill_id, product_id, color_id, quantity, selling_price, cost_price)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [bill.id, line.productId, line.colorId, line.quantity, line.price, line.cost]);
                }
                console.log(`  bill ${billNumber} written into the till's books, ₹${total}`);
            }
        }

        await db.query('COMMIT');
        console.log(`${ORDER_NUMBER} is now recorded as paid.`);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('FAILED, nothing changed:', err.message);
        process.exitCode = 1;
    }
    await db.end();
})();
