import { findPolicy } from '../../data/policies';
import { sendError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

export const cmsPolicyGet = handle('GET', async (req, res) => {
  const slug = String(req.query.slug ?? '');
  const policy = await findPolicy(slug);

  if (!policy) {
    sendError(res, 404, 'POLICY_NOT_FOUND', `No policy found for slug "${slug}".`);
    return;
  }

  sendJson(res, policy);
}, { cache: { maxAge: 300, sMaxAge: 3600 } });
