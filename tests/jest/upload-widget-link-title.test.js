/**
 * @jest-environment jsdom
 *
 * Pasting a recognized video link should auto-fill the title field from
 * /api/link-title when the title is empty (mirrors filename → title for files).
 */

describe('upload-widget: link title autofill', () => {
  let fetchMock;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    document.body.innerHTML = '<div id="root"></div>';
    fetchMock = jest.fn(async (url) => {
      const u = String(url);
      if (u.includes('/api/auth/me')) {
        return { ok: false, status: 401, json: async () => ({}) };
      }
      if (u.includes('/api/upload-config')) {
        return { ok: true, json: async () => ({ requireAuth: false }) };
      }
      if (u.includes('/api/link-title')) {
        return {
          ok: true,
          json: async () => ({
            title: 'Rick Astley - Never Gonna Give You Up',
            platform: 'youtube',
            videoId: 'dQw4w9WgXcQ'
          })
        };
      }
      throw new Error('Unexpected fetch: ' + u);
    });
    global.fetch = fetchMock;
    if (!global.crypto || typeof global.crypto.getRandomValues !== 'function') {
      const nodeCrypto = require('crypto');
      global.crypto = { getRandomValues: (arr) => nodeCrypto.randomFillSync(arr) };
    }
    require('../../js/link-parser.js');
    require('../../js/upload-widget.js');
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.fetch;
    jest.resetModules();
  });

  async function mountLinkMode() {
    const root = document.getElementById('root');
    window.initUploadWidget(root);
    await Promise.resolve();
    await Promise.resolve();
    root.querySelector('[data-el="tabLink"]').click();
    return root;
  }

  test('pasting a YouTube link fills an empty title from /api/link-title', async () => {
    const root = await mountLinkMode();
    const linkInput = root.querySelector('[data-el="linkInput"]');
    const titleInput = root.querySelector('[data-el="titleInput"]');

    linkInput.value = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    linkInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(titleInput.value).toBe('');
    await jest.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    await Promise.resolve();

    expect(titleInput.value).toBe('Rick Astley - Never Gonna Give You Up');
    const linkTitleCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/link-title'));
    expect(linkTitleCalls).toHaveLength(1);
    expect(String(linkTitleCalls[0][0])).toContain(encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
  });

  test('does not overwrite a title the user already typed', async () => {
    const root = await mountLinkMode();
    const linkInput = root.querySelector('[data-el="linkInput"]');
    const titleInput = root.querySelector('[data-el="titleInput"]');

    titleInput.value = 'My custom title';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));

    linkInput.value = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    linkInput.dispatchEvent(new Event('input', { bubbles: true }));
    await jest.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    await Promise.resolve();

    expect(titleInput.value).toBe('My custom title');
    const linkTitleCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/link-title'));
    expect(linkTitleCalls).toHaveLength(0);
  });

  test('replaces a previous auto-filled title when the URL changes', async () => {
    fetchMock.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('/api/auth/me')) {
        return { ok: false, status: 401, json: async () => ({}) };
      }
      if (u.includes('/api/upload-config')) {
        return { ok: true, json: async () => ({ requireAuth: false }) };
      }
      if (u.includes('/api/link-title') && u.includes('dQw4w9WgXcQ')) {
        return { ok: true, json: async () => ({ title: 'First Title', platform: 'youtube', videoId: 'dQw4w9WgXcQ' }) };
      }
      if (u.includes('/api/link-title') && u.includes('oHg5SJYRHA0')) {
        return { ok: true, json: async () => ({ title: 'Second Title', platform: 'youtube', videoId: 'oHg5SJYRHA0' }) };
      }
      throw new Error('Unexpected fetch: ' + u);
    });

    const root = await mountLinkMode();
    const linkInput = root.querySelector('[data-el="linkInput"]');
    const titleInput = root.querySelector('[data-el="titleInput"]');

    linkInput.value = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    linkInput.dispatchEvent(new Event('input', { bubbles: true }));
    await jest.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    await Promise.resolve();
    expect(titleInput.value).toBe('First Title');

    linkInput.value = 'https://www.youtube.com/watch?v=oHg5SJYRHA0';
    linkInput.dispatchEvent(new Event('input', { bubbles: true }));
    await jest.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    await Promise.resolve();
    expect(titleInput.value).toBe('Second Title');
  });
});
