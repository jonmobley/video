jest.mock('pg', () => require('./helpers/pg-mock').install());

const request = require('supertest');
const { app, isPublicStaticPath } = require('../../server');

describe('isPublicStaticPath', () => {
  test('allows public UI assets and HTML', () => {
    expect(isPublicStaticPath('/')).toBe(true);
    expect(isPublicStaticPath('/index.html')).toBe(true);
    expect(isPublicStaticPath('/watch.html')).toBe(true);
    expect(isPublicStaticPath('/js/sanitize.js')).toBe(true);
    expect(isPublicStaticPath('/styles/watch.css')).toBe(true);
    expect(isPublicStaticPath('/assets/vidshare-og.png')).toBe(true);
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
});
