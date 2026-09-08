jest.mock('pg', () => require('./helpers/pg-mock').install());
const pgMock = require('./helpers/pg-mock');

const request = require('supertest');
const { app, linkTitleCache } = require('../../server');

const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = jest.fn();
  linkTitleCache.clear();
  pgMock.reset();
});
afterEach(() => {
  global.fetch = originalFetch;
});

function expectErrorShape(res, expectedCode) {
  expect(res.body).toEqual({ error: { code: expectedCode, message: expect.any(String) } });
}

describe('GET /api/link-title', () => {
  test('URL_REQUIRED when url omitted', async () => {
    const res = await request(app).get('/api/link-title');
    expect(res.status).toBe(400);
    expectErrorShape(res, 'URL_REQUIRED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('URL_TOO_LONG when url > 2048 chars', async () => {
    const res = await request(app).get('/api/link-title').query({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&pad=' + 'x'.repeat(2050)
    });
    expect(res.status).toBe(400);
    expectErrorShape(res, 'URL_TOO_LONG');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('UNSUPPORTED_HOST for Dropbox links', async () => {
    const res = await request(app).get('/api/link-title').query({
      url: 'https://www.dropbox.com/s/abc/video.mp4'
    });
    expect(res.status).toBe(400);
    expectErrorShape(res, 'UNSUPPORTED_HOST');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('BAD_LINK for unrecognized URLs', async () => {
    const res = await request(app).get('/api/link-title').query({
      url: 'https://example.com/video.mp4'
    });
    expect(res.status).toBe(400);
    expectErrorShape(res, 'BAD_LINK');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns YouTube oEmbed title', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ title: '  Never Gonna Give You Up  ' })
    });
    const res = await request(app).get('/api/link-title').query({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      title: 'Never Gonna Give You Up',
      platform: 'youtube',
      videoId: 'dQw4w9WgXcQ'
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = String(global.fetch.mock.calls[0][0]);
    expect(calledUrl).toContain('youtube.com/oembed');
    expect(calledUrl).toContain('dQw4w9WgXcQ');
  });

  test('truncates titles longer than 120 chars', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'x'.repeat(200) })
    });
    const res = await request(app).get('/api/link-title').query({
      url: 'https://vimeo.com/123456789'
    });
    expect(res.status).toBe(200);
    expect(res.body.platform).toBe('vimeo');
    expect(res.body.title).toHaveLength(120);
  });

  test('returns empty title when oEmbed fails', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const res = await request(app).get('/api/link-title').query({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      title: '',
      platform: 'youtube',
      videoId: 'dQw4w9WgXcQ'
    });
  });

  test('caches successful lookups', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'Cached Title' })
    });
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const first = await request(app).get('/api/link-title').query({ url });
    const second = await request(app).get('/api/link-title').query({ url });
    expect(first.body.title).toBe('Cached Title');
    expect(second.body.title).toBe('Cached Title');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('uses Loom and Wistia oEmbed endpoints', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'Loom Clip' })
    });
    const loomId = 'a'.repeat(32);
    const loom = await request(app).get('/api/link-title').query({
      url: `https://www.loom.com/share/${loomId}`
    });
    expect(loom.status).toBe(200);
    expect(loom.body.platform).toBe('loom');
    expect(String(global.fetch.mock.calls[0][0])).toContain('loom.com/v1/oembed');

    linkTitleCache.clear();
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'Wistia Clip' })
    });
    const wistia = await request(app).get('/api/link-title').query({
      url: 'https://example.wistia.com/medias/abc123xyz'
    });
    expect(wistia.status).toBe(200);
    expect(wistia.body.platform).toBe('wistia');
    expect(String(global.fetch.mock.calls[1][0])).toContain('fast.wistia.com/oembed');
  });
});
