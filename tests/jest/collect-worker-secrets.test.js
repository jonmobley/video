const {
  collectWorkerSecrets,
  catalog,
  missingRequiredMessage
} = require('../../scripts/collect-worker-secrets');

describe('collectWorkerSecrets', () => {
  test('reports missing required keys and skips empty optional ones', () => {
    const { secrets, missing } = collectWorkerSecrets({
      DATABASE_URL: 'postgres://db',
      ADMIN_TOKEN: '',
      PUBLIC_ORIGIN: 'https://example.com',
      RESEND_API_KEY: 're_test',
      WISTIA_API_PASSWORD: ''
    });
    expect(missing).toEqual(['ADMIN_TOKEN', 'ALLOWED_ORIGIN']);
    expect(secrets).toEqual({
      DATABASE_URL: 'postgres://db',
      PUBLIC_ORIGIN: 'https://example.com',
      RESEND_API_KEY: 're_test'
    });
  });

  test('includes every catalog key when present', () => {
    const env = {};
    for (const key of [...catalog.required, ...catalog.optional]) {
      env[key] = `${key}-value`;
    }
    const { secrets, missing } = collectWorkerSecrets(env);
    expect(missing).toEqual([]);
    expect(Object.keys(secrets).sort()).toEqual(
      [...catalog.required, ...catalog.optional].sort()
    );
  });

  test('missingRequiredMessage lists required keys and is null when complete', () => {
    expect(
      missingRequiredMessage({
        DATABASE_URL: 'postgres://db',
        PUBLIC_ORIGIN: 'https://example.com'
      })
    ).toBe('Missing required GitHub secrets: ADMIN_TOKEN, ALLOWED_ORIGIN');
    expect(
      missingRequiredMessage({
        DATABASE_URL: 'postgres://db',
        ADMIN_TOKEN: 'token',
        ALLOWED_ORIGIN: 'https://example.com',
        PUBLIC_ORIGIN: 'https://example.com'
      })
    ).toBeNull();
  });
});
