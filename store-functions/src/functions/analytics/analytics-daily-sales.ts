import type { AnalyticsDailySalesResponse, DailySalesRow } from '../../contracts';
import { requireRole } from '../../shared/auth';
import { sendJson } from '../../shared/envelope';
import { handle } from '../../shared/handler';
import { query } from '../../shared/db';
import { optNumber } from '../../shared/validate';

export const analyticsDailySales = handle('GET', async (req, res) => {
  await requireRole(req, ['founder']);
  const days_back = Math.floor(optNumber(req.query.daysBack, 'daysBack', 1) ?? 30);

  const { rows } = await query<DailySalesRow>('SELECT * FROM pos.get_daily_sales($1)', [days_back]);

  const body: AnalyticsDailySalesResponse = { days: rows };
  sendJson(res, body);
});
