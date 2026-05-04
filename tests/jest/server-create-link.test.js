jest.mock('pg', () => require('./helpers/pg-mock').install());
const pgMock = require('./helpers/pg-mock');

const request = require('supertest');
const { app, uploadCounts, embedAvailabilityCache } = require('../../server');

const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
  uploadCounts.clear();
  embedAvailabilityCache.clear();
});
afterEach(() => {
  global.fetch = originalFetch;
});

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

describe('POST /api/create-link-video – malformed / borderline video IDs', () => {
  beforeEach(() => pgMock.reset());

  describe('YouTube IDs rejected by the parser (BAD_LINK, no DB call)', () => {
    test('ID with unicode characters is rejected', async () => {
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgX\u00e9\u00e7'
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_LINK');
      expect(pgMock.calls()).toEqual([]);
    });

    test('ID with emoji is rejected', async () => {
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: 'https://www.youtube.com/watch?v=dQw4w9\u{1F600}XcQ'
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_LINK');
      expect(pgMock.calls()).toEqual([]);
    });

    test('ID shorter than 6 chars is rejected', async () => {
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: 'https://www.youtube.com/watch?v=abc'
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_LINK');
      expect(pgMock.calls()).toEqual([]);
    });

    test('ID with spaces is rejected', async () => {
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: 'https://www.youtube.com/watch?v=dQw4 w9WgXcQ'
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_LINK');
      expect(pgMock.calls()).toEqual([]);
    });

    test('ID with dots is rejected', async () => {
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: 'https://www.youtube.com/watch?v=dQw4.w9WgXcQ'
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_LINK');
      expect(pgMock.calls()).toEqual([]);
    });

    test('empty v= param is rejected', async () => {
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: 'https://www.youtube.com/watch?v='
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_LINK');
      expect(pgMock.calls()).toEqual([]);
    });

    test('youtu.be with too-short ID is rejected', async () => {
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: 'https://youtu.be/ab'
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_LINK');
      expect(pgMock.calls()).toEqual([]);
    });
  });

  describe('Vimeo IDs rejected by the parser (BAD_LINK, no DB call)', () => {
    test('non-numeric Vimeo path is rejected', async () => {
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: 'https://vimeo.com/not-a-number'
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_LINK');
      expect(pgMock.calls()).toEqual([]);
    });

    test('Vimeo root path is rejected', async () => {
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: 'https://vimeo.com/'
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_LINK');
      expect(pgMock.calls()).toEqual([]);
    });

    test('Vimeo username path (non-numeric) is rejected', async () => {
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: 'https://vimeo.com/settings'
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_LINK');
      expect(pgMock.calls()).toEqual([]);
    });
  });

  describe('double-encoded and mangled URLs (BAD_LINK, no DB call)', () => {
    test('double-encoded YouTube URL is rejected', async () => {
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ%253Fextra%253Dstuff'
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_LINK');
      expect(pgMock.calls()).toEqual([]);
    });

    test('YouTube URL with percent-encoded slashes in ID is rejected', async () => {
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: 'https://www.youtube.com/watch?v=dQw4%2Fw9WgXcQ'
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_LINK');
      expect(pgMock.calls()).toEqual([]);
    });

    test('completely garbled scheme is rejected', async () => {
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: 'htp://youtube.com/watch?v=dQw4w9WgXcQ'
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_LINK');
      expect(pgMock.calls()).toEqual([]);
    });
  });

  describe('oversized IDs rejected by server-side length check (BAD_VIDEO_ID, no DB call)', () => {
    test('YouTube ID with 50 chars is rejected as too long', async () => {
      const longId = 'A'.repeat(50);
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: `https://www.youtube.com/watch?v=${longId}`
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_VIDEO_ID');
      expect(pgMock.calls()).toEqual([]);
    });

    test('YouTube ID with 17 chars (just over limit) is rejected', async () => {
      const id = 'A'.repeat(17);
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: `https://www.youtube.com/watch?v=${id}`
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_VIDEO_ID');
      expect(pgMock.calls()).toEqual([]);
    });

    test('Vimeo ID with 30 digits is rejected by the parser', async () => {
      const longVimeoId = '9'.repeat(30);
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: `https://vimeo.com/${longVimeoId}`
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_LINK');
      expect(pgMock.calls()).toEqual([]);
    });

    test('Vimeo ID with 16 digits (just over limit) is rejected by the server', async () => {
      const id = '9'.repeat(16);
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: `https://vimeo.com/${id}`
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_VIDEO_ID');
      expect(pgMock.calls()).toEqual([]);
    });

    test('YouTube ID with 65 chars exceeds parser limit (BAD_LINK)', async () => {
      const id = 'B'.repeat(65);
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: `https://www.youtube.com/watch?v=${id}`
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_LINK');
      expect(pgMock.calls()).toEqual([]);
    });

    test('Vimeo unlisted hash over 64 chars is rejected by the parser', async () => {
      const hash = 'a'.repeat(65);
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: `https://vimeo.com/123456789/${hash}`
      }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'BAD_LINK');
      expect(pgMock.calls()).toEqual([]);
    });
  });

  describe('valid borderline IDs that pass all checks (saved to DB)', () => {
    test('YouTube ID exactly 6 chars (minimum length) is accepted', async () => {
      pgMock.enqueue({ rows: [] });
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: 'https://www.youtube.com/watch?v=AbCdEf'
      }));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.platform).toBe('youtube');
      expect(res.body.embedVideoId).toBe('AbCdEf');
      const insertCall = pgMock.calls().find(c => c.sql.includes('INSERT'));
      expect(insertCall).toBeDefined();
      expect(insertCall.params).toContain('AbCdEf');
    });

    test('YouTube ID exactly 16 chars (at server limit) is accepted', async () => {
      const id = 'A'.repeat(16);
      pgMock.enqueue({ rows: [] });
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: `https://www.youtube.com/watch?v=${id}`
      }));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.embedVideoId).toBe(id);
    });

    test('YouTube ID made entirely of hyphens and underscores is accepted', async () => {
      const weirdId = '-_-_-_-_-_-';
      pgMock.enqueue({ rows: [] });
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: `https://www.youtube.com/watch?v=${weirdId}`
      }));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.embedVideoId).toBe(weirdId);
    });

    test('Vimeo ID with 15 digits (at server limit) is accepted', async () => {
      const id = '9'.repeat(15);
      pgMock.enqueue({ rows: [] });
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: `https://vimeo.com/${id}`
      }));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.platform).toBe('vimeo');
      expect(res.body.embedVideoId).toBe(id);
    });

    test('Vimeo unlisted URL with hash is accepted and stored as ID/hash', async () => {
      pgMock.enqueue({ rows: [] });
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: 'https://vimeo.com/123456789/abc123def'
      }));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.embedVideoId).toBe('123456789/abc123def');
      const insertCall = pgMock.calls().find(c => c.sql.includes('INSERT'));
      expect(insertCall.params).toContain('123456789/abc123def');
    });

    test('standard 11-char YouTube ID is accepted', async () => {
      pgMock.enqueue({ rows: [] });
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      }));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.embedVideoId).toBe('dQw4w9WgXcQ');
    });
  });

  describe('URL-level edge cases reaching the parser', () => {
    test('URL at exactly 2048 chars with valid YouTube link is accepted', async () => {
      const base = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&pad=';
      const padding = 'x'.repeat(2048 - base.length);
      const url = base + padding;
      expect(url.length).toBe(2048);
      pgMock.enqueue({ rows: [] });
      const res = await request(app).post('/api/create-link-video').send(linkBody({ url }));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('URL at 2049 chars is rejected as too long', async () => {
      const base = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&pad=';
      const padding = 'x'.repeat(2049 - base.length);
      const url = base + padding;
      expect(url.length).toBe(2049);
      const res = await request(app).post('/api/create-link-video').send(linkBody({ url }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'URL_TOO_LONG');
    });

    test('URL with fragment (#) still parses the video ID correctly', async () => {
      pgMock.enqueue({ rows: [] });
      const res = await request(app).post('/api/create-link-video').send(linkBody({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=30'
      }));
      expect(res.status).toBe(200);
      expect(res.body.embedVideoId).toBe('dQw4w9WgXcQ');
    });

    test('non-string URL (number) is rejected', async () => {
      const res = await request(app).post('/api/create-link-video').send(linkBody({ url: 12345 }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'URL_REQUIRED');
      expect(pgMock.calls()).toEqual([]);
    });

    test('null URL is rejected', async () => {
      const res = await request(app).post('/api/create-link-video').send(linkBody({ url: null }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'URL_REQUIRED');
      expect(pgMock.calls()).toEqual([]);
    });

    test('URL with only whitespace is rejected', async () => {
      const res = await request(app).post('/api/create-link-video').send(linkBody({ url: '   ' }));
      expect(res.status).toBe(400);
      expectErrorShape(res, 'URL_REQUIRED');
      expect(pgMock.calls()).toEqual([]);
    });
  });
});

describe('POST /api/create-link-video – embed availability check', () => {
  beforeEach(() => pgMock.reset());

  test('VIDEO_UNAVAILABLE when YouTube video is private (401)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://www.youtube.com/watch?v=PRIVATE_VD01'
    }));
    expect(res.status).toBe(422);
    expectErrorShape(res, 'VIDEO_UNAVAILABLE');
    expect(res.body.error.message).toMatch(/YouTube/i);
    expect(pgMock.calls()).toEqual([]);
  });

  test('VIDEO_UNAVAILABLE when YouTube video is removed (404)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://www.youtube.com/watch?v=REMOVED_VD01'
    }));
    expect(res.status).toBe(422);
    expectErrorShape(res, 'VIDEO_UNAVAILABLE');
    expect(res.body.error.message).toContain('privacy settings on YouTube');
    expect(pgMock.calls()).toEqual([]);
  });

  test('VIDEO_UNAVAILABLE when Vimeo video has embedding disabled (403)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://vimeo.com/999888777'
    }));
    expect(res.status).toBe(422);
    expectErrorShape(res, 'VIDEO_UNAVAILABLE');
    expect(res.body.error.message).toContain('embedding is enabled on Vimeo');
    expect(pgMock.calls()).toEqual([]);
  });

  test('save proceeds with warning when embed check times out (AbortError)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new DOMException('signal timed out', 'AbortError'));
    pgMock.enqueue({ rows: [] });
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://www.youtube.com/watch?v=TIMEOUT_VD01'
    }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.warning).toBeDefined();
    expect(res.body.warning).toMatch(/couldn.t verify/i);
    const insertCall = pgMock.calls().find(c => c.sql.includes('INSERT'));
    expect(insertCall).toBeDefined();
  });

  test('save proceeds with warning when embed check has network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    pgMock.enqueue({ rows: [] });
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://www.youtube.com/watch?v=NETERR_VD01'
    }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.warning).toBeDefined();
    expect(res.body.warning).toMatch(/couldn.t verify/i);
    const insertCall = pgMock.calls().find(c => c.sql.includes('INSERT'));
    expect(insertCall).toBeDefined();
  });

  test('VIDEO_UNAVAILABLE when Dailymotion video is private (404)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://www.dailymotion.com/video/x7tgd1a'
    }));
    expect(res.status).toBe(422);
    expectErrorShape(res, 'VIDEO_UNAVAILABLE');
    expect(res.body.error.message).toMatch(/Dailymotion/i);
    expect(global.fetch).toHaveBeenCalled();
    expect(pgMock.calls()).toEqual([]);
  });

  test('available Dailymotion video saves normally', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    pgMock.enqueue({ rows: [] });
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://www.dailymotion.com/video/x7tgd1a'
    }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.warning).toBeUndefined();
    expect(global.fetch).toHaveBeenCalled();
    const fetchUrl = global.fetch.mock.calls[0][0];
    expect(fetchUrl).toContain('dailymotion.com/services/oembed');
  });

  test('VIDEO_UNAVAILABLE when Loom video is private (404)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://www.loom.com/share/abcdef01234567890abcdef012345678'
    }));
    expect(res.status).toBe(422);
    expectErrorShape(res, 'VIDEO_UNAVAILABLE');
    expect(res.body.error.message).toMatch(/Loom/i);
    expect(global.fetch).toHaveBeenCalled();
    expect(pgMock.calls()).toEqual([]);
  });

  test('available Loom video saves normally with HEAD request', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    pgMock.enqueue({ rows: [] });
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://www.loom.com/share/abcdef01234567890abcdef012345678'
    }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.warning).toBeUndefined();
    expect(global.fetch).toHaveBeenCalled();
    const fetchOpts = global.fetch.mock.calls[0][1];
    expect(fetchOpts.method).toBe('HEAD');
  });

  test('VIDEO_UNAVAILABLE when Wistia video is private (404)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://fast.wistia.com/medias/abc123'
    }));
    expect(res.status).toBe(422);
    expectErrorShape(res, 'VIDEO_UNAVAILABLE');
    expect(res.body.error.message).toMatch(/Wistia/i);
    expect(global.fetch).toHaveBeenCalled();
    expect(pgMock.calls()).toEqual([]);
  });

  test('available Wistia video saves normally', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    pgMock.enqueue({ rows: [] });
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://fast.wistia.com/medias/abc123'
    }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.warning).toBeUndefined();
    expect(global.fetch).toHaveBeenCalled();
    const fetchUrl = global.fetch.mock.calls[0][0];
    expect(fetchUrl).toContain('fast.wistia.com/oembed');
  });

  test('Dailymotion save proceeds with warning on network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    pgMock.enqueue({ rows: [] });
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://www.dailymotion.com/video/x7tgd1a'
    }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.warning).toMatch(/couldn.t verify/i);
  });

  test('Loom save proceeds with warning on timeout', async () => {
    global.fetch = jest.fn().mockRejectedValue(new DOMException('signal timed out', 'AbortError'));
    pgMock.enqueue({ rows: [] });
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://www.loom.com/share/abcdef01234567890abcdef012345678'
    }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.warning).toMatch(/couldn.t verify/i);
  });

  test('Wistia save proceeds with warning on network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));
    pgMock.enqueue({ rows: [] });
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://fast.wistia.com/medias/abc123'
    }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.warning).toMatch(/couldn.t verify/i);
  });

  test('Loom falls back to GET when HEAD returns 405', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 405 })
      .mockResolvedValueOnce({ ok: true });
    pgMock.enqueue({ rows: [] });
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://www.loom.com/share/abcdef01234567890abcdef012345678'
    }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][1].method).toBe('HEAD');
    expect(global.fetch.mock.calls[1][1].method).toBe('GET');
  });

  test('available YouTube video saves normally without warning', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    pgMock.enqueue({ rows: [] });
    const res = await request(app).post('/api/create-link-video').send(linkBody({
      url: 'https://www.youtube.com/watch?v=PUBLIC_VD001'
    }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.warning).toBeUndefined();
    expect(global.fetch).toHaveBeenCalled();
    const insertCall = pgMock.calls().find(c => c.sql.includes('INSERT'));
    expect(insertCall).toBeDefined();
  });
});
