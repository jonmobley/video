jest.mock('pg', () => require('./helpers/pg-mock').install());
const pgMock = require('./helpers/pg-mock');

const request = require('supertest');
const { app } = require('../../server');

const VALID_ID = 'b'.repeat(24) + '.mp4';

function finalizeBody(overrides = {}) {
  return {
    videoId: VALID_ID,
    totalChunks: 1,
    contentType: 'video/mp4',
    title: 'My Video',
    expiryDays: '7',
    ...overrides
  };
}

function expectErrorShape(res, expectedCode) {
  expect(res.body).toEqual({ error: { code: expectedCode, message: expect.any(String) } });
  expect(res.body.error.code).toBe(expectedCode);
  expect(res.body.error.message.length).toBeGreaterThan(0);
}

describe('POST /api/finalize-video validation', () => {
  beforeEach(() => pgMock.reset());

  test('MISSING_FIELDS when totalChunks omitted', async () => {
    const res = await request(app).post('/api/finalize-video').send({ videoId: VALID_ID, contentType: 'video/mp4' });
    expect(res.status).toBe(400);
    expectErrorShape(res, 'MISSING_FIELDS');
  });

  test('BAD_VIDEO_ID rejected before any DB call', async () => {
    const res = await request(app).post('/api/finalize-video').send(finalizeBody({ videoId: 'not-a-real-id' }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'BAD_VIDEO_ID');
    expect(pgMock.calls()).toEqual([]);
  });

  test('TITLE_REQUIRED when title is whitespace', async () => {
    const res = await request(app).post('/api/finalize-video').send(finalizeBody({ title: '   ' }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'TITLE_REQUIRED');
  });

  test('TITLE_TOO_LONG when title > 120 chars', async () => {
    const res = await request(app).post('/api/finalize-video').send(finalizeBody({ title: 'x'.repeat(121) }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'TITLE_TOO_LONG');
  });

  test('BAD_PASSWORD when password is not a string', async () => {
    const res = await request(app).post('/api/finalize-video').send(finalizeBody({ password: 123 }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'BAD_PASSWORD');
  });

  test('PASSWORD_TOO_LONG when password > 200 chars', async () => {
    const res = await request(app).post('/api/finalize-video').send(finalizeBody({ password: 'p'.repeat(201) }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'PASSWORD_TOO_LONG');
  });

  test('BAD_EXPIRY for non-integer expiry', async () => {
    const res = await request(app).post('/api/finalize-video').send(finalizeBody({ expiryDays: 'forever' }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'BAD_EXPIRY');
  });

  test('BAD_EXPIRY for over-range expiry', async () => {
    const res = await request(app).post('/api/finalize-video').send(finalizeBody({ expiryDays: 99999 }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'BAD_EXPIRY');
  });

  test('UNSUPPORTED_TYPE for non-video contentType', async () => {
    const res = await request(app).post('/api/finalize-video').send(finalizeBody({ contentType: 'text/html' }));
    expect(res.status).toBe(415);
    expectErrorShape(res, 'UNSUPPORTED_TYPE');
  });

  test('CHUNK_INTEGRITY when count mismatches totalChunks', async () => {
    pgMock.enqueue({ rows: [{ cnt: 1, min_idx: 0, max_idx: 0 }] });
    const res = await request(app).post('/api/finalize-video').send(finalizeBody({ totalChunks: 3 }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'CHUNK_INTEGRITY');
  });

  test('CHUNK_INTEGRITY when min_idx is not 0', async () => {
    pgMock.enqueue({ rows: [{ cnt: 3, min_idx: 1, max_idx: 3 }] });
    const res = await request(app).post('/api/finalize-video').send(finalizeBody({ totalChunks: 3 }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'CHUNK_INTEGRITY');
  });

  test('EMPTY_FILE deletes orphan chunks before responding', async () => {
    // Continuity check OK (1 chunk, idx 0..0)
    pgMock.enqueue({ rows: [{ cnt: 1, min_idx: 0, max_idx: 0 }] });
    // Chunk data: empty buffer
    pgMock.enqueue({ rows: [{ data: Buffer.alloc(0) }] });
    // The cleanup DELETE
    pgMock.enqueue({ rowCount: 1 });

    const res = await request(app).post('/api/finalize-video').send(finalizeBody());
    expect(res.status).toBe(400);
    expectErrorShape(res, 'EMPTY_FILE');

    // Verify the orphan-chunk DELETE actually fired
    const calls = pgMock.calls();
    const lastSql = calls[calls.length - 1].sql;
    expect(lastSql).toMatch(/DELETE FROM vs_upload_chunks/);
    expect(calls[calls.length - 1].params).toEqual([VALID_ID]);
  });

  test('FILE_TOO_LARGE when assembled size > MAX_FILE_SIZE, with cleanup', async () => {
    // Mock a tiny over-cap by patching the buffer length via a Proxy-ish trick:
    // we assemble two chunks whose combined Buffer.concat exceeds 1 GB. Use
    // a stub buffer object that lies about .length so we don't actually
    // allocate a gigabyte in the test process.
    const fakeBig = Buffer.alloc(1);
    Object.defineProperty(fakeBig, 'length', { value: 2 * 1024 * 1024 * 1024 });

    pgMock.enqueue({ rows: [{ cnt: 1, min_idx: 0, max_idx: 0 }] });
    pgMock.enqueue({ rows: [{ data: fakeBig }] });
    pgMock.enqueue({ rowCount: 1 });

    const res = await request(app).post('/api/finalize-video').send(finalizeBody());
    expect(res.status).toBe(413);
    expectErrorShape(res, 'FILE_TOO_LARGE');

    const calls = pgMock.calls();
    const lastSql = calls[calls.length - 1].sql;
    expect(lastSql).toMatch(/DELETE FROM vs_upload_chunks/);
  });
});
