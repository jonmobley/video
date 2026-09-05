const { Resend } = require('resend');
const { getResendClient } = require('../../lib/resend-client');

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(function ResendMock(apiKey) {
    this.apiKey = apiKey;
  })
}));

describe('getResendClient', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  test('uses RESEND_API_KEY and RESEND_FROM_EMAIL', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'login@example.com';

    const result = await getResendClient();

    expect(Resend).toHaveBeenCalledWith('re_test_key');
    expect(result.fromEmail).toBe('login@example.com');
    expect(result.client).toBeInstanceOf(Resend);
  });

  test('defaults the from address when RESEND_FROM_EMAIL is unset', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    delete process.env.RESEND_FROM_EMAIL;

    const result = await getResendClient();

    expect(result.fromEmail).toBe('onboarding@resend.dev');
  });

  test('throws when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(getResendClient()).rejects.toThrow('RESEND_API_KEY is not set');
    expect(Resend).not.toHaveBeenCalled();
  });
});
