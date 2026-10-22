import { findOrder } from '../../data/orders';
import { requireCustomer } from '../../shared/customer-auth';
import { StoreError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

/**
 * Order detail by opaque id (05-orders-page.md). Looked up ONLY among the caller's own orders, so
 * another customer's order id answers exactly like an id that does not exist (no IDOR, no enumeration).
 */
export const orderGet = handle(
  'GET',
  async (req, res) => {
    const { customer } = await requireCustomer(req);
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const order = await findOrder(customer.id, id);
    if (!order) throw new StoreError('ORDER_NOT_FOUND', 'Order not found.');
    sendJson(res, order);
  },
  { private: true },
);
