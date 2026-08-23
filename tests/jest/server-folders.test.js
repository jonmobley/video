jest.mock('pg', () => require('./helpers/pg-mock').install());
const pgMock = require('./helpers/pg-mock');

const request = require('supertest');
const { app, folderCreateCounts } = require('../../server');

beforeEach(() => {
  pgMock.reset();
  if (folderCreateCounts && folderCreateCounts.clear) folderCreateCounts.clear();
});

describe('POST /api/folders — anonymous create', () => {
  test('TITLE_REQUIRED when title is empty', async () => {
    const res = await request(app).post('/api/folders').send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TITLE_REQUIRED');
  });

  test('TITLE_TOO_LONG when title > 120 chars', async () => {
    const res = await request(app).post('/api/folders').send({ title: 'x'.repeat(121) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TITLE_TOO_LONG');
  });

  test('anonymous user can create a folder (user_id = NULL)', async () => {
    pgMock.enqueue({ rows: [], rowCount: 1 }); // INSERT INTO vs_collections
    const res = await request(app).post('/api/folders').send({ title: 'My anon folder' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('My anon folder');
    expect(typeof res.body.slug).toBe('string');
    expect(res.body.slug).toMatch(/^[a-f0-9]{12}$/);
    // Verify the INSERT used NULL for user_id (anonymous).
    const insertCall = pgMock.calls().find(c => /INSERT INTO vs_collections/i.test(c.sql));
    expect(insertCall).toBeTruthy();
    expect(insertCall.params[1]).toBeNull();
  });
});

describe('Backwards-compat redirects /api/collections* → /api/folders*', () => {
  test('GET /api/collections/:slug → 308 /api/folders/:slug', async () => {
    const res = await request(app).get('/api/collections/abcdef012345').redirects(0);
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('/api/folders/abcdef012345');
  });

  test('POST /api/collections → 308 /api/folders (preserves method)', async () => {
    const res = await request(app).post('/api/collections').send({ title: 'x' }).redirects(0);
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('/api/folders');
  });

  test('GET /c/:slug → 308 /f/:slug (page route)', async () => {
    const res = await request(app).get('/c/ABCDEF012345').redirects(0);
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('/f/abcdef012345');
  });

  test('GET /api/folders/:slug accepts uppercase slugs', async () => {
    pgMock.enqueue({
      rows: [{ slug: 'abcdef012345', user_id: null, title: 'Mixed Case Folder', created_at: null }]
    });
    pgMock.enqueue({ rows: [] });

    const res = await request(app).get('/api/folders/ABCDEF012345');
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('abcdef012345');
  });

  test('GET /api/my-collections → 308 /api/my-folders', async () => {
    const res = await request(app).get('/api/my-collections').redirects(0);
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('/api/my-folders');
  });
});

describe('DELETE /api/folders/:slug — anonymous empty-folder cleanup', () => {
  test('lets anyone delete an anonymous folder when it has no videos', async () => {
    pgMock.enqueue({ rows: [{ user_id: null }], rowCount: 1 }); // SELECT user_id
    pgMock.enqueue({ rows: [{ n: 0 }], rowCount: 1 });          // SELECT COUNT
    pgMock.enqueue({ rows: [], rowCount: 1 });                  // DELETE
    const res = await request(app).delete('/api/folders/abcdef012345');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('rejects deleting an anonymous folder that still has videos', async () => {
    pgMock.enqueue({ rows: [{ user_id: null }], rowCount: 1 }); // SELECT user_id
    pgMock.enqueue({ rows: [{ n: 2 }], rowCount: 1 });          // SELECT COUNT
    const res = await request(app).delete('/api/folders/abcdef012345');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('DELETE /api/upload-chunks/:videoId — cancel cleanup', () => {
  test('refuses to wipe chunks for a finalized video', async () => {
    pgMock.enqueue({ rows: [{ '?column?': 1 }], rowCount: 1 }); // SELECT 1 — exists
    const res = await request(app).delete('/api/upload-chunks/abcdef012345.mp4');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('cleans up orphaned chunks when no upload row exists', async () => {
    pgMock.enqueue({ rows: [], rowCount: 0 }); // SELECT 1 — none
    pgMock.enqueue({ rows: [], rowCount: 3 }); // DELETE FROM vs_upload_chunks
    const res = await request(app).delete('/api/upload-chunks/abcdef012345.mp4');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
