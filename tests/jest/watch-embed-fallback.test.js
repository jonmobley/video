const fs = require('fs');
const path = require('path');

const watchCss = fs.readFileSync(path.join(__dirname, '../../styles/watch.css'), 'utf8');
const watchHtml = fs.readFileSync(path.join(__dirname, '../../watch.html'), 'utf8');
const commonCss = fs.readFileSync(path.join(__dirname, '../../styles/common.css'), 'utf8');
const watchApp = fs.readFileSync(path.join(__dirname, '../../js/watch-app.js'), 'utf8');
const uploadWidget = fs.readFileSync(path.join(__dirname, '../../js/upload-widget.js'), 'utf8');

describe('watch page embed fallback CSS', () => {
  test('watch.html does not load common.css (so hide rules must live in watch.css)', () => {
    expect(watchHtml).not.toMatch(/common\.css/);
    expect(watchHtml).toMatch(/styles\/watch\.css/);
    expect(commonCss).toMatch(/\.embed-fallback-hidden\s*\{\s*display:\s*none/);
  });

  test('watch.css hides the fallback overlay by default', () => {
    // Regression: previously .embed-fallback { display:flex } painted the
    // "isn't available" overlay over working YouTube embeds because
    // .embed-fallback-hidden only existed in common.css.
    expect(watchCss).toMatch(/\.embed-fallback(?:-hidden)?[\s\S]*?display:\s*none/);
    const fallbackBlock = watchCss.match(/\.embed-fallback\s*\{[^}]+\}/g);
    expect(fallbackBlock).not.toBeNull();
    const visibleDefault = fallbackBlock.find((b) => /display:\s*flex/.test(b) && !/display:\s*none/.test(b));
    expect(visibleDefault).toBeUndefined();
  });

  test('watch.html has no orphan inline app script and no upload chrome', () => {
    expect(watchHtml).not.toMatch(/<script>\s*const root\s*=/);
    expect(watchHtml).toMatch(/src="\/js\/watch-app\.js"/);
    expect(watchHtml).not.toMatch(/upload-modal\.js/);
    expect(watchHtml).not.toMatch(/footerUploadBtn|footer-upload-btn/);
    expect(watchApp).not.toMatch(/gating-note|password and expiration only protect/);
    expect(watchApp).not.toMatch(/footerUploadBtn/);
  });

  test('watch.css styles the YouTube click-to-play facade with duration badge', () => {
    expect(watchCss).toMatch(/\.yt-facade\s*\{/);
    expect(watchCss).toMatch(/\.yt-facade-poster\s*\{/);
    expect(watchCss).toMatch(/\.yt-facade-duration\s*\{/);
    expect(watchCss).not.toMatch(/\.yt-facade-play\s*\{/);
  });

  test('embed-frame keeps 16:9 when height-capped on wide screens', () => {
    // Regression: max-height alone let width stay 100%, so YouTube chrome
    // sat on the pillarbox edges instead of over the video.
    expect(watchCss).toMatch(/\.embed-frame\s*\{[^}]*--embed-max-h:/);
    expect(watchCss).toMatch(/width:\s*min\(\s*100%\s*,\s*calc\(\s*var\(--embed-max-h\)\s*\*\s*16\s*\/\s*9\s*\)\s*\)/);
    expect(watchCss).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
  });
});

describe('YouTube click-to-play facade', () => {
  const platformJs = fs.readFileSync(
    path.join(__dirname, '../../js/video-platform.js'),
    'utf8'
  );

  test('loadYouTubeVideo mounts a facade before the iframe', () => {
    expect(platformJs).toMatch(/className = 'yt-facade'/);
    expect(platformJs).toMatch(/autoplay=1/);
    expect(platformJs).toMatch(/iv_load_policy=3/);
    expect(platformJs).toMatch(/yt-facade-duration/);
    expect(platformJs).toMatch(/formatDurationLabel/);
    expect(platformJs).not.toMatch(/yt-facade-play/);
    const fnStart = platformJs.indexOf('loadYouTubeVideo(video, container, onReady, onError)');
    expect(fnStart).toBeGreaterThan(-1);
    const nextMethod = platformJs.indexOf('\n    loadVimeoVideo(', fnStart + 1);
    const fnBody = platformJs.slice(fnStart, nextMethod > 0 ? nextMethod : fnStart + 8000);
    const facadeAt = fnBody.indexOf("className = 'yt-facade'");
    const embedAt = fnBody.indexOf('youtube-nocookie.com/embed');
    expect(facadeAt).toBeGreaterThan(-1);
    expect(embedAt).toBeGreaterThan(facadeAt);
  });
  test('formatDurationLabel renders m:ss / h:mm:ss and ignores empty values', () => {
    const start = platformJs.indexOf('function formatDurationLabel');
    expect(start).toBeGreaterThan(-1);
    const end = platformJs.indexOf('\n// Export for use in other scripts', start);
    expect(end).toBeGreaterThan(start);
    // eslint-disable-next-line no-new-func
    const fn = new Function(`${platformJs.slice(start, end)}; return formatDurationLabel;`)();
    expect(typeof fn).toBe('function');
    expect(fn(187)).toBe('3:07');
    expect(fn(3661)).toBe('1:01:01');
    expect(fn(null)).toBeNull();
    expect(fn(undefined)).toBeNull();
    expect(fn(0)).toBeNull();
    expect(fn('')).toBeNull();
  });
});

describe('QR code feature removed', () => {
  test('watch and upload UIs no longer reference QR', () => {
    expect(watchApp.toLowerCase()).not.toMatch(/qr/);
    expect(uploadWidget.toLowerCase()).not.toMatch(/qr/);
    expect(watchHtml).not.toMatch(/qrcode-generator/);
    expect(watchCss.toLowerCase()).not.toMatch(/\.qr-/);
  });
});
