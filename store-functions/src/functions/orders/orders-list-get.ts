import { listOrders } from '../../data/orders';
import { requireCustomer } from '../../shared/customer-auth';
import { sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';
import { pageParams } from '../../shared/validate';

/** Paginated order history of the signed-in customer only (05-orders-page.md), newest first. */
export const ordersListGet = handle(
  'GET',
  async (req, res) => {
    const { customer } = await requireCustomer(req);
    const { page, pageSize, from } = pageParams(req.query);
    const { items, total } = await listOrders(customer.id, pageSize, from);
    sendJson(res, { items, page, pageSize, total });
  },
  { private: true },
);
