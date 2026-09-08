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
});
