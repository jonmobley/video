#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { collectWorkerSecrets } = require('./collect-worker-secrets');

function missingSecretsError(missing) {
  return (
    'Missing required Worker secrets: ' +
    missing.join(', ') +
    '\nSet them as GitHub Actions secrets (or wrangler secret put) and retry.'
  );
}

function writeSecretsFile(filePath, env = process.env) {
  const { secrets, missing } = collectWorkerSecrets(env);
  if (missing.length) {
    return { ok: false, missing };
  }
  fs.writeFileSync(path.resolve(filePath), JSON.stringify(secrets), { mode: 0o600 });
  return { ok: true, missing: [] };
}

function printMissingAndExit(missing) {
  console.error(missingSecretsError(missing));
  process.exit(1);
}

if (require.main === module) {
  const writeIdx = process.argv.indexOf('--write');
  if (writeIdx !== -1) {
    const out = process.argv[writeIdx + 1];
    if (!out) {
      console.error('Usage: node scripts/push-worker-secrets.js --write <path>');
      process.exit(1);
    }
    const written = writeSecretsFile(out);
    if (!written.ok) printMissingAndExit(written.missing);
    process.exit(0);
  }

  const { secrets, missing } = collectWorkerSecrets();
  if (missing.length) printMissingAndExit(missing);

  const result = spawnSync('npx', ['wrangler', 'secret', 'bulk'], {
    input: JSON.stringify(secrets),
    stdio: ['pipe', 'inherit', 'inherit'],
    env: process.env
  });
  process.exit(result.status === null ? 1 : result.status);
}

module.exports = { writeSecretsFile, missingSecretsError };
