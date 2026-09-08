jest.mock('pg', () => require('./helpers/pg-mock').install());

const crypto = require('crypto');
const request = require('supertest');
const pgMock = require('./helpers/pg-mock');
const { app } = require('../../server');

describe('CMS routes', () => {
  beforeEach(() => {
    pgMock.reset();
  });

  test('old Netlify function URLs redirect to /api/*', async () => {
    const res = await request(app)
      .get('/.netlify/functions/get-page-config')
      .query({ page: 'oz' })
      .redirects(0);
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('/api/get-page-config?page=oz');
  });

  test('GET /api/page-image/:page is 404 when no image is stored', async () => {
    pgMock.enqueue({ rows: [] });
    const res = await request(app).get('/api/page-image/oz');
    expect(res.status).toBe(404);
  });

  test('GET /api/coming-soon-image/:page is 404 when no image is stored', async () => {
    pgMock.enqueue({ rows: [] });
    const res = await request(app).get('/api/coming-soon-image/seussical');
    expect(res.status).toBe(404);
  });

  test('stored page images revalidate instead of caching for a day', async () => {
    const data = Buffer.from('png');
    pgMock.enqueue({
      rows: [{ data, content_type: 'image/png' }]
    });
    const res = await request(app).get('/api/page-image/oz');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/must-revalidate/);
    expect(res.headers['cache-control']).toMatch(/max-age=0/);
    expect(res.headers.etag).toMatch(/^"/);
  });

  test('stored page images return 304 when If-None-Match matches', async () => {
    const data = Buffer.from('png');
    const etag = `"${crypto.createHash('sha256').update(data).digest('hex').slice(0, 32)}"`;
    pgMock.enqueue({ rows: [{ data, content_type: 'image/png' }] });
    const res = await request(app)
      .get('/api/page-image/oz')
      .set('If-None-Match', etag);
    expect(res.status).toBe(304);
  });

  test('Coming Soon image query requires both URL and bytes', async () => {
    pgMock.enqueue({ rows: [] });
    await request(app).get('/api/coming-soon-image/seussical');
    expect(pgMock.calls()[0].sql).toMatch(/coming_soon_image_url IS NOT NULL/);
    expect(pgMock.calls()[0].sql).toMatch(/coming_soon_image_data IS NOT NULL/);
  });

  test('HTML share tags are absolute using PUBLIC_ORIGIN', async () => {
    const previous = process.env.PUBLIC_ORIGIN;
    process.env.PUBLIC_ORIGIN = 'https://videos.example';
    const res = await request(app).get('/oz.html');
    expect(res.status).toBe(200);
    expect(res.text).toContain('content="https://videos.example/assets/og-image.png"');
    expect(res.text).toContain('href="https://videos.example/oz.html"');
    const clean = await request(app).get('/oz');
    expect(clean.status).toBe(200);
    expect(clean.text).toContain('content="https://videos.example/assets/og-image.png"');
    const home = await request(app).get('/');
    expect(home.text).toContain('content="https://videos.example/assets/vidshare-og.png"');
    if (previous === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = previous;
  });
});
