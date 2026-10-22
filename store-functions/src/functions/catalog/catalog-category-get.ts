import { findCategory } from '../../data/categories';
import { sendError, sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

export const catalogCategoryGet = handle('GET', async (req, res) => {
  const slug = String(req.query.slug ?? '');
  const category = await findCategory(slug);

  if (!category) {
    sendError(res, 404, 'CATEGORY_NOT_FOUND', `No category found for slug "${slug}".`);
    return;
  }

  const { dbId: _dbId, ...body } = category;
  sendJson(res, {
    ...body,
    breadcrumb: [
      { label: 'Home', href: '/' },
      { label: category.breadcrumbLabel, href: `/collections/${category.slug}` },
    ],
  });
}, { cache: { maxAge: 60, sMaxAge: 600 } });
