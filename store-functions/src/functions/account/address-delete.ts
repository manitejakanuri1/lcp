import { deleteAddress } from '../../data/customers';
import { requireCustomer } from '../../shared/customer-auth';
import { sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

/**
 * Delete one of the caller's addresses by `id`. If it was the default, the oldest remaining address
 * becomes default. An id belonging to another customer is simply "not found" (no existence leak).
 */
export const addressDelete = handle(
  'POST',
  async (req, res) => {
    const { customer } = await requireCustomer(req);
    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    await deleteAddress(customer.id, id);
    sendJson(res, { success: true });
  },
  { private: true },
);
