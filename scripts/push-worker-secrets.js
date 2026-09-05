#!/usr/bin/env node
const { spawnSync } = require('child_process');
const { collectWorkerSecrets } = require('./collect-worker-secrets');

const { secrets, missing } = collectWorkerSecrets();
if (missing.length) {
  console.error(
    'Missing required Worker secrets:',
    missing.join(', '),
    '\nSet them as GitHub Actions secrets (or wrangler secret put) and retry.'
  );
  process.exit(1);
}

const result = spawnSync('npx', ['wrangler', 'secret', 'bulk'], {
  input: JSON.stringify(secrets),
  stdio: ['pipe', 'inherit', 'inherit'],
  env: process.env
});
process.exit(result.status === null ? 1 : result.status);
