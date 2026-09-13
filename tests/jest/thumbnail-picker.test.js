/**
 * @jest-environment jsdom
 */

// Shared thumbnail picker dialog (js/thumbnail-picker.js): open/close, frame
// sources, selection payloads and the save/skip/error paths.

const fs = require('fs');
const path = require('path');

let ThumbnailPicker;

function loadPicker() {
  jest.resetModules();
  document.body.innerHTML = '';
  ThumbnailPicker = require('../../js/thumbnail-picker');
}

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

const FRAME = (i) => ({
  dataUrl: `data:image/jpeg;base64,ZnJhbWUt${i}`,
  base64: `ZnJhbWUt${i}`,
  contentType: 'image/jpeg',
  timeSec: i * 10
});

describe('ThumbnailPicker dialog', () => {
  beforeEach(loadPicker);

  test('injects its own markup once and toggles visibility', async () => {
    expect(document.getElementById('tpOverlay')).toBeNull();
    ThumbnailPicker.open({ source: null, onSave: jest.fn() });
    const overlay = document.getElementById('tpOverlay');
    expect(overlay).not.toBeNull();
    expect(overlay.classList.contains('show')).toBe(true);
    expect(overlay.getAttribute('aria-hidden')).toBe('false');
    expect(ThumbnailPicker.isOpen()).toBe(true);

    ThumbnailPicker.close();
    expect(overlay.classList.contains('show')).toBe(false);
    expect(ThumbnailPicker.isOpen()).toBe(false);

    ThumbnailPicker.open({ source: null, onSave: jest.fn() });
    expect(document.querySelectorAll('#tpOverlay')).toHaveLength(1);
    expect(document.querySelectorAll('.tp-dialog')).toHaveLength(1);
  });

  test('renders image URL candidates and saves a url selection', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const urls = [1, 2, 3].map(n => `https://cdn.example/abc/thumbnail_${n}.jpg`);
    ThumbnailPicker.open({ source: { imageUrls: urls }, onSave });
    await flush();

    const tiles = Array.from(document.querySelectorAll('#tpGrid .tp-frame'));
    expect(tiles).toHaveLength(ThumbnailPicker.TP_FRAME_COUNT);
    expect(tiles.filter(t => !t.classList.contains('empty'))).toHaveLength(3);
    expect(tiles[1].querySelector('img').getAttribute('src')).toBe(urls[1]);

    const save = document.getElementById('tpSave');
    expect(save.disabled).toBe(true);
    tiles[1].click();
    expect(save.disabled).toBe(false);
    expect(tiles[1].classList.contains('selected')).toBe(true);
    expect(tiles[1].getAttribute('aria-selected')).toBe('true');

    save.click();
    await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ kind: 'url', url: urls[1], index: 1 });
    expect(ThumbnailPicker.isOpen()).toBe(false);
  });

  test('accepts pre-extracted frames and saves a frame selection with image bytes', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const frames = Promise.resolve([FRAME(1), FRAME(2), null, FRAME(4)]);
    ThumbnailPicker.open({ source: { frames }, onSave, saveLabel: 'Use this thumbnail' });
    await flush();

    const tiles = Array.from(document.querySelectorAll('#tpGrid .tp-frame'));
    expect(tiles[0].querySelector('.tp-frame-time').textContent).toBe('0:10');
    expect(tiles[2].classList.contains('empty')).toBe(true);
    expect(document.getElementById('tpSave').textContent).toBe('Use this thumbnail');

    tiles[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    document.getElementById('tpSave').click();
    await flush();
    expect(onSave.mock.calls[0][0]).toMatchObject({
      kind: 'frame', index: 3, base64: 'ZnJhbWUt4', contentType: 'image/jpeg', timeSec: 40
    });
  });

  test('renders already-landed partial frames before the batch promise resolves', async () => {
    let resolveFrames;
    const frames = new Promise(resolve => { resolveFrames = resolve; });
    const partial = [FRAME(1), undefined, FRAME(3)];
    ThumbnailPicker.open({ source: { frames, partial }, onSave: jest.fn() });
    await flush();
    let tiles = Array.from(document.querySelectorAll('#tpGrid .tp-frame'));
    expect(tiles[0].querySelector('img')).not.toBeNull();
    expect(tiles[1].classList.contains('loading')).toBe(true);
    expect(tiles[2].querySelector('img')).not.toBeNull();

    resolveFrames([FRAME(1), FRAME(2), FRAME(3), null, null, null]);
    await flush();
    tiles = Array.from(document.querySelectorAll('#tpGrid .tp-frame'));
    expect(tiles[1].querySelector('img')).not.toBeNull();
    expect(tiles[3].classList.contains('empty')).toBe(true);
  });

  test('extractor does not depend solely on requestVideoFrameCallback firing', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../js/thumbnail-picker.js'), 'utf8');
    const start = src.indexOf('function afterPaint');
    const body = src.slice(start, src.indexOf('function seekNext', start));
    expect(body).toMatch(/requestVideoFrameCallback/);
    expect(body).toMatch(/requestAnimationFrame\(\(\) => requestAnimationFrame/);
    expect(body).toMatch(/PAINT_FALLBACK_MS/);
    // The rVFC branch must not return early and skip the fallback.
    expect(body).not.toMatch(/requestVideoFrameCallback\([^)]*\);\s*return;/);
  });

  test('shows the unavailable message when there is no frame source', async () => {
    ThumbnailPicker.open({ source: null, framesUnavailableMessage: 'Still processing', onSave: jest.fn() });
    await flush();
    const tiles = Array.from(document.querySelectorAll('#tpGrid .tp-frame'));
    expect(tiles.every(t => t.classList.contains('empty'))).toBe(true);
    expect(tiles[0].textContent).toBe('Still processing');
  });

  test('skip button is optional and fires onSkip after closing', async () => {
    ThumbnailPicker.open({ source: null, onSave: jest.fn() });
    expect(document.getElementById('tpSkip').hidden).toBe(true);
    ThumbnailPicker.close();

    const onSkip = jest.fn();
    ThumbnailPicker.open({ source: null, skipLabel: 'Keep auto thumbnail', onSkip, onSave: jest.fn() });
    const skip = document.getElementById('tpSkip');
    expect(skip.hidden).toBe(false);
    expect(skip.textContent).toBe('Keep auto thumbnail');
    skip.click();
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(ThumbnailPicker.isOpen()).toBe(false);
  });

  test('a rejected onSave shows the error and keeps the dialog open', async () => {
    const onSave = jest.fn().mockRejectedValue(new Error('That image is over the 500 KB limit'));
    ThumbnailPicker.open({ source: { imageUrls: ['https://cdn.example/a/thumbnail_1.jpg'] }, onSave });
    await flush();
    document.querySelector('#tpGrid .tp-frame').click();
    const save = document.getElementById('tpSave');
    save.click();
    expect(save.disabled).toBe(true);
    expect(save.textContent).toMatch(/Saving/);
    await flush();
    expect(ThumbnailPicker.isOpen()).toBe(true);
    expect(document.getElementById('tpError').textContent).toBe('That image is over the 500 KB limit');
    expect(save.disabled).toBe(false);
    expect(save.textContent).toBe('Save thumbnail');
  });

  test('Escape closes and fires onClose; upload section can be hidden', async () => {
    const onClose = jest.fn();
    ThumbnailPicker.open({ source: null, allowUpload: false, onClose, onSave: jest.fn() });
    expect(document.getElementById('tpUploadRow').hidden).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ThumbnailPicker.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('frame cache is reused per cacheKey and can be invalidated', async () => {
    // jsdom has no media decoding, so seed the cache with pre-extracted frames
    // and confirm a videoUrl source for the same key short-circuits to them
    // (a real extraction would leave every tile in the loading state).
    ThumbnailPicker.open({ source: { frames: Promise.resolve([FRAME(1)]) }, cacheKey: 'v1', onSave: jest.fn() });
    await flush();
    ThumbnailPicker.close();
    ThumbnailPicker.open({ source: { videoUrl: '/api/video/v1' }, cacheKey: 'v1', onSave: jest.fn() });
    await flush();
    expect(document.querySelector('#tpGrid .tp-frame img').getAttribute('src')).toBe(FRAME(1).dataUrl);
    ThumbnailPicker.close();

    ThumbnailPicker.invalidateCache('v1');
    ThumbnailPicker.open({ source: { videoUrl: '/api/video/v1' }, cacheKey: 'v1', onSave: jest.fn() });
    await flush();
    expect(document.querySelector('#tpGrid .tp-frame img')).toBeNull();
    ThumbnailPicker.close();
  });
});

describe('page wiring', () => {
  const read = (rel) => fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');

  test.each(['account.html', 'seussical.html', 'oz.html'])('%s loads the shared picker', (file) => {
    const html = read(file);
    expect(html).toMatch(/\/styles\/thumbnail-picker\.css/);
    expect(html).toMatch(/\/js\/thumbnail-picker\.js/);
    // Markup is injected by the module, not duplicated per page.
    expect(html).not.toMatch(/id="tpOverlay"/);
  });

  test('show pages expose a Change thumbnail control in the edit popup', () => {
    for (const file of ['seussical.html', 'oz.html']) {
      const html = read(file);
      expect(html).toMatch(/id="editThumbnailGroup"/);
      expect(html).toMatch(/id="editVideoThumbnailBtn"/);
    }
    const app = read('js/oz-app.js');
    expect(app).toMatch(/\/api\/bunny-set-thumbnail/);
    expect(app).toMatch(/offerThumbnailPicker\(videoId, file, frameSource\)/);
    expect(app).toMatch(/reassertChosenThumbnail/);
  });

  test('picker script is loaded before the app scripts that use it', () => {
    for (const [file, app] of [['account.html', 'account-app.js'], ['seussical.html', 'oz-app.js'], ['oz.html', 'oz-app.js']]) {
      const html = read(file);
      expect(html.indexOf('/js/thumbnail-picker.js')).toBeLessThan(html.indexOf(`/js/${app}`));
    }
  });
});

describe('show page save invalidates the cached video list', () => {
  const app = fs.readFileSync(path.join(__dirname, '../../js/oz-app.js'), 'utf8');

  test('cache entries are written and cleared under the same cache_ prefix', () => {
    expect(app).toMatch(/localStorage\.setItem\(`cache_\$\{key\}`/);
    expect(app).toMatch(/function clearCachedData\(key\)[\s\S]*?localStorage\.removeItem\(`cache_\$\{key\}`\)/);
    expect(app).toMatch(/clearCachedData\(pageCacheKey\('videos'\)\)/);
    expect(app).toMatch(/clearCachedData\(pageCacheKey\('categories'\)\)/);
    // The old form removed a key that was never written, so saves looked lost on reload.
    expect(app).not.toMatch(/localStorage\.removeItem\(pageCacheKey\('videos'\)\)/);
  });

  test('editors bypass the 5-minute video cache so saves show on reload', () => {
    expect(app).toMatch(/const wantsFresh = hasSavedPageEditorToken\(\)/);
    expect(app).toMatch(/wantsFresh \? null : getCachedData\(pageCacheKey\('videos'\)\)/);
    expect(app).toMatch(/fetch\(pageApiUrl\('get-videos'\), wantsFresh \? \{ cache: 'no-cache' \} : undefined\)/);
  });
});
