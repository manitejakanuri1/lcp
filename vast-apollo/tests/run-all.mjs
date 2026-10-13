// Run every API test suite in turn and print one line per suite.
//
//   npm run start:local      (in another terminal - the API and the tunnel must be up)
//   npm run test:api
//
// Each suite creates its own test rows against the real database and deletes them again, so
// this is safe to run on the shop's own database - but it does write, so never run it while
// somebody is billing a customer.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const suites = readdirSync(here).filter((f) => f.endsWith('_test.mjs') && !f.startsWith('clickthrough')).sort();

let failed = 0;
for (const suite of suites) {
    const run = spawnSync('node', [join(here, suite)], { encoding: 'utf-8' });
    const summary = (run.stdout || '').split('\n').filter((l) => l.includes('checks passed')).pop();
    const failures = (run.stdout || '').split('\n').filter((l) => l.startsWith('FAIL'));
    console.log(`${suite.padEnd(38)} ${summary || 'did not finish'}`);
    for (const line of failures) console.log(`    ${line}`);
    if (run.status !== 0) {
        failed++;
        if (!summary) console.log((run.stderr || '').split('\n').slice(0, 4).map((l) => `    ${l}`).join('\n'));
    }
}

console.log(`\n${suites.length - failed} of ${suites.length} suites green`);
console.log('The browser walk-through is separate: see tests/clickthrough_test.mjs');
process.exit(failed ? 1 : 0);
