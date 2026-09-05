const catalog = require('../workers/secret-keys.json');

function collectWorkerSecrets(env = process.env) {
  const missing = catalog.required.filter((key) => {
    const value = env[key];
    return typeof value !== 'string' || value.length === 0;
  });
  const secrets = {};
  for (const key of [...catalog.required, ...catalog.optional]) {
    const value = env[key];
    if (typeof value === 'string' && value.length > 0) {
      secrets[key] = value;
    }
  }
  return { secrets, missing };
}

module.exports = { collectWorkerSecrets, catalog };
