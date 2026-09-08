jest.mock('../../lib/page-store', () => ({ query: jest.fn() }));

const pageStore = require('../../lib/page-store');
const { handler } = require('../../handlers/issue-page-editor-setup');

describe('issue page editor setup', () => {
  const previous = { ...process.env };

  beforeEach(() => {
    pageStore.query.mockReset();
    process.env.ADMIN_TOKEN = 'admin-test-token';
    process.env.PUBLIC_ORIGIN = 'https://vidshare.link';
  });

  afterAll(() => {
    process.env = previous;
  });

  function post(page) {
    return handler({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer admin-test-token' },
      body: JSON.stringify({ page })
    });
  }

  test('rejects missing admin token', async () => {
    const response = await handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ page: 'seussical' })
    });
    expect(response.statusCode).toBe(401);
  });

  test('inserts Seussical defaults and returns a setup link', async () => {
    pageStore.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ page: 'seussical' }] });
    const response = await post('seussical');
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.page).toBe('seussical');
    expect(body.setup_url).toMatch(/^https:\/\/vidshare\.link\/seussical\?setup=/);
    expect(pageStore.query.mock.calls[1][0]).toMatch(/INSERT INTO page_config/);
    expect(pageStore.query.mock.calls[1][1][0]).toBe('seussical');
    expect(pageStore.query.mock.calls[1][1][1]).toBe('Seussical');
  });

  test('refreshes setup on an existing page without rewriting content', async () => {
    pageStore.query
      .mockResolvedValueOnce({ rows: [{ page: 'seussical' }] })
      .mockResolvedValueOnce({ rows: [{ page: 'seussical' }] });
    const response = await post('seussical');
    expect(response.statusCode).toBe(200);
    expect(pageStore.query.mock.calls[1][0]).toMatch(/UPDATE page_config/);
    expect(pageStore.query.mock.calls[1][0]).toMatch(/setup_token_used_at = NULL/);
    expect(pageStore.query.mock.calls[1][0]).not.toMatch(/page_title/);
  });
});
