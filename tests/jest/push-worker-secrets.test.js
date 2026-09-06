const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeSecretsFile } = require('../../scripts/push-worker-secrets');

describe('writeSecretsFile', () => {
  test('writes collected secrets as JSON for wrangler --secrets-file', () => {
    const file = path.join(os.tmpdir(), `worker-secrets-${process.pid}.json`);
    try {
      const result = writeSecretsFile(file, {
        DATABASE_URL: 'postgres://db',
        ADMIN_TOKEN: 'token',
        ALLOWED_ORIGIN: 'https://example.com',
        PUBLIC_ORIGIN: 'https://example.com',
        RESEND_API_KEY: 're_test'
      });
      expect(result.ok).toBe(true);
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
        DATABASE_URL: 'postgres://db',
        ADMIN_TOKEN: 'token',
        ALLOWED_ORIGIN: 'https://example.com',
        PUBLIC_ORIGIN: 'https://example.com',
        RESEND_API_KEY: 're_test'
      });
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  test('does not write a file when required secrets are missing', () => {
    const file = path.join(os.tmpdir(), `worker-secrets-missing-${process.pid}.json`);
    const result = writeSecretsFile(file, { DATABASE_URL: 'postgres://db' });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['ADMIN_TOKEN']);
    expect(fs.existsSync(file)).toBe(false);
  });

  test('writes with only DATABASE_URL and ADMIN_TOKEN because origin is a Worker var', () => {
    const file = path.join(os.tmpdir(), `worker-secrets-required-${process.pid}.json`);
    try {
      const result = writeSecretsFile(file, {
        DATABASE_URL: 'postgres://db',
        ADMIN_TOKEN: 'token'
      });
      expect(result.ok).toBe(true);
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
        DATABASE_URL: 'postgres://db',
        ADMIN_TOKEN: 'token'
      });
    } finally {
      fs.rmSync(file, { force: true });
    }
  });
});
