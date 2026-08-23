jest.mock('../../lib/page-store', () => ({ query: jest.fn() }));

const pageStore = require('../../lib/page-store');

describe('PostgreSQL standalone show migration', () => {
  beforeEach(() => {
    pageStore.query.mockReset();
    delete process.env.OZ_EDITOR_TOKEN;
  });

  test('public config projection excludes credential hashes', async () => {
    pageStore.query.mockResolvedValueOnce({
      rows: [{ page: 'oz', page_title: 'Oz', presentation: {}, editor_token_hash: 'secret' }]
    });
    const { handler } = require('../../netlify/functions/get-page-config');
    const response = await handler({ httpMethod: 'GET', headers: {}, queryStringParameters: { page: 'oz' } });
    expect(pageStore.query.mock.calls[0][0]).not.toMatch(/editor_token_hash|setup_token_hash/);
    expect(JSON.parse(response.body)).not.toHaveProperty('editor_token_hash');
  });

  test('setup redemption relies on one atomic conditional update', async () => {
    pageStore.query.mockResolvedValueOnce({ rows: [{ page: 'new-show' }] });
    const { handler } = require('../../netlify/functions/redeem-page-editor-setup');
    const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ page: 'new-show', token: 'once' }) });
    expect(response.statusCode).toBe(200);
    expect(pageStore.query.mock.calls[0][0]).toMatch(/setup_token_used_at IS NULL/);
    expect(pageStore.query.mock.calls[0][0]).toMatch(/setup_token_hash = NULL/);

    pageStore.query.mockResolvedValueOnce({ rows: [] });
    const repeat = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ page: 'new-show', token: 'once' }) });
    expect(repeat.statusCode).toBe(403);
  });

  test('dynamic editor credential authorizes against hashed page token', async () => {
    pageStore.query.mockResolvedValueOnce({ rows: [{ page: 'oz' }] });
    const { requirePageAuth } = require('../../netlify/functions/utils/auth');
    const result = await requirePageAuth({ headers: { authorization: 'Bearer dynamic-token' } }, 'oz');
    expect(result.authorized).toBe(true);
    expect(pageStore.query.mock.calls[0][0]).toMatch(/editor_token_hash/);
    expect(pageStore.query.mock.calls[0][1][1]).not.toBe('dynamic-token');
  });
});