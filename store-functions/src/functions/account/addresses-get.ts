import { listAddresses } from '../../data/customers';
import { requireCustomer } from '../../shared/customer-auth';
import { sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

/** The signed-in customer's saved addresses, default first. */
export const addressesGet = handle(
  'GET',
  async (req, res) => {
    const { customer } = await requireCustomer(req);
    sendJson(res, { items: await listAddresses(customer.id) });
  },
  { private: true },
);
