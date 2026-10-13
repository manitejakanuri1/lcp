// Start the shop on this laptop: the database tunnel, the API, and the screens.
//
//   node scripts/start-local.mjs        then open http://localhost:5199
//
// Three things have to be running, and forgetting one gives confusing errors rather than a
// clear message, so this starts all three and says plainly which one died.
//
//   1. cloud-sql-proxy  - the tunnel to Cloud SQL. Google login is the key; no password and no
//                         IP list (see gcp/README if it complains about credentials).
//   2. node api/index.js - the API, on 3099.
//   3. vite              - the screens, on 5199, handing /api/... to the API.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import 'dotenv/config';

const PROXY = process.env.CLOUD_SQL_PROXY || join(homedir(), '.local', 'bin', 'cloud-sql-proxy.exe');
const INSTANCE = process.env.CLOUD_SQL_INSTANCE || 'lakshmi-sarees:asia-south1:lakshmi-store-db';
const DB_PORT = process.env.DB_PORT || '5433';
const API_PORT = process.env.PORT || '3099';
const UI_PORT = process.env.UI_PORT || '5199';

if (!process.env.DB_PASSWORD) {
    console.error('\nDB_PASSWORD is not set. Put it in .env.local (that file is git-ignored).\n');
    process.exit(1);
}

const children = [];
function start(name, command, args, env = {}) {
    const child = spawn(command, args, {
        stdio: ['ignore', 'inherit', 'inherit'],
        env: { ...process.env, ...env },
        shell: process.platform === 'win32',
    });
    child.on('exit', (code) => {
        console.error(`\n${name} stopped (exit ${code}). Shutting the rest down.\n`);
        for (const other of children) if (other !== child) other.kill();
        process.exit(code ?? 1);
    });
    children.push(child);
    return child;
}

if (!existsSync(PROXY)) {
    console.error(`\nThe Cloud SQL proxy is not at ${PROXY}.\nDownload it once from\n  https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.1/cloud-sql-proxy.x64.exe\nand put it there, or set CLOUD_SQL_PROXY to where it is.\n`);
    process.exit(1);
}

console.log('1/3 opening the database tunnel...');
start('the database tunnel', PROXY, ['--port', DB_PORT, INSTANCE]);

// The proxy needs a moment before the API's first connection, or the API exits on startup.
await new Promise((resolve) => setTimeout(resolve, 3000));

console.log(`2/3 starting the API on ${API_PORT}...`);
start('the API', 'node', ['api/index.js'], { PORT: API_PORT });

await new Promise((resolve) => setTimeout(resolve, 1500));

console.log(`3/3 starting the screens on ${UI_PORT}...`);
start('the screens', 'npx', ['vite', '--port', UI_PORT, '--strictPort'], { VITE_DEV_API: `http://127.0.0.1:${API_PORT}` });

console.log(`\nWhen all three are up, open:  http://localhost:${UI_PORT}\nPress Ctrl+C to stop everything.\n`);

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        for (const child of children) child.kill();
        process.exit(0);
    });
}
