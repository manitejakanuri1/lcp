import { findProduct } from '../../data/products';
import { sendError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

export const catalogProductGet = handle('GET', async (req, res) => {
  const slug = String(req.query.slug ?? '');
  const product = await findProduct(slug);

  if (!product) {
    sendError(res, 404, 'PRODUCT_NOT_FOUND', `No product found for slug "${slug}".`);
    return;
  }

  sendJson(res, product);
}, { cache: { maxAge: 60, sMaxAge: 300 } });
