const fs = require('fs');
const path = require('path');

const watchCss = fs.readFileSync(path.join(__dirname, '../../styles/watch.css'), 'utf8');
const watchHtml = fs.readFileSync(path.join(__dirname, '../../watch.html'), 'utf8');
const commonCss = fs.readFileSync(path.join(__dirname, '../../styles/common.css'), 'utf8');

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
    const fallbackBlock = watchCss.match(/\.embed-fallback\s*\{[^}]+\}/);
    expect(fallbackBlock).not.toBeNull();
    expect(fallbackBlock[0]).not.toMatch(/display:\s*flex/);
  });

  test('watch.html has no orphan unclosed script before upload helpers', () => {
    expect(watchHtml).not.toMatch(/<script>\s*const root\s*=/);
    expect(watchHtml).toMatch(/src="\/js\/watch-app\.js"/);
    expect(watchHtml).toMatch(/src="\/js\/upload-modal\.js"/);
  });

  test('watch.css styles the YouTube click-to-play facade', () => {
    expect(watchCss).toMatch(/\.yt-facade\s*\{/);
    expect(watchCss).toMatch(/\.yt-facade-poster\s*\{/);
    expect(watchCss).toMatch(/\.yt-facade-play\s*\{/);
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
    // Facade must appear before any youtube embed iframe src assignment
    // inside loadYouTubeVideo (thumbnail first, player on click).
    const fnStart = platformJs.indexOf('loadYouTubeVideo(video, container, onReady, onError)');
    expect(fnStart).toBeGreaterThan(-1);
    const nextMethod = platformJs.indexOf('\n    loadVimeoVideo(', fnStart + 1);
    const fnBody = platformJs.slice(fnStart, nextMethod > 0 ? nextMethod : fnStart + 8000);
    const facadeAt = fnBody.indexOf("className = 'yt-facade'");
    const embedAt = fnBody.indexOf('youtube-nocookie.com/embed');
    expect(facadeAt).toBeGreaterThan(-1);
    expect(embedAt).toBeGreaterThan(facadeAt);
  });
});
