// One Postgres pool for the whole API, replacing the Supabase client.
//
// Cloud Run mounts the Cloud SQL instance as a unix socket (/cloudsql/<connection name>);
// on a laptop the Cloud SQL Auth Proxy listens on TCP instead. Both are just a host to pg,
// so the same pool serves either and nothing in the routes has to know which one it is.
import pg from 'pg';

const socket = process.env.INSTANCE_CONNECTION_NAME
    ? `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`
    : null;

export const pool = new pg.Pool({
    host: socket || process.env.DB_HOST || '127.0.0.1',
    // A unix socket has no port. 5433 is the proxy's default here because PostgreSQL 17
    // is installed locally on 5432.
    port: socket ? undefined : Number(process.env.DB_PORT || 5433),
    user: process.env.DB_USER || 'schema_admin',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'lakshmi',
    // Cloud Run runs many small instances, and Cloud SQL db-f1-micro allows few
    // connections, so each instance keeps a small pool rather than one big one.
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
});

/** Rows of a query. */
export async function many(sql, params = []) {
    const { rows } = await pool.query(sql, params);
    return rows;
}

/** The first row, or null - the shape Supabase's maybeSingle() returned. */
export async function one(sql, params = []) {
    const { rows } = await pool.query(sql, params);
    return rows[0] ?? null;
}

/** How many rows a write touched. */
export async function count(sql, params = []) {
    const { rowCount } = await pool.query(sql, params);
    return rowCount;
}

/**
 * Run several statements as one unit: either all of them happen or none do. A bill that
 * wrote its items but not its total would be worse than a bill that failed outright.
 */
export async function tx(fn) {
    const client = await pool.connect();
    try {
        await client.query('begin');
        const out = await fn(client);
        await client.query('commit');
        return out;
    } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Build `set a = $2, b = $3` from a patch, keeping only columns on the allow-list.
 * The column names therefore never come from the request body, which is what stops a
 * caller from writing created_by, id, or a column it has no business touching.
 */
export function setClause(patch, allowed, firstParam = 2) {
    const keys = Object.keys(patch).filter((k) => allowed.includes(k) && patch[k] !== undefined);
    return {
        keys,
        sql: keys.map((k, i) => `${k} = $${i + firstParam}`).join(', '),
        values: keys.map((k) => patch[k]),
    };
}

/** Build `(a, b) values ($1, $2)` the same way, from the same allow-list. */
export function insertClause(body, allowed) {
    const keys = Object.keys(body).filter((k) => allowed.includes(k) && body[k] !== undefined);
    return {
        keys,
        columns: keys.join(', '),
        placeholders: keys.map((_, i) => `$${i + 1}`).join(', '),
        values: keys.map((k) => body[k]),
    };
}
