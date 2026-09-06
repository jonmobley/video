jest.mock('pg', () => require('./helpers/pg-mock').install());

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
});
