const { test, expect } = require('@playwright/test');

const EMBED_URLS = {
  youtube: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  vimeo: 'https://player.vimeo.com/video/76979871',
  dailymotion: 'https://www.dailymotion.com/embed/video/x7tgad0',
  loom: 'https://www.loom.com/embed/abc123def456abc789def012abc345de',
  wistia: 'https://fast.wistia.net/embed/iframe/abc123',
};

const SCRIPT_URLS = {
  youtube: 'https://www.youtube.com/iframe_api',
  vimeo: 'https://player.vimeo.com/api/player.js',
  wistia: 'https://fast.wistia.com/assets/external/E-v1.js',
  sentry: 'https://browser.sentry-cdn.com/9.6.1/bundle.min.js',
};

const CSP_PATTERNS = [
  /Refused to load the script/,
  /Refused to frame/,
  /Refused to connect/,
  /Refused to load media/,
  /Refused to load the font/,
  /Refused to load the stylesheet/,
  /violates the following Content Security Policy directive/,
];

function collectCSPViolations(page) {
  const violations = [];
  page.on('console', msg => {
    const text = msg.text();
    if (CSP_PATTERNS.some(p => p.test(text))) {
      violations.push(text);
    }
  });
  page.on('pageerror', err => {
    if (err.message && CSP_PATTERNS.some(p => p.test(err.message))) {
      violations.push(err.message);
    }
  });
  return violations;
}

test.describe('CSP allows video platform embeds on real pages', () => {

  test('homepage loads without CSP violations', async ({ page }) => {
    const violations = collectCSPViolations(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(violations).toEqual([]);
  });

  test('watch page loads without CSP violations', async ({ page }) => {
    const violations = collectCSPViolations(page);
    const response = await page.goto('/watch');
    await page.waitForLoadState('networkidle');
    const csp = response.headers()['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain('https://www.youtube.com');
    expect(csp).toContain('https://player.vimeo.com');
    expect(csp).toContain('https://browser.sentry-cdn.com');
    expect(csp).toContain('dropboxusercontent.com');
    expect(csp).toContain('sentry.io');
    expect(violations).toEqual([]);
  });

  test('test.html loads without CSP violations', async ({ page }) => {
    const violations = collectCSPViolations(page);
    await page.goto('/test.html');
    await page.waitForLoadState('networkidle');
    expect(violations).toEqual([]);
  });

  test('vertical.html loads without CSP violations', async ({ page }) => {
    const violations = collectCSPViolations(page);
    await page.goto('/vertical.html');
    await page.waitForLoadState('networkidle');
    expect(violations).toEqual([]);
  });

  test('dropbox.html loads without CSP violations', async ({ page }) => {
    const violations = collectCSPViolations(page);
    await page.goto('/dropbox.html');
    await page.waitForLoadState('networkidle');
    expect(violations).toEqual([]);
  });
});

test.describe('CSP frame-src allows each platform iframe', () => {

  for (const [platform, url] of Object.entries(EMBED_URLS)) {
    test(`${platform} iframe embed is not blocked by CSP`, async ({ page }) => {
      const violations = collectCSPViolations(page);
      await page.goto('/watch');
      await page.waitForLoadState('domcontentloaded');

      await page.evaluate((src) => {
        const iframe = document.createElement('iframe');
        iframe.src = src;
        iframe.width = '320';
        iframe.height = '180';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
      }, url);

      await page.locator('iframe').first().waitFor({ state: 'attached' });
      await page.waitForLoadState('networkidle');

      const cspFrameViolations = violations.filter(v =>
        v.includes('frame-src') || v.includes('Refused to frame')
      );
      expect(cspFrameViolations).toEqual([]);
    });
  }
});

test.describe('CSP script-src allows platform SDK scripts', () => {

  for (const [platform, url] of Object.entries(SCRIPT_URLS)) {
    test(`${platform} script is not blocked by CSP`, async ({ page }) => {
      const violations = collectCSPViolations(page);
      await page.goto('/watch');
      await page.waitForLoadState('domcontentloaded');

      const result = await page.evaluate((src) => {
        return new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = src;
          script.onload = () => resolve('loaded');
          script.onerror = () => resolve('error');
          document.head.appendChild(script);
        });
      }, url);

      expect(['loaded', 'error']).toContain(result);

      const cspScriptViolations = violations.filter(v =>
        v.includes('script-src') || v.includes('Refused to load the script')
      );
      expect(cspScriptViolations).toEqual([]);
    });
  }
});

test.describe('CSP connect-src allows platform API calls', () => {

  test('Dropbox URL HEAD request is not blocked by CSP', async ({ page }) => {
    const violations = collectCSPViolations(page);
    await page.goto('/watch');
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(async () => {
      try {
        await fetch('https://www.dropbox.com/s/test/video.mp4', {
          method: 'HEAD',
          mode: 'cors',
        });
      } catch (e) {
      }
    });

    const cspConnectViolations = violations.filter(v =>
      v.includes('connect-src') || v.includes('Refused to connect')
    );
    expect(cspConnectViolations).toEqual([]);
  });

  test('Dropbox CDN fetch is not blocked by CSP', async ({ page }) => {
    const violations = collectCSPViolations(page);
    await page.goto('/watch');
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(async () => {
      try {
        await fetch('https://dl.dropboxusercontent.com/s/test/video.mp4', {
          method: 'HEAD',
          mode: 'cors',
        });
      } catch (e) {
      }
    });

    const cspConnectViolations = violations.filter(v =>
      v.includes('connect-src') || v.includes('Refused to connect')
    );
    expect(cspConnectViolations).toEqual([]);
  });

  test('Vimeo API call is not blocked by CSP', async ({ page }) => {
    const violations = collectCSPViolations(page);
    await page.goto('/watch');
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(async () => {
      try {
        await fetch('https://vimeo.com/api/oembed.json?url=test', {
          mode: 'cors',
        });
      } catch (e) {
      }
    });

    const cspConnectViolations = violations.filter(v =>
      v.includes('connect-src') || v.includes('Refused to connect')
    );
    expect(cspConnectViolations).toEqual([]);
  });

  test('Sentry error reporting is not blocked by CSP', async ({ page }) => {
    const violations = collectCSPViolations(page);
    await page.goto('/watch');
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(async () => {
      try {
        await fetch('https://o123.ingest.sentry.io/api/456/envelope', {
          method: 'POST',
          mode: 'cors',
          body: '{}',
        });
      } catch (e) {
      }
    });

    const cspConnectViolations = violations.filter(v =>
      v.includes('connect-src') || v.includes('Refused to connect')
    );
    expect(cspConnectViolations).toEqual([]);
  });
});

test.describe('CSP media-src allows Dropbox video elements', () => {

  test('Dropbox HTML5 video source is not blocked by CSP', async ({ page }) => {
    const violations = collectCSPViolations(page);
    await page.goto('/watch');
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(() => {
      return new Promise((resolve) => {
        const video = document.createElement('video');
        const source = document.createElement('source');
        source.src = 'https://dl.dropboxusercontent.com/s/test/video.mp4';
        source.type = 'video/mp4';
        video.appendChild(source);
        video.style.width = '320px';
        video.style.height = '180px';
        video.addEventListener('error', () => resolve('error'), { once: true });
        video.addEventListener('loadeddata', () => resolve('loaded'), { once: true });
        document.body.appendChild(video);
        video.load();
        setTimeout(() => resolve('timeout'), 5000);
      });
    });

    const cspMediaViolations = violations.filter(v =>
      v.includes('media-src') || v.includes('Refused to load media')
    );
    expect(cspMediaViolations).toEqual([]);
  });

  test('Dropbox www video source is not blocked by CSP', async ({ page }) => {
    const violations = collectCSPViolations(page);
    await page.goto('/watch');
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(() => {
      return new Promise((resolve) => {
        const video = document.createElement('video');
        const source = document.createElement('source');
        source.src = 'https://www.dropbox.com/scl/fi/test/video.mp4?raw=1';
        source.type = 'video/mp4';
        video.appendChild(source);
        video.style.width = '320px';
        video.style.height = '180px';
        video.addEventListener('error', () => resolve('error'), { once: true });
        video.addEventListener('loadeddata', () => resolve('loaded'), { once: true });
        document.body.appendChild(video);
        video.load();
        setTimeout(() => resolve('timeout'), 5000);
      });
    });

    const cspMediaViolations = violations.filter(v =>
      v.includes('media-src') || v.includes('Refused to load media')
    );
    expect(cspMediaViolations).toEqual([]);
  });
});
