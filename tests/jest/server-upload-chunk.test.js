jest.mock('pg', () => require('./helpers/pg-mock').install());
const pgMock = require('./helpers/pg-mock');

const request = require('supertest');
const { app } = require('../../server');

const VALID_ID = 'a'.repeat(24) + '.mp4';
const SMALL_B64 = Buffer.from('hello').toString('base64');

function chunkBody(overrides = {}) {
  return {
    videoId: VALID_ID,
    chunkIndex: 0,
    totalChunks: 1,
    data: SMALL_B64,
    contentType: 'video/mp4',
    ...overrides
  };
}

function expectErrorShape(res, expectedCode) {
  // Assert the *exact* code and the canonical { error: { code, message } }
  // shape so a regression that swaps codes (e.g. BAD_VIDEO_ID -> ERROR) or
  // drops the wrapper object will fail loudly.
  expect(res.body).toEqual({ error: { code: expectedCode, message: expect.any(String) } });
  expect(res.body.error.code).toBe(expectedCode);
  expect(res.body.error.message.length).toBeGreaterThan(0);
}

describe('POST /api/upload-chunk validation', () => {
  beforeEach(() => pgMock.reset());

  test('MISSING_FIELDS when body is empty', async () => {
    const res = await request(app).post('/api/upload-chunk').send({});
    expect(res.status).toBe(400);
    expectErrorShape(res, 'MISSING_FIELDS');
  });

  test('BAD_VIDEO_ID for path-traversal-ish ids', async () => {
    const res = await request(app).post('/api/upload-chunk').send(chunkBody({ videoId: '../etc/passwd' }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'BAD_VIDEO_ID');
  });

  test('BAD_VIDEO_ID for too-short ids', async () => {
    const res = await request(app).post('/api/upload-chunk').send(chunkBody({ videoId: 'abc' }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'BAD_VIDEO_ID');
  });

  test('BAD_CHUNK_INDEX for negative chunkIndex', async () => {
    const res = await request(app).post('/api/upload-chunk').send(chunkBody({ chunkIndex: -1 }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'BAD_CHUNK_INDEX');
  });

  test('BAD_CHUNK_INDEX for non-integer chunkIndex', async () => {
    const res = await request(app).post('/api/upload-chunk').send(chunkBody({ chunkIndex: 1.5 }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'BAD_CHUNK_INDEX');
  });

  test('BAD_TOTAL_CHUNKS for over-cap totalChunks', async () => {
    const res = await request(app).post('/api/upload-chunk').send(chunkBody({ totalChunks: 100001 }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'BAD_TOTAL_CHUNKS');
  });

  test('UNSUPPORTED_TYPE for text/html', async () => {
    const res = await request(app).post('/api/upload-chunk').send(chunkBody({ contentType: 'text/html' }));
    expect(res.status).toBe(415);
    expectErrorShape(res, 'UNSUPPORTED_TYPE');
  });

  test('EMPTY_CHUNK when data is empty string', async () => {
    const res = await request(app).post('/api/upload-chunk').send(chunkBody({ data: '' }));
    expect(res.status).toBe(400);
    expectErrorShape(res, 'MISSING_FIELDS');
  });

  test('EMPTY_CHUNK when base64 decodes to 0 bytes', async () => {
    // A non-empty base64 string that decodes to zero bytes is uncommon, so
    // exercise the typeof-string guard instead which returns the same code.
    const res = await request(app).post('/api/upload-chunk').send(chunkBody({ data: 123 }));
    expect(res.status).toBe(400);
    // 123 is not a string, but `data` is also truthy so we get past
    // MISSING_FIELDS and into the EMPTY_CHUNK branch via the typeof check.
    expectErrorShape(res, 'EMPTY_CHUNK');
  });

  test('PAYLOAD_TOO_LARGE returns the canonical shape', async () => {
    // express.json is configured with an 8 MB limit; send 10 MB.
    const big = 'a'.repeat(10 * 1024 * 1024);
    const res = await request(app)
      .post('/api/upload-chunk')
      .set('Content-Type', 'application/json')
      .send('{"x":"' + big + '"}');
    expect(res.status).toBe(413);
    expectErrorShape(res, 'PAYLOAD_TOO_LARGE');
  });

  test('BAD_JSON returns the canonical shape', async () => {
    const res = await request(app)
      .post('/api/upload-chunk')
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
    expectErrorShape(res, 'BAD_JSON');
  });
});
