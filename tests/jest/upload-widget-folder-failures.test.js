/**
 * @jest-environment jsdom
 *
 * End-to-end-ish coverage for the partial-failure UX in folder mode:
 *   - 3 files queued, one fails its first chunk: summary shows
 *     "2 of 3 succeeded", retry button visible, folder NOT auto-deleted.
 *   - All 3 files fail: empty folder is auto-deleted via
 *     DELETE /api/folders/:slug.
 *
 * The widget is mounted in jsdom, files are dropped onto the drop zone,
 * and global.fetch is stubbed per-route. Failing chunks return HTTP 400
 * so retryChunk() bails immediately (no retry on 4xx) — keeps the test
 * fast and deterministic.
 */

describe('upload-widget: folder upload partial-failure UX', () => {
  let fetchMock;
  let chunkCallCount;
  let failChunkOnCalls;     // Set<number> of chunk-call ordinals to fail
  let deleteFolderCalls;
  let attachCalls;
  const SLUG = 'abcdef012345';

  function installFetchMock() {
    chunkCallCount = 0;
    deleteFolderCalls = [];
    attachCalls = [];
    fetchMock = jest.fn(async (url, opts = {}) => {
      const u = String(url);
      const method = (opts && opts.method) || 'GET';

      if (u.includes('/api/auth/me')) {
        return { ok: false, status: 401, json: async () => ({}) };
      }

      // Anonymous uploads must be enabled for this test, otherwise the
      // widget short-circuits with "Please sign in to upload."
      if (u.includes('/api/upload-config')) {
        return { ok: true, status: 200, json: async () => ({ requireAuth: false }) };
      }

      if (u === '/api/folders' && method === 'POST') {
        return {
          ok: true, status: 200,
          json: async () => ({ slug: SLUG, title: 'test folder' })
        };
      }

      if (u.includes('/api/upload-chunk')) {
        chunkCallCount++;
        if (failChunkOnCalls.has(chunkCallCount)) {
          return {
            ok: false, status: 400,
            json: async () => ({ error: { code: 'BOOM', message: 'simulated chunk failure' } })
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }

      if (u.includes('/api/finalize-video')) {
        return { ok: true, status: 200, json: async () => ({}) };
      }

      const attachMatch = u.match(/\/api\/folders\/([^/]+)\/videos$/);
      if (attachMatch && method === 'POST') {
        attachCalls.push(attachMatch[1]);
        return { ok: true, status: 200, json: async () => ({}) };
      }

      const folderMatch = u.match(/\/api\/folders\/([^/?]+)$/);
      if (folderMatch && method === 'DELETE') {
        deleteFolderCalls.push(folderMatch[1]);
        return { ok: true, status: 200, json: async () => ({}) };
      }

      if (u.match(/\/api\/upload-chunks\//) && method === 'DELETE') {
        return { ok: true, status: 200, json: async () => ({}) };
      }

      throw new Error('Unexpected fetch in folder-failure test: ' + method + ' ' + u);
    });
    global.fetch = fetchMock;
  }

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    failChunkOnCalls = new Set();
    installFetchMock();

    if (!navigator.clipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: jest.fn(async () => {}) }
      });
    }
    if (!global.crypto || typeof global.crypto.getRandomValues !== 'function') {
      const nodeCrypto = require('crypto');
      global.crypto = { getRandomValues: (arr) => nodeCrypto.randomFillSync(arr) };
    }

    // jsdom (as bundled with jest 29) does not implement Blob.prototype
    // .arrayBuffer, but the upload widget calls it on every chunk slice.
    // Polyfill via FileReader, which jsdom does ship.
    if (typeof Blob.prototype.arrayBuffer !== 'function') {
      Blob.prototype.arrayBuffer = function () {
        return new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = () => reject(fr.error);
          fr.readAsArrayBuffer(this);
        });
      };
    }

    require('../../js/upload-widget.js');
  });

  afterEach(() => {
    delete global.fetch;
    jest.resetModules();
  });

  function dropFiles(root, files) {
    const dropZone = root.querySelector('[data-el="dropZone"]');
    const dropEvt = new Event('drop', { bubbles: true, cancelable: true });
    dropEvt.dataTransfer = { files };
    dropZone.dispatchEvent(dropEvt);
  }

  function makeFile(name) {
    // Tiny non-empty payload — well under the 3 MB chunk size, so each file
    // produces exactly one /api/upload-chunk call. That makes the
    // chunk-ordinal -> file mapping trivial in the mock.
    return new File(['x'], name, { type: 'video/mp4' });
  }

  async function runWidgetAndAwaitOutcome(root, eventName) {
    const outcome = new Promise(resolve => {
      root.addEventListener(eventName, e => resolve(e.detail || {}));
    });
    const uploadBtn = root.querySelector('[data-el="uploadBtn"]');
    expect(uploadBtn.disabled).toBe(false);
    uploadBtn.click();
    return outcome;
  }

  test('one failure of three: summary shows 2 succeeded + 1 failed, retry visible, folder NOT deleted', async () => {
    const root = document.getElementById('root');
    window.initUploadWidget(root);
    await Promise.resolve(); await Promise.resolve();

    // Fail the second file's only chunk (call #2). Files upload sequentially.
    failChunkOnCalls = new Set([2]);

    dropFiles(root, [makeFile('one.mp4'), makeFile('two.mp4'), makeFile('three.mp4')]);

    const titleInput = root.querySelector('[data-el="titleInput"]');
    expect(titleInput.value.trim().length).toBeGreaterThan(0);

    const detail = await runWidgetAndAwaitOutcome(root, 'upload:partial');

    expect(detail.succeeded).toBe(2);
    expect(detail.failed).toBe(1);
    expect(detail.cancelled).toBe(0);
    expect(detail.slug).toBe(SLUG);

    // Folder MUST NOT be auto-deleted when at least one video succeeded.
    expect(deleteFolderCalls).toEqual([]);

    // Two attaches succeeded (one per successful file).
    expect(attachCalls).toEqual([SLUG, SLUG]);

    const summary = root.querySelector('[data-el="batchSummary"]');
    expect(summary.hidden).toBe(false);
    const heading = summary.querySelector('.batch-summary-heading');
    expect(heading.textContent).toMatch(/Uploaded 2 of 3/);
    const detailEl = summary.querySelector('.batch-summary-detail');
    expect(detailEl.textContent).toMatch(/1 failed/);

    const buttons = Array.from(summary.querySelectorAll('button'));
    const retryBtn = buttons.find(b => /Retry/i.test(b.textContent));
    const openBtn  = buttons.find(b => /Open folder/i.test(b.textContent));
    const startOverBtn = buttons.find(b => /Start over/i.test(b.textContent));
    expect(retryBtn).toBeTruthy();
    expect(openBtn).toBeTruthy();
    expect(startOverBtn).toBeTruthy();
  });

  test('all three failures: empty folder is auto-deleted via DELETE /api/folders/:slug', async () => {
    const root = document.getElementById('root');
    window.initUploadWidget(root);
    await Promise.resolve(); await Promise.resolve();

    // Fail every file's chunk.
    failChunkOnCalls = new Set([1, 2, 3]);

    dropFiles(root, [makeFile('one.mp4'), makeFile('two.mp4'), makeFile('three.mp4')]);

    const detail = await runWidgetAndAwaitOutcome(root, 'upload:partial');

    expect(detail.succeeded).toBe(0);
    expect(detail.failed).toBe(3);
    expect(detail.slug).toBeNull();

    // Empty folder gets cleaned up — exactly one DELETE for the slug.
    expect(deleteFolderCalls).toEqual([SLUG]);
    expect(attachCalls).toEqual([]);

    const summary = root.querySelector('[data-el="batchSummary"]');
    expect(summary.hidden).toBe(false);
    const heading = summary.querySelector('.batch-summary-heading');
    expect(heading.textContent).toMatch(/Upload failed.*0 of 3/);

    const buttons = Array.from(summary.querySelectorAll('button'));
    const retryBtn = buttons.find(b => /Retry/i.test(b.textContent));
    const openBtn  = buttons.find(b => /Open folder/i.test(b.textContent));
    expect(retryBtn).toBeTruthy();
    // No "Open folder" button when nothing succeeded — the folder is gone.
    expect(openBtn).toBeFalsy();
  });
});
