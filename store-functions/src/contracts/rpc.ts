import type { IsoDate } from './db';

// Postgres functions in schema `pos`, called as `SELECT * FROM pos.<name>(...)`; arg names below are the old RPC names (the SQL parameters are p_from / p_to / p_days_back).

/** get_analytics_summary(start_date, end_date): returns a single-row table. */
export interface GetAnalyticsSummaryArgs {
  start_date?: IsoDate | null;
  end_date?: IsoDate | null;
}
export interface AnalyticsSummaryRow {
  total_sales: number;
  total_cost: number;
  total_profit: number;
  /** All-time count of products with status 'sold'; NOT filtered by the date range. */
  total_items_sold: number;
  /** Current count of products with status 'available'; NOT date-filtered. */
  total_items_in_stock: number;
}

/** get_daily_sales(days_back): one row per day, newest first. */
export interface GetDailySalesArgs {
  days_back?: number; // default 30
}
export interface DailySalesRow {
  sale_date: IsoDate;
  total_amount: number;
  total_profit: number;
  bill_count: number;
}

/** generate_bill_number(): returns TEXT like "B-20261010-0001". */
export type GenerateBillNumberArgs = Record<string, never>;
export type GenerateBillNumberResult = string;

export interface Rpcs {
  get_analytics_summary: { args: GetAnalyticsSummaryArgs; returns: AnalyticsSummaryRow[] };
  get_daily_sales: { args: GetDailySalesArgs; returns: DailySalesRow[] };
  generate_bill_number: { args: GenerateBillNumberArgs; returns: GenerateBillNumberResult };
}
