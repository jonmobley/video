jest.mock('pg', () => require('./helpers/pg-mock').install());

const pgMock = require('./helpers/pg-mock');
const { handler } = require('../../handlers/save-videos');

const GUID = '3f1c2a9e-7b4d-4c8e-9a1b-2d3e4f5a6b7c';
const OLD_GUID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const EDITOR = 'oz-editor-secret';

function event(body, token = EDITOR) {
  return {
    httpMethod: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body)
  };
}

function bunnyVideo(overrides = {}) {
  return {
    id: GUID,
    wistiaId: GUID,
    platform: 'bunny',
    title: 'Opening Number',
    category: 'all',
    tags: ['dancers'],
    video_url: `https://player.mediadelivery.net/embed/12345/${GUID}`,
    thumbnailUrl: `https://vz-abc.b-cdn.net/${GUID}/thumbnail.jpg`,
    duration: 187.4,
    ...overrides
  };
}

describe('save-videos with Bunny Stream uploads', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    pgMock.reset();
    process.env = {
      ...originalEnv,
      OZ_EDITOR_TOKEN: EDITOR,
      DATABASE_URL: 'postgres://mock/test',
      BUNNY_STREAM_LIBRARY_ID: '12345',
      BUNNY_STREAM_API_KEY: 'stream-key'
    };
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '{}' }));
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  test('rejects a bunny row whose id is not a Bunny GUID', async () => {
    pgMock.enqueue({ rows: [] }); // editor_token_hash lookup
    const res = await handler(event({ page: 'oz', videos: [bunnyVideo({ wistiaId: 'ssgxvlsdmx', id: 'ssgxvlsdmx' })] }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.message).toMatch(/Bunny Stream video id/);
  });

  test('rejects an unknown platform', async () => {
    pgMock.enqueue({ rows: [] });
    const res = await handler(event({ page: 'oz', videos: [bunnyVideo({ platform: 'tiktok' })] }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.message).toMatch(/platform/);
  });

  test('persists platform, embed URL, thumbnail and rounded duration', async () => {
    pgMock.enqueue({ rows: [] }); // auth
    pgMock.enqueue({});           // BEGIN
    pgMock.enqueue({});           // advisory lock
    pgMock.enqueue({ rows: [] }); // previous bunny ids
    pgMock.enqueue({});           // DELETE
    pgMock.enqueue({});           // INSERT
    pgMock.enqueue({});           // COMMIT

    const res = await handler(event({ page: 'oz', videos: [bunnyVideo()] }));
    expect(res.statusCode).toBe(200);

    const insert = pgMock.calls().find(call => /INSERT INTO videos/.test(call.sql));
    expect(insert).toBeDefined();
    expect(insert.sql).toMatch(/duration_seconds/);
    expect(insert.params[1]).toBe(GUID);
    expect(insert.params[8]).toBe(`https://player.mediadelivery.net/embed/12345/${GUID}`);
    expect(insert.params[9]).toBe('bunny');
    expect(insert.params[10]).toBe(`https://vz-abc.b-cdn.net/${GUID}/thumbnail.jpg`);
    expect(insert.params[11]).toBe(187);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('deletes Bunny videos that were removed from the page', async () => {
    pgMock.enqueue({ rows: [] });                        // auth
    pgMock.enqueue({});                                  // BEGIN
    pgMock.enqueue({});                                  // lock
    pgMock.enqueue({ rows: [{ wistia_id: OLD_GUID }, { wistia_id: GUID }] }); // previous bunny ids
    pgMock.enqueue({});                                  // DELETE
    pgMock.enqueue({});                                  // INSERT (GUID kept)
    pgMock.enqueue({});                                  // COMMIT
    pgMock.enqueue({ rows: [] });                        // OLD_GUID not used on another page

    const res = await handler(event({ page: 'oz', videos: [bunnyVideo()] }));
    expect(res.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe(`https://video.bunnycdn.com/library/12345/videos/${OLD_GUID}`);
    expect(init.method).toBe('DELETE');
  });

  test('keeps a Bunny video that another page still uses', async () => {
    pgMock.enqueue({ rows: [] });
    pgMock.enqueue({});
    pgMock.enqueue({});
    pgMock.enqueue({ rows: [{ wistia_id: OLD_GUID }] });
    pgMock.enqueue({});
    pgMock.enqueue({});
    pgMock.enqueue({ rows: [{ 1: 1 }] }); // referenced elsewhere

    const res = await handler(event({ page: 'oz', videos: [] }));
    expect(res.statusCode).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('a Bunny delete failure does not fail the save', async () => {
    pgMock.enqueue({ rows: [] });
    pgMock.enqueue({});
    pgMock.enqueue({});
    pgMock.enqueue({ rows: [{ wistia_id: OLD_GUID }] });
    pgMock.enqueue({});
    pgMock.enqueue({});
    pgMock.enqueue({ rows: [] });
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' }));

    const res = await handler(event({ page: 'oz', videos: [] }));
    expect(res.statusCode).toBe(200);
  });

  test('legacy Wistia rows still save without Bunny fields', async () => {
    pgMock.enqueue({ rows: [] });
    pgMock.enqueue({});
    pgMock.enqueue({});
    pgMock.enqueue({ rows: [] });
    pgMock.enqueue({});
    pgMock.enqueue({});
    pgMock.enqueue({});

    const res = await handler(event({
      page: 'oz',
      videos: [{ id: 'ssgxvlsdmx', wistiaId: 'ssgxvlsdmx', title: 'Chorus', category: 'all', tags: [] }]
    }));
    expect(res.statusCode).toBe(200);
    const insert = pgMock.calls().find(call => /INSERT INTO videos/.test(call.sql));
    expect(insert.params[9]).toBe('wistia');
    expect(insert.params[11]).toBeNull();
  });
});
