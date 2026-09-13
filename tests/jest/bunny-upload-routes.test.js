jest.mock('pg', () => require('./helpers/pg-mock').install());

const request = require('supertest');
const pgMock = require('./helpers/pg-mock');
const { app } = require('../../server');

const GUID = '3f1c2a9e-7b4d-4c8e-9a1b-2d3e4f5a6b7c';
const EDITOR = 'seussical-editor-secret';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body))
  };
}

describe('Bunny Stream upload routes', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    pgMock.reset();
    // DATABASE_URL routes page-store through the pg mock instead of throwing.
    process.env = { ...originalEnv, SEUSSICAL_EDITOR_TOKEN: EDITOR, DATABASE_URL: 'postgres://mock/test' };
    delete process.env.BUNNY_STREAM_LIBRARY_ID;
    delete process.env.BUNNY_STREAM_API_KEY;
    delete process.env.BUNNY_STREAM_CDN_HOSTNAME;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  function configureBunny() {
    process.env.BUNNY_STREAM_LIBRARY_ID = '12345';
    process.env.BUNNY_STREAM_API_KEY = 'stream-key';
    process.env.BUNNY_STREAM_CDN_HOSTNAME = 'vz-abc.b-cdn.net';
  }

  describe('POST /api/bunny-create-upload', () => {
    test('rejects bad page ids before touching auth', async () => {
      const res = await request(app).post('/api/bunny-create-upload').send({ page: 'Bad Page!', title: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_PAGE');
    });

    test('requires a title', async () => {
      const res = await request(app).post('/api/bunny-create-upload').send({ page: 'seussical', title: '' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_TITLE');
    });

    test('requires the page editor credential', async () => {
      const res = await request(app).post('/api/bunny-create-upload').send({ page: 'seussical', title: 'Act One' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    });

    test('reports when Bunny is not configured', async () => {
      pgMock.enqueue({ rows: [] }); // editor_token_hash lookup misses, env token is used
      const res = await request(app)
        .post('/api/bunny-create-upload')
        .set('Authorization', `Bearer ${EDITOR}`)
        .send({ page: 'seussical', title: 'Act One' });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('BUNNY_NOT_CONFIGURED');
    });

    test('creates the Bunny video and returns presigned TUS credentials', async () => {
      configureBunny();
      pgMock.enqueue({ rows: [] });
      global.fetch = jest.fn(async () => jsonResponse(200, { guid: GUID }));

      const res = await request(app)
        .post('/api/bunny-create-upload')
        .set('Authorization', `Bearer ${EDITOR}`)
        .send({ page: 'seussical', title: 'Act One' });

      expect(res.status).toBe(200);
      expect(res.body.videoId).toBe(GUID);
      expect(res.body.libraryId).toBe('12345');
      expect(res.body.tusEndpoint).toBe('https://video.bunnycdn.com/tusupload');
      expect(res.body.signature).toMatch(/^[0-9a-f]{64}$/);
      expect(res.body.platform).toBe('bunny');
      expect(res.body.embedUrl).toBe(`https://player.mediadelivery.net/embed/12345/${GUID}`);
      expect(res.body.thumbnailUrl).toBe(`https://vz-abc.b-cdn.net/${GUID}/thumbnail.jpg`);
      // The API key is only ever used server-side.
      expect(JSON.stringify(res.body)).not.toContain('stream-key');
      expect(global.fetch.mock.calls[0][0]).toBe('https://video.bunnycdn.com/library/12345/videos');
    });

    test('maps Bunny failures to 502', async () => {
      configureBunny();
      pgMock.enqueue({ rows: [] });
      global.fetch = jest.fn(async () => jsonResponse(401, { Message: 'bad key' }));
      const res = await request(app)
        .post('/api/bunny-create-upload')
        .set('Authorization', `Bearer ${EDITOR}`)
        .send({ page: 'seussical', title: 'Act One' });
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('BUNNY_UPSTREAM');
    });
  });

  describe('GET /api/bunny-video-status', () => {
    test('validates the video id', async () => {
      const res = await request(app).get('/api/bunny-video-status').query({ page: 'seussical', videoId: 'nope' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_VIDEO_ID');
    });

    test('returns processing state for the editor', async () => {
      configureBunny();
      pgMock.enqueue({ rows: [] });
      global.fetch = jest.fn(async () => jsonResponse(200, {
        guid: GUID, status: 4, encodeProgress: 100, length: 95, thumbnailFileName: 'thumbnail.jpg'
      }));
      const res = await request(app)
        .get('/api/bunny-video-status')
        .set('Authorization', `Bearer ${EDITOR}`)
        .query({ page: 'seussical', videoId: GUID });
      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(true);
      expect(res.body.length).toBe(95);
      expect(res.body.thumbnailUrl).toBe(`https://vz-abc.b-cdn.net/${GUID}/thumbnail.jpg`);
      expect(res.body.hasCustomThumbnail).toBe(false);
      expect(res.body.candidateThumbnails).toEqual(
        [1, 2, 3, 4, 5].map(n => `https://vz-abc.b-cdn.net/${GUID}/thumbnail_${n}.jpg`)
      );
      expect(res.headers['cache-control']).toBe('no-store');
    });

    test('reports a custom thumbnail and withholds candidates while processing', async () => {
      configureBunny();
      pgMock.enqueue({ rows: [] });
      global.fetch = jest.fn(async () => jsonResponse(200, {
        guid: GUID, status: 3, encodeProgress: 40, length: 95, thumbnailFileName: 'thumbnail_custom_abc.jpg'
      }));
      const res = await request(app)
        .get('/api/bunny-video-status')
        .set('Authorization', `Bearer ${EDITOR}`)
        .query({ page: 'seussical', videoId: GUID });
      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(false);
      expect(res.body.hasCustomThumbnail).toBe(true);
      expect(res.body.thumbnailUrl).toBe(`https://vz-abc.b-cdn.net/${GUID}/thumbnail_custom_abc.jpg`);
      expect(res.body.candidateThumbnails).toEqual([]);
    });
  });

  describe('POST /api/bunny-set-thumbnail', () => {
    // 1x1 JPEG-ish payload; the server only checks type, size and base64 shape.
    const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    test('requires the page editor credential', async () => {
      const res = await request(app)
        .post('/api/bunny-set-thumbnail')
        .send({ page: 'seussical', videoId: GUID, data: PNG_BASE64, contentType: 'image/png' });
      expect(res.status).toBe(401);
    });

    test('rejects oversized images before calling Bunny', async () => {
      configureBunny();
      pgMock.enqueue({ rows: [] });
      global.fetch = jest.fn();
      const big = Buffer.alloc(600 * 1024, 1).toString('base64');
      const res = await request(app)
        .post('/api/bunny-set-thumbnail')
        .set('Authorization', `Bearer ${EDITOR}`)
        .send({ page: 'seussical', videoId: GUID, data: big, contentType: 'image/jpeg' });
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('rejects unsupported image types', async () => {
      configureBunny();
      pgMock.enqueue({ rows: [] });
      const res = await request(app)
        .post('/api/bunny-set-thumbnail')
        .set('Authorization', `Bearer ${EDITOR}`)
        .send({ page: 'seussical', videoId: GUID, data: PNG_BASE64, contentType: 'image/gif' });
      expect(res.status).toBe(415);
    });

    test('only accepts candidate URLs on our pull zone for this video', async () => {
      configureBunny();
      global.fetch = jest.fn();
      const other = '11111111-2222-4333-8444-555555555555';
      for (const bad of [
        'https://evil.example.com/x.jpg',
        `https://vz-abc.b-cdn.net/${other}/thumbnail_1.jpg`,
        `http://vz-abc.b-cdn.net/${GUID}/thumbnail_1.jpg`,
        `https://vz-abc.b-cdn.net/${GUID}/original`
      ]) {
        pgMock.enqueue({ rows: [] });
        const res = await request(app)
          .post('/api/bunny-set-thumbnail')
          .set('Authorization', `Bearer ${EDITOR}`)
          .send({ page: 'seussical', videoId: GUID, thumbnailUrl: bad });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('BAD_THUMBNAIL_URL');
      }
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('uploads the image to Bunny and updates saved rows with the new URL', async () => {
      configureBunny();
      pgMock.enqueue({ rows: [] });          // auth
      pgMock.enqueue({ rowCount: 1, rows: [] }); // UPDATE videos
      global.fetch = jest.fn()
        .mockResolvedValueOnce(jsonResponse(200, { success: true }))
        .mockResolvedValueOnce(jsonResponse(200, {
          guid: GUID, status: 4, length: 95, thumbnailFileName: 'thumbnail_9f8e.jpg'
        }));

      const res = await request(app)
        .post('/api/bunny-set-thumbnail')
        .set('Authorization', `Bearer ${EDITOR}`)
        .send({ page: 'seussical', videoId: GUID, data: PNG_BASE64, contentType: 'image/png' });

      expect(res.status).toBe(200);
      expect(res.body.thumbnailUrl).toBe(`https://vz-abc.b-cdn.net/${GUID}/thumbnail_9f8e.jpg`);
      expect(res.body.hasCustomThumbnail).toBe(true);

      const [url, init] = global.fetch.mock.calls[0];
      expect(url).toBe(`https://video.bunnycdn.com/library/12345/videos/${GUID}/thumbnail`);
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('image/png');
      expect(Buffer.isBuffer(init.body)).toBe(true);
      expect(init.body.equals(Buffer.from(PNG_BASE64, 'base64'))).toBe(true);

      const update = pgMock.calls().find(c => /UPDATE videos SET thumbnail_url/.test(c.sql));
      expect(update).toBeTruthy();
      expect(update.params).toEqual([`https://vz-abc.b-cdn.net/${GUID}/thumbnail_9f8e.jpg`, GUID]);
    });

    test('passes a candidate frame URL through to Bunny as thumbnailUrl', async () => {
      configureBunny();
      pgMock.enqueue({ rows: [] });
      pgMock.enqueue({ rowCount: 0, rows: [] });
      const candidate = `https://vz-abc.b-cdn.net/${GUID}/thumbnail_3.jpg`;
      global.fetch = jest.fn()
        .mockResolvedValueOnce(jsonResponse(200, { success: true }))
        .mockResolvedValueOnce(jsonResponse(200, { guid: GUID, status: 4, thumbnailFileName: 'thumbnail.jpg' }));

      const res = await request(app)
        .post('/api/bunny-set-thumbnail')
        .set('Authorization', `Bearer ${EDITOR}`)
        .send({ page: 'seussical', videoId: GUID, thumbnailUrl: candidate });

      expect(res.status).toBe(200);
      const [url, init] = global.fetch.mock.calls[0];
      expect(url).toBe(`https://video.bunnycdn.com/library/12345/videos/${GUID}/thumbnail?thumbnailUrl=${encodeURIComponent(candidate)}`);
      expect(init.body).toBeUndefined();
      // Default file name kept → response carries a cache-busting version.
      expect(res.body.thumbnailUrl).toMatch(new RegExp(`^https://vz-abc.b-cdn.net/${GUID}/thumbnail.jpg\\?v=\\d+$`));
      expect(res.body.hasCustomThumbnail).toBe(false);
    });

    test('maps Bunny failures to 502', async () => {
      configureBunny();
      pgMock.enqueue({ rows: [] });
      global.fetch = jest.fn(async () => jsonResponse(500, { Message: 'boom' }));
      const res = await request(app)
        .post('/api/bunny-set-thumbnail')
        .set('Authorization', `Bearer ${EDITOR}`)
        .send({ page: 'seussical', videoId: GUID, data: PNG_BASE64, contentType: 'image/png' });
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('BUNNY_UPSTREAM');
    });
  });

  describe('POST /api/bunny-discard-upload', () => {
    test('does not delete a video that a saved page references', async () => {
      configureBunny();
      pgMock.enqueue({ rows: [] });       // auth lookup
      pgMock.enqueue({ rows: [{ 1: 1 }] }); // still referenced by a page
      global.fetch = jest.fn();
      const res = await request(app)
        .post('/api/bunny-discard-upload')
        .set('Authorization', `Bearer ${EDITOR}`)
        .send({ page: 'seussical', videoId: GUID });
      expect(res.status).toBe(409);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('deletes an orphaned upload from Bunny', async () => {
      configureBunny();
      pgMock.enqueue({ rows: [] });
      pgMock.enqueue({ rows: [] });
      global.fetch = jest.fn(async () => jsonResponse(200, {}));
      const res = await request(app)
        .post('/api/bunny-discard-upload')
        .set('Authorization', `Bearer ${EDITOR}`)
        .send({ page: 'seussical', videoId: GUID });
      expect(res.status).toBe(200);
      const [url, init] = global.fetch.mock.calls[0];
      expect(url).toBe(`https://video.bunnycdn.com/library/12345/videos/${GUID}`);
      expect(init.method).toBe('DELETE');
    });
  });
});
