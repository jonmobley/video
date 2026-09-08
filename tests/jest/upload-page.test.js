/**
 * @jest-environment jsdom
 *
 * Guards the /upload page reveal path: after auth succeeds, nav + main
 * must leave the .hidden class. Clearing only inline style.display left
 * the page blank because common.css sets `.hidden { display: none }`.
 */

function mountUploadDom() {
  document.body.innerHTML = `
    <div class="spinner" id="authSpinner"></div>
    <nav class="nav hidden" id="pageNav">
      <button class="logout-btn" id="logoutBtn">Sign out</button>
    </nav>
    <main class="hidden" id="pageMain">
      <div class="page-title">Upload a video</div>
      <div id="uploadRoot"></div>
    </main>
  `;
}

function loadPage() {
  jest.isolateModules(() => {
    require('../../js/upload-page.js');
  });
}

describe('upload-page: reveal after auth', () => {
  beforeEach(() => {
    jest.resetModules();
    mountUploadDom();
    window.initUploadWidget = jest.fn(() => ({ isUploading: () => false }));
  });

  afterEach(() => {
    delete global.fetch;
    delete window.initUploadWidget;
  });

  test('removes .hidden from nav and main when auth succeeds', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('/api/auth/me')) {
        return { ok: true, status: 200, json: async () => ({ email: 'a@b.c' }) };
      }
      throw new Error('Unexpected fetch: ' + url);
    });

    loadPage();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('authSpinner')).toBeNull();
    expect(document.getElementById('pageNav').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('pageMain').classList.contains('hidden')).toBe(false);
    expect(window.initUploadWidget).toHaveBeenCalledTimes(1);
  });

  test('shows main (without nav) on non-auth failure', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('/api/auth/me')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      throw new Error('Unexpected fetch: ' + url);
    });

    loadPage();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('pageNav').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('pageMain').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('uploadRoot').textContent).toMatch(/Something went wrong/);
    expect(window.initUploadWidget).not.toHaveBeenCalled();
  });
});
