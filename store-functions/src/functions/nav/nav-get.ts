import { loadNav } from '../../data/nav';
import { sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';

export const navGet = handle('GET', async (_req, res) => {
  sendJson(res, await loadNav());
}, { cache: { maxAge: 60, sMaxAge: 600 } });
