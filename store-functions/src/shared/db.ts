import { Connector, IpAddressTypes, AuthTypes } from '@google-cloud/cloud-sql-connector';
import pg from 'pg';
import { StoreError } from './envelope';

// node-postgres returns NUMERIC/BIGINT as strings and DATE as a JS Date. The contracts say numbers and
// 'YYYY-MM-DD' strings, so parse them here once.
pg.types.setTypeParser(1700, (v) => Number(v)); // NUMERIC
pg.types.setTypeParser(20, (v) => Number(v)); // BIGINT (count(*))
pg.types.setTypeParser(1082, (v) => v); // DATE

let pool: pg.Pool | undefined;

/**
 * Shared pool. Deployed: connects to Cloud SQL through the connector with IAM database auth as the
 * functions' service account (no password) -- set INSTANCE_CONNECTION_NAME, DB_USER, DB_NAME.
 * Local dev: set DATABASE_URL instead.
 * Keep `max` small: every function instance holds its own pool (instances x max <= Cloud SQL max_connections).
 */
export async function db(): Promise<pg.Pool> {
  if (pool) return pool;
  const max = Number(process.env.DB_POOL_MAX ?? 2);
  if (process.env.INSTANCE_CONNECTION_NAME) {
    const { INSTANCE_CONNECTION_NAME: instanceConnectionName, DB_USER: user, DB_NAME: database } = process.env;
    if (!user || !database) throw new StoreError('INTERNAL_ERROR', 'DB_USER / DB_NAME are not set.');
    const connector = new Connector();
    const opts = await connector.getOptions({
      instanceConnectionName,
      ipType: IpAddressTypes.PUBLIC,
      authType: AuthTypes.IAM,
    });
    pool = new pg.Pool({ ...opts, user, database, max });
  } else if (process.env.DATABASE_URL) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max, ssl: { rejectUnauthorized: false } });
  } else {
    throw new StoreError('INTERNAL_ERROR', 'Set INSTANCE_CONNECTION_NAME (+ DB_USER, DB_NAME) or DATABASE_URL.');
  }
  return pool;
}

export interface PgError extends Error {
  code?: string;
  constraint?: string;
}

/**
 * Runs one parameterised query. Database errors are rethrown untouched so callers can map SQLSTATEs
 * (23505 unique violation, P0001 from pos.create_bill); anything unhandled becomes a logged INTERNAL_ERROR
 * in handle() without leaking database detail.
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return (await db()).query<T>(text, params);
}

export type Query = <R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]) => Promise<pg.QueryResult<R>>;

/** Runs `fn` in one transaction on a single connection; rolls back if it throws. */
export async function tx<T>(fn: (q: Query) => Promise<T>): Promise<T> {
  const client = await (await db()).connect();
  try {
    await client.query('BEGIN');
    const out = await fn((text, params) => client.query(text, params));
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Guards a value before it is cast to uuid in SQL (a bad cast would be a 500 instead of a clean 404). */
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
