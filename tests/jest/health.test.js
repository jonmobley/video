jest.mock('pg', () => require('./helpers/pg-mock').install());

const request = require('supertest');
const { app } = require('../../server');

describe('health endpoints', () => {
  test('GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('GET /ping', async () => {
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
