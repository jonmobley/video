const fs = require('fs');
const path = require('path');

jest.mock('../../lib/page-store', () => ({ query: jest.fn() }));

const pageStore = require('../../lib/page-store');

describe('PostgreSQL standalone show migration', () => {
  beforeEach(() => {
    pageStore.query.mockReset();
    delete process.env.OZ_EDITOR_TOKEN;
  });

  test('public config image URLs are absolute when PUBLIC_ORIGIN is set', async () => {
    const previous = process.env.PUBLIC_ORIGIN;
    process.env.PUBLIC_ORIGIN = 'https://videos.example';
    pageStore.query.mockResolvedValueOnce({
      rows: [{
        page: 'oz',
        page_title: 'Oz',
        presentation: {},
        og_image_url: '/api/page-image/oz',
        coming_soon_image_url: '/api/coming-soon-image/oz',
        canonical_url: '/oz.html'
      }]
    });
    const { handler } = require('../../handlers/get-page-config');
    const response = await handler({ httpMethod: 'GET', headers: {}, queryStringParameters: { page: 'oz' } });
    const body = JSON.parse(response.body);
    expect(body.og_image_url).toBe('https://videos.example/api/page-image/oz');
    expect(body.coming_soon_image_url).toBe('https://videos.example/api/coming-soon-image/oz');
    expect(body.canonical_url).toBe('https://videos.example/oz.html');
    if (previous === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = previous;
  });

  test('resetting Coming Soon also nulls stored image bytes', async () => {
    process.env.OZ_EDITOR_TOKEN = 'oz-editor';
    pageStore.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ page: 'oz', presentation: {} }] })
      .mockResolvedValueOnce({ rows: [{ page: 'oz', coming_soon_image_url: null }] });
    const { handler } = require('../../handlers/save-page-config');
    const response = await handler({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer oz-editor' },
      body: JSON.stringify({ page: 'oz', coming_soon_image_url: null })
    });
    expect(response.statusCode).toBe(200);
    const upsert = pageStore.query.mock.calls.find((call) => /ON CONFLICT/.test(call[0]));
    expect(upsert).toBeTruthy();
    expect(upsert[0]).toMatch(/coming_soon_image_data = NULL/);
    expect(upsert[0]).toMatch(/coming_soon_image_content_type = NULL/);
  });

  test('public config projection excludes credential hashes', async () => {
    pageStore.query.mockResolvedValueOnce({
      rows: [{ page: 'oz', page_title: 'Oz', presentation: {}, editor_token_hash: 'secret' }]
    });
    const { handler } = require('../../handlers/get-page-config');
    const response = await handler({ httpMethod: 'GET', headers: {}, queryStringParameters: { page: 'oz' } });
    expect(pageStore.query.mock.calls[0][0]).not.toMatch(/editor_token_hash|setup_token_hash/);
    expect(JSON.parse(response.body)).not.toHaveProperty('editor_token_hash');
  });

  test('setup redemption relies on one atomic conditional update', async () => {
    pageStore.query.mockResolvedValueOnce({ rows: [{ page: 'new-show' }] });
    const { handler } = require('../../handlers/redeem-page-editor-setup');
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
    const { requirePageAuth } = require('../../handlers/utils/auth');
    const result = await requirePageAuth({ headers: { authorization: 'Bearer dynamic-token' } }, 'oz');
    expect(result.authorized).toBe(true);
    expect(pageStore.query.mock.calls[0][0]).toMatch(/editor_token_hash/);
    expect(pageStore.query.mock.calls[0][1][1]).not.toBe('dynamic-token');
  });

  test('revokes replace_page helpers only after they are created', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../complete-supabase-schema.sql'),
      'utf8'
    );
    const createVideos = sql.indexOf('CREATE OR REPLACE FUNCTION replace_page_videos');
    const createCategories = sql.indexOf('CREATE OR REPLACE FUNCTION replace_page_categories');
    const revokeVideos = sql.indexOf('REVOKE ALL ON FUNCTION replace_page_videos');
    const revokeCategories = sql.indexOf('REVOKE ALL ON FUNCTION replace_page_categories');
    expect(createVideos).toBeGreaterThan(-1);
    expect(createCategories).toBeGreaterThan(-1);
    expect(revokeVideos).toBeGreaterThan(createVideos);
    expect(revokeCategories).toBeGreaterThan(createCategories);
  });
});