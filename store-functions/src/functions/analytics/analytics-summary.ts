import type { AnalyticsSummaryResponse, AnalyticsSummaryRow } from '../../contracts';
import { requireRole } from '../../shared/auth';
import { sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';
import { query } from '../../shared/db';
import { optDate } from '../../shared/validate';

export const analyticsSummary = handle('GET', async (req, res) => {
  await requireRole(req, ['founder']);
  const from = optDate(req.query.from, 'from') ?? null;
  const to = optDate(req.query.to, 'to') ?? null;

  const { rows } = await query<AnalyticsSummaryRow>('SELECT * FROM pos.get_analytics_summary($1, $2)', [from, to]);

  const body: AnalyticsSummaryResponse = rows[0];
  sendJson(res, body);
});
