jest.mock('pg', () => require('./helpers/pg-mock').install());
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => null)
}));

const request = require('supertest');
const { app } = require('../../server');

describe('page-bound standalone editor authorization', () => {
  const originalEnv = { ...process.env };
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'global-dashboard-test-token';
    process.env.SEUSSICAL_EDITOR_TOKEN = 'seussical-editor-test-token';
    process.env.OZ_EDITOR_TOKEN = 'oz-editor-test-token';
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('accepts the page editor token for its own page', async () => {
    const response = await request(app)
      .post('/api/verify-page-editor')
      .set('Authorization', 'Bearer seussical-editor-test-token')
      .send({ page: 'seussical' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authorized: true, page: 'seussical' });
  });

  test('rejects the same page editor token for another page', async () => {
    const response = await request(app)
      .post('/api/verify-page-editor')
      .set('Authorization', 'Bearer seussical-editor-test-token')
      .send({ page: 'oz' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('PAGE_FORBIDDEN');
  });

  test.each([
    ['videos', '/api/save-videos', { page: 'oz', videos: [] }],
    ['categories', '/api/save-categories', { page: 'oz', categories: [] }],
    ['page config', '/api/save-page-config', { page: 'oz', page_title: 'Blocked' }],
    ['Coming Soon image', '/api/upload-coming-soon-image', { page: 'oz', image: tinyPng, contentType: 'image/png' }]
  ])('rejects cross-page credentials on %s writes', async (_label, path, body) => {
    const response = await request(app)
      .post(path)
      .set('Authorization', 'Bearer seussical-editor-test-token')
      .send(body);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('PAGE_FORBIDDEN');
  });

  test.each([
    ['videos', '/api/save-videos', { page: 'seussical', videos: [] }],
    ['categories', '/api/save-categories', { page: 'seussical', categories: [] }],
    ['page config', '/api/save-page-config', { page: 'seussical', page_title: 'Blocked' }],
    ['Coming Soon image', '/api/upload-coming-soon-image', { page: 'seussical', image: tinyPng, contentType: 'image/png' }]
  ])('does not accept the global admin token on %s writes', async (_label, path, body) => {
    const response = await request(app)
      .post(path)
      .set('Authorization', 'Bearer global-dashboard-test-token')
      .send(body);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('PAGE_FORBIDDEN');
  });

  test('does not accept a page editor token on global admin routes', async () => {
    const response = await request(app)
      .get('/api/admin/videos')
      .set('Authorization', 'Bearer seussical-editor-test-token');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });
});