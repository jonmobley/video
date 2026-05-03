jest.mock('pg', () => require('./helpers/pg-mock').install());
const pgMock = require('./helpers/pg-mock');

const request = require('supertest');
const { app } = require('../../server');

function linkBody(overrides = {}) {
  return {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Embed Test',
    expiryDays: '7',
    ...overrides
  };
}

function expectErrorShape(res, expectedCode) {
  expect(res.body).toEqual({ error: { code: expectedCode, message: expect.any(String) } });
  expect(res.body.error.code).toBe(expectedCode);
  expect(res.body.error.message.length).toBeGreaterThan(0);
}

describe('POST /api/create-link-video validation', () => {
  beforeEach(() => pgMock.reset());

  test('TITLE_REQUIRED when title omitted', async () => {
    const res = await request(app).post('/api/create-link-video').send(linkBody({ title: '' }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'TITLE_REQUIRED');
  });

  test('TITLE_TOO_LONG when title > 120 chars', async () => {
    const res = await request(app).post('/api/create-link-video').send(linkBody({ title: 'x'.repeat(121) }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'TITLE_TOO_LONG');
  });

  test('URL_REQUIRED when url omitted', async () => {
    const res = await request(app).post('/api/create-link-video').send(linkBody({ url: '' }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'URL_REQUIRED');
  });

  test('URL_TOO_LONG when url > 2048 chars', async () => {
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&pad=' + 'x'.repeat(2050)
    }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'URL_TOO_LONG');
  });

  describe('UNSUPPORTED_HOST blacklist', () => {
    const blocked = [
      'https://www.dropbox.com/s/abc/video.mp4',
      'https://drive.google.com/file/d/abc/view',
      'https://onedrive.live.com/?cid=abc',
      'https://www.icloud.com/iclouddrive/abc'
    ];
    test.each(blocked)('rejects %s', async (url) => {
      const res = await request(app).post('/api/create-link-video').send(linkBody({ url }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'UNSUPPORTED_HOST');
      // Must not have touched the DB.
      expect(pgMock.calls()).toEqual([]);
    });
  });

  test('BAD_LINK for a non-youtube/non-vimeo URL', async () => {
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://example.com/video.mp4'
    }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'BAD_LINK');
  });

  test('BAD_PASSWORD when password is not a string', async () => {
    const res = await request(app).post('/api/create-link-video').send(linkBody({ password: 123 }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'BAD_PASSWORD');
  });

  test('PASSWORD_TOO_LONG when > 200 chars', async () => {
    const res = await request(app).post('/api/create-link-video').send(linkBody({ password: 'p'.repeat(201) }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'PASSWORD_TOO_LONG');
  });

  test('BAD_EXPIRY for nonsense expiry', async () => {
    const res = await request(app).post('/api/create-link-video').send(linkBody({ expiryDays: 'soon' }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'BAD_EXPIRY');
  });
});
