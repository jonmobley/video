/**
 * @jest-environment jsdom
 *
 * End-to-end-ish guard for the documented client-side contract:
 *   "0-byte files are rejected client-side before any chunk is sent."
 *
 * We mount the real upload widget into a jsdom DOM, stub fetch, feed it a
 * zero-byte File, click the upload button, and assert that no upload-chunk
 * (or finalize-video) request was ever issued.
 */

describe('upload-widget: empty file rejection', () => {
  let fetchMock;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    fetchMock = jest.fn(async (url) => {
      // Widget pings /api/auth/me on init; respond with an unauthenticated
      // status so authReady resolves false.
      if (String(url).includes('/api/auth/me')) {
        return { ok: false, status: 401, json: async () => ({}) };
      }
      // Anything else (especially upload-chunk / finalize-video) MUST NOT
      // be hit when the user selects a 0-byte file. Failing here surfaces
      // a regression directly.
      throw new Error('Unexpected fetch in empty-file path: ' + url);
    });
    global.fetch = fetchMock;
    // jsdom doesn't ship clipboard; the widget calls navigator.clipboard
    // only on the success path, so a no-op stub is enough as a safety net.
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: jest.fn(async () => {}) }
      });
    }
    // Required by the widget's genId() — provided by jsdom in modern jest,
    // but defensively shim if absent.
    if (!global.crypto || typeof global.crypto.getRandomValues !== 'function') {
      const nodeCrypto = require('crypto');
      global.crypto = { getRandomValues: (arr) => nodeCrypto.randomFillSync(arr) };
    }

    // Load the widget (registers window.initUploadWidget).
    require('../../js/upload-widget.js');
  });

  afterEach(() => {
    delete global.fetch;
    // Wipe the module cache so the IIFE re-runs cleanly for each test.
    jest.resetModules();
  });

  test('zero-byte file: upload button click never triggers /api/upload-chunk', async () => {
    const root = document.getElementById('root');
    window.initUploadWidget(root);

    // Wait a microtask so the init-time /api/auth/me call settles.
    await Promise.resolve();
    await Promise.resolve();

    // Build a real 0-byte File. jsdom's File constructor accepts an array of
    // BlobParts; an empty array yields size === 0.
    const emptyFile = new File([], 'silence.mp4', { type: 'video/mp4' });
    expect(emptyFile.size).toBe(0);

    // Drop the file onto the drop zone — this exercises the same code path
    // as the file input would (setFile → enables upload button).
    const dropZone = root.querySelector('[data-el="dropZone"]');
    const dropEvt = new Event('drop', { bubbles: true, cancelable: true });
    dropEvt.dataTransfer = { files: [emptyFile] };
    dropZone.dispatchEvent(dropEvt);

    // Title is auto-filled by setFile() from the filename.
    const titleInput = root.querySelector('[data-el="titleInput"]');
    expect(titleInput.value.trim().length).toBeGreaterThan(0);

    // Click upload.
    const uploadBtn = root.querySelector('[data-el="uploadBtn"]');
    expect(uploadBtn.disabled).toBe(false);
    uploadBtn.click();

    // Give startUpload a chance to throw and render the error.
    await new Promise(r => setTimeout(r, 10));

    // The user-facing error message should be present.
    const errorMsg = root.querySelector('[data-el="errorMsg"]');
    expect(errorMsg.textContent).toMatch(/empty|0 bytes/i);
    expect(errorMsg.classList.contains('visible')).toBe(true);

    // The critical assertion: NO chunk upload was attempted.
    const uploadChunkCalls = fetchMock.mock.calls.filter(
      ([url]) => String(url).includes('/api/upload-chunk')
    );
    const finalizeCalls = fetchMock.mock.calls.filter(
      ([url]) => String(url).includes('/api/finalize-video')
    );
    expect(uploadChunkCalls).toEqual([]);
    expect(finalizeCalls).toEqual([]);
  });
});
