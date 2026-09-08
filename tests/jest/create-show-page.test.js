jest.mock('../../lib/page-store', () => ({ query: jest.fn() }));

const pageStore = require('../../lib/page-store');
const { handler } = require('../../handlers/create-show-page');

describe('create show page', () => {
  const previous = { ...process.env };

  beforeEach(() => {
    pageStore.query.mockReset();
    process.env.ADMIN_TOKEN = 'admin-test-token';
    process.env.PUBLIC_ORIGIN = 'https://vidshare.link';
  });

  afterAll(() => {
    process.env = previous;
  });

  test('standalone productions get their dedicated setup path', async () => {
    pageStore.query.mockResolvedValueOnce({ rows: [{ page: 'seussical' }] });
    const response = await handler({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer admin-test-token' },
      body: JSON.stringify({ page: 'seussical', title: 'Seussical' })
    });
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).setup_url).toMatch(
      /^https:\/\/vidshare\.link\/seussical\?setup=/
    );
    expect(pageStore.query.mock.calls[0][1][6]).toBe('/seussical');
  });
});
