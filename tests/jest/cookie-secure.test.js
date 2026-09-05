const { cookieSecureEnabled } = require('../../lib/cookie-secure');

describe('cookieSecureEnabled', () => {
  const original = {
    COOKIE_SECURE: process.env.COOKIE_SECURE,
    NODE_ENV: process.env.NODE_ENV
  };

  afterEach(() => {
    if (original.COOKIE_SECURE === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = original.COOKIE_SECURE;
    process.env.NODE_ENV = original.NODE_ENV;
  });

  test('explicit COOKIE_SECURE wins over the request', () => {
    process.env.COOKIE_SECURE = 'false';
    expect(cookieSecureEnabled({ secure: true })).toBe(false);
    process.env.COOKIE_SECURE = 'true';
    expect(cookieSecureEnabled({ secure: false })).toBe(true);
  });

  test('follows req.secure behind a reverse proxy', () => {
    delete process.env.COOKIE_SECURE;
    expect(cookieSecureEnabled({ secure: true })).toBe(true);
    expect(cookieSecureEnabled({ secure: false })).toBe(false);
  });

  test('falls back to NODE_ENV when there is no request', () => {
    delete process.env.COOKIE_SECURE;
    process.env.NODE_ENV = 'production';
    expect(cookieSecureEnabled()).toBe(true);
    process.env.NODE_ENV = 'test';
    expect(cookieSecureEnabled()).toBe(false);
  });
});
