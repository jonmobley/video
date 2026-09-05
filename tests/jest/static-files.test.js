jest.mock('pg', () => require('./helpers/pg-mock').install());

const request = require('supertest');
const { app, isPublicStaticPath } = require('../../server');

describe('isPublicStaticPath', () => {
  test('allows extensionless pretty URLs that map to HTML pages', () => {
    expect(isPublicStaticPath('/vertical')).toBe(true);
    expect(isPublicStaticPath('/seussical')).toBe(true);
    expect(isPublicStaticPath('/dropbox')).toBe(true);
    expect(isPublicStaticPath('/disc')).toBe(true);
    expect(isPublicStaticPath('/oz')).toBe(true);
    expect(isPublicStaticPath('/server')).toBe(false);
    expect(isPublicStaticPath('/package')).toBe(false);
  });

  test('blocks source, config, and secret files', () => {
    expect(isPublicStaticPath('/server.js')).toBe(false);
    expect(isPublicStaticPath('/package.json')).toBe(false);
    expect(isPublicStaticPath('/package-lock.json')).toBe(false);
    expect(isPublicStaticPath('/env.example')).toBe(false);
    expect(isPublicStaticPath('/complete-supabase-schema.sql')).toBe(false);
    expect(isPublicStaticPath('/netlify/functions/save-videos.js')).toBe(false);
    expect(isPublicStaticPath('/lib/page-editor-auth.js')).toBe(false);
    expect(isPublicStaticPath('/tests/jest/static-files.test.js')).toBe(false);
  });

  test('rejects path traversal', () => {
    expect(isPublicStaticPath('/js/../server.js')).toBe(false);
    expect(isPublicStaticPath('/assets/../../.env')).toBe(false);
  });

  test('blocks hosting and worker config files', () => {
    expect(isPublicStaticPath('/Dockerfile')).toBe(false);
    expect(isPublicStaticPath('/compose.yaml')).toBe(false);
    expect(isPublicStaticPath('/wrangler.jsonc')).toBe(false);
    expect(isPublicStaticPath('/workers/origin.js')).toBe(false);
    expect(isPublicStaticPath('/_headers')).toBe(false);
    expect(isPublicStaticPath('/_redirects')).toBe(false);
  });
});

describe('GET static allowlist', () => {
  test('does not serve server.js', async () => {
    const res = await request(app).get('/server.js');
    expect(res.status).toBe(404);
  });

  test('does not serve package.json', async () => {
    const res = await request(app).get('/package.json');
    expect(res.status).toBe(404);
  });

  test('serves public javascript', async () => {
    const res = await request(app).get('/js/sanitize.js');
    expect(res.status).toBe(200);
    expect(res.text).toContain('function escapeHtml');
  });

  test('serves pretty URLs for show pages', async () => {
    const vertical = await request(app).get('/vertical');
    expect(vertical.status).toBe(200);
    expect(vertical.text).toMatch(/<html/i);

    const seussical = await request(app).get('/seussical');
    expect(seussical.status).toBe(200);
    expect(seussical.text).toMatch(/<html/i);
  });

  test('does not invent HTML for source-file stems', async () => {
    const res = await request(app).get('/server');
    expect(res.status).toBe(404);
  });
});
