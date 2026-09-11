/**
 * @jest-environment jsdom
 *
 * The upload widget must explain failures in plain English, next to the
 * control involved: a missing title is flagged on the title field, a
 * dropped non-video file is explained under the drop zone, and a network
 * failure mid-upload never leaks raw "Failed to fetch" text.
 */

describe('upload-widget: inline, user-friendly errors', () => {
  let fetchMock;
  let handlers;

  function respond(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  }

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    handlers = {};
    fetchMock = jest.fn(async (url) => {
      const key = Object.keys(handlers).find((k) => String(url).includes(k));
      if (key) return handlers[key](url);
      if (String(url).includes('/api/auth/me')) return respond(200, { id: 'u1', is_paid: false });
      if (String(url).includes('/api/upload-config')) return respond(200, { requireAuth: true });
      throw new Error('Unexpected fetch: ' + url);
    });
    global.fetch = fetchMock;
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
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {};
    // jsdom's Blob lacks arrayBuffer(); the widget slices files through it.
    if (typeof Blob.prototype.arrayBuffer !== 'function') {
      Blob.prototype.arrayBuffer = function () {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsArrayBuffer(this);
        });
      };
    }
    require('../../js/upload-widget.js');
  });

  afterEach(() => {
    delete global.fetch;
    jest.resetModules();
  });

  async function settle(n = 6) {
    for (let i = 0; i < n; i++) await Promise.resolve();
  }

  function mount() {
    const root = document.getElementById('root');
    window.initUploadWidget(root);
    return root;
  }

  // The widget fires upload:reset when an upload fails and the form is
  // restored; waiting on it avoids timing assumptions about FileReader.
  function waitForEvent(root, name, ms = 4000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for ' + name)), ms);
      root.addEventListener(name, () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }

  function dropFile(root, file) {
    const dropZone = root.querySelector('[data-el="dropZone"]');
    const evt = new Event('drop', { bubbles: true, cancelable: true });
    evt.dataTransfer = { files: [file] };
    dropZone.dispatchEvent(evt);
  }

  test('non-video drop explains the problem under the drop zone', async () => {
    const root = mount();
    await settle();
    dropFile(root, new File(['abc'], 'notes.pdf', { type: 'application/pdf' }));
    await settle();

    const dropError = root.querySelector('[data-el="dropError"]');
    expect(dropError.classList.contains('visible')).toBe(true);
    expect(dropError.textContent).toMatch(/isn.t a video file/i);
    expect(dropError.textContent).toMatch(/MP4|MOV|WebM/);
    // The generic error banner is not used for this — it lives by the drop zone.
    expect(root.querySelector('[data-el="errorMsg"]').classList.contains('visible')).toBe(false);
  });

  test('missing title is flagged on the title field, not as a page-wide error', async () => {
    const root = mount();
    await settle();
    dropFile(root, new File(['abc'], 'clip.mp4', { type: 'video/mp4' }));
    await settle();

    const titleInput = root.querySelector('[data-el="titleInput"]');
    titleInput.value = '';
    titleInput.dispatchEvent(new Event('input'));

    // The button is only soft-disabled (aria-disabled) so a click can still
    // explain what's missing instead of doing nothing.
    const uploadBtn = root.querySelector('[data-el="uploadBtn"]');
    expect(uploadBtn.getAttribute('aria-disabled')).toBe('true');
    expect(uploadBtn.disabled).toBe(false);
    uploadBtn.click();
    await settle();

    const titleError = root.querySelector('[data-el="titleError"]');
    expect(titleError.classList.contains('visible')).toBe(true);
    expect(titleError.textContent).toMatch(/title/i);
    expect(titleInput.getAttribute('aria-invalid')).toBe('true');
    expect(titleInput.getAttribute('aria-describedby')).toBe(titleError.id);

    // Typing clears the field error.
    titleInput.value = 'My clip';
    titleInput.dispatchEvent(new Event('input'));
    expect(titleError.classList.contains('visible')).toBe(false);
    expect(titleInput.hasAttribute('aria-invalid')).toBe(false);
    expect(uploadBtn.getAttribute('aria-disabled')).toBe('false');

    const uploadCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/upload-chunk'));
    expect(uploadCalls).toEqual([]);
  });

  test('network failure during finalize shows connection advice, not "Failed to fetch"', async () => {
    handlers['/api/upload-chunk'] = () => respond(200, { ok: true });
    handlers['/api/finalize-video'] = () => { throw new TypeError('Failed to fetch'); };

    const root = mount();
    await settle();
    dropFile(root, new File(['abc'], 'clip.mp4', { type: 'video/mp4' }));
    await settle();
    root.querySelector('[data-el="titleInput"]').value = 'My clip';
    const reset = waitForEvent(root, 'upload:reset');
    root.querySelector('[data-el="uploadBtn"]').click();
    await reset;

    const errorMsg = root.querySelector('[data-el="errorMsg"]');
    expect(errorMsg.classList.contains('visible')).toBe(true);
    expect(errorMsg.textContent).not.toMatch(/failed to fetch/i);
    expect(errorMsg.textContent).toMatch(/connection|internet/i);
    // The file stays selected so the user can simply retry.
    expect(root.querySelector('[data-el="uploadBtn"]').classList.contains('visible')).toBe(true);
  });

  test('413 from the server explains the size limit', async () => {
    handlers['/api/upload-chunk'] = () => respond(413, {});

    const root = mount();
    await settle();
    dropFile(root, new File(['abc'], 'clip.mp4', { type: 'video/mp4' }));
    await settle();
    root.querySelector('[data-el="titleInput"]').value = 'My clip';
    const reset = waitForEvent(root, 'upload:reset');
    root.querySelector('[data-el="uploadBtn"]').click();
    await reset;

    const errorMsg = root.querySelector('[data-el="errorMsg"]');
    expect(errorMsg.classList.contains('visible')).toBe(true);
    expect(errorMsg.textContent).toMatch(/too large|1 GB/i);
    expect(errorMsg.textContent).not.toMatch(/chunk \d+ failed/i);
  });
});
