import { loadHomepageBlocks } from '../../data/homepage';
import { sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

export const cmsHomepageGet = handle('GET', async (_req, res) => {
  sendJson(res, { blocks: await loadHomepageBlocks() });
}, { cache: { maxAge: 60, sMaxAge: 300 } });
