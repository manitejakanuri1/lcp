import { requireCustomer } from '../../shared/customer-auth';
import { sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

/** The signed-in customer's own profile (owner = verified token subject). */
export const accountGet = handle(
  'GET',
  async (req, res) => {
    const { customer } = await requireCustomer(req);
    sendJson(res, customer.profile);
  },
  { private: true },
);
