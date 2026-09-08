const catalog = require('../workers/secret-keys.json');

function sanitizeSecretValue(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/[\r\n]+/g, '').trim();
}

function collectWorkerSecrets(env = process.env) {
  const missing = catalog.required.filter((key) => {
    const value = sanitizeSecretValue(env[key]);
    return typeof value !== 'string' || value.length === 0;
  });
  const secrets = {};
  for (const key of [...catalog.required, ...catalog.optional]) {
    const value = sanitizeSecretValue(env[key]);
    if (typeof value === 'string' && value.length > 0) {
      secrets[key] = value;
    }
  }
  return { secrets, missing };
}

function missingRequiredMessage(env = process.env) {
  const { missing } = collectWorkerSecrets(env);
  if (!missing.length) return null;
  return `Missing required GitHub secrets: ${missing.join(', ')}`;
}

module.exports = { collectWorkerSecrets, catalog, missingRequiredMessage, sanitizeSecretValue };
