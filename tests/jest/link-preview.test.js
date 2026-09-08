jest.mock('pg', () => require('./helpers/pg-mock').install());
const pgMock = require('./helpers/pg-mock');

const request = require('supertest');
const { app, embedAvailabilityCache } = require('../../server');

const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = jest.fn();
  embedAvailabilityCache.clear();
  pgMock.reset();
});
afterEach(() => {
  global.fetch = originalFetch;
});

describe('GET /api/link-preview', () => {
  test('URL_REQUIRED when url omitted', async () => {
    const res = await request(app).get('/api/link-preview');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('URL_REQUIRED');
  });

  test('UNSUPPORTED_HOST for Dropbox', async () => {
    const res = await request(app).get('/api/link-preview').query({
      url: 'https://www.dropbox.com/s/abc/video.mp4'
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_HOST');
  });

  test('BAD_LINK for unrecognized URL', async () => {
    const res = await request(app).get('/api/link-preview').query({
      url: 'https://example.com/not-a-video'
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_LINK');
  });

  test('returns title + thumbnail from YouTube oEmbed', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        title: 'Practice run',
        thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        author_name: 'Channel'
      })
    });
    const res = await request(app).get('/api/link-preview').query({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    });
    expect(res.status).toBe(200);
    expect(res.body.platform).toBe('youtube');
    expect(res.body.videoId).toBe('dQw4w9WgXcQ');
    expect(res.body.title).toBe('Practice run');
    expect(res.body.thumbnailUrl).toContain('ytimg.com');
    expect(res.body.authorName).toBe('Channel');
    expect(res.body.available).toBe(true);
    expect(res.body.uncertain).toBe(false);
  });

  test('marks uncertain when oEmbed fetch fails', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));
    const res = await request(app).get('/api/link-preview').query({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    });
    expect(res.status).toBe(200);
    expect(res.body.uncertain).toBe(true);
    expect(res.body.platform).toBe('youtube');
  });
});
