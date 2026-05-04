jest.mock('pg', () => require('./helpers/pg-mock').install());

const request = require('supertest');
const { app } = require('../../server');

function parseCSP(header) {
  const directives = {};
  header.split(';').forEach(part => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const [name, ...values] = trimmed.split(/\s+/);
    directives[name] = values;
  });
  return directives;
}

function cspAllows(sources, url) {
  const parsed = new URL(url);
  const origin = parsed.origin;
  const host = parsed.hostname;
  return sources.some(src => {
    if (src === "'self'") return false;
    if (src === "'unsafe-inline'") return false;
    if (src === "'none'") return false;
    if (src === '*') return true;
    if (src === 'data:' || src === 'blob:') return src === `${parsed.protocol}`;
    if (src.startsWith('https://*.')) {
      const wildcard = src.slice('https://*.'.length);
      return parsed.protocol === 'https:' &&
        (host === wildcard || host.endsWith('.' + wildcard));
    }
    if (src.startsWith('https://')) {
      return origin === src || url.startsWith(src + '/') || url === src;
    }
    return false;
  });
}

let csp;

beforeAll(async () => {
  const res = await request(app).get('/').set('Accept', 'text/html');
  const header = res.headers['content-security-policy'];
  expect(header).toBeDefined();
  csp = parseCSP(header);
});

describe('CSP directives exist', () => {
  const required = [
    'default-src', 'script-src', 'style-src', 'img-src',
    'font-src', 'connect-src', 'frame-src', 'media-src',
    'worker-src', 'frame-ancestors', 'report-uri'
  ];
  test.each(required)('%s directive is present', (directive) => {
    expect(csp[directive]).toBeDefined();
  });
});

describe('YouTube CSP coverage', () => {
  test('frame-src allows youtube-nocookie.com embeds', () => {
    expect(cspAllows(csp['frame-src'], 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe(true);
  });

  test('frame-src allows youtube.com embeds', () => {
    expect(cspAllows(csp['frame-src'], 'https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(true);
  });

  test('script-src allows YouTube IFrame API', () => {
    expect(cspAllows(csp['script-src'], 'https://www.youtube.com/iframe_api')).toBe(true);
  });

  test('script-src allows YouTube player widget script', () => {
    expect(cspAllows(csp['script-src'], 'https://www.youtube.com/s/player/abc123/www-widgetapi.vflset/www-widgetapi.js')).toBe(true);
  });
});

describe('Vimeo CSP coverage', () => {
  test('frame-src allows Vimeo player embeds', () => {
    expect(cspAllows(csp['frame-src'], 'https://player.vimeo.com/video/123456789')).toBe(true);
  });

  test('script-src allows Vimeo Player.js SDK', () => {
    expect(cspAllows(csp['script-src'], 'https://player.vimeo.com/api/player.js')).toBe(true);
  });

  test('connect-src allows Vimeo API calls', () => {
    expect(cspAllows(csp['connect-src'], 'https://vimeo.com/api/oembed.json')).toBe(true);
  });
});

describe('Dailymotion CSP coverage', () => {
  test('frame-src allows Dailymotion embeds', () => {
    expect(cspAllows(csp['frame-src'], 'https://www.dailymotion.com/embed/video/x7tgad0')).toBe(true);
  });

  test('frame-src allows geo.dailymotion.com embeds', () => {
    expect(cspAllows(csp['frame-src'], 'https://geo.dailymotion.com/player.html')).toBe(true);
  });
});

describe('Loom CSP coverage', () => {
  test('frame-src allows Loom embeds', () => {
    expect(cspAllows(csp['frame-src'], 'https://www.loom.com/embed/abc123')).toBe(true);
  });
});

describe('Wistia CSP coverage', () => {
  test('frame-src allows Wistia embeds', () => {
    expect(cspAllows(csp['frame-src'], 'https://fast.wistia.com/embed/iframe/abc123')).toBe(true);
  });

  test('frame-src allows fast.wistia.net embeds', () => {
    expect(cspAllows(csp['frame-src'], 'https://fast.wistia.net/embed/iframe/abc123')).toBe(true);
  });

  test('script-src allows Wistia scripts', () => {
    expect(cspAllows(csp['script-src'], 'https://fast.wistia.com/assets/external/E-v1.js')).toBe(true);
  });

  test('script-src allows Sentry CDN loaded by Wistia', () => {
    expect(cspAllows(csp['script-src'], 'https://browser.sentry-cdn.com/9.6.1/bundle.min.js')).toBe(true);
  });

  test('connect-src allows Wistia API', () => {
    expect(cspAllows(csp['connect-src'], 'https://distillery.wistia.com/x')).toBe(true);
  });

  test('connect-src allows Sentry error reporting', () => {
    expect(cspAllows(csp['connect-src'], 'https://o123.ingest.sentry.io/api/456/envelope')).toBe(true);
  });

  test('media-src allows Wistia media', () => {
    expect(cspAllows(csp['media-src'], 'https://embed-ssl.wistia.com/deliveries/abc.bin')).toBe(true);
  });

  test('media-src allows Akamai CDN delivery', () => {
    expect(cspAllows(csp['media-src'], 'https://embedwistia-a.akamaihd.net/deliveries/abc.bin')).toBe(true);
  });
});

describe('Dropbox CSP coverage', () => {
  test('media-src allows dl.dropboxusercontent.com video streaming', () => {
    expect(cspAllows(csp['media-src'], 'https://dl.dropboxusercontent.com/s/abc123/video.mp4')).toBe(true);
  });

  test('media-src allows www.dropbox.com video streaming', () => {
    expect(cspAllows(csp['media-src'], 'https://www.dropbox.com/scl/fi/abc/video.mp4?raw=1')).toBe(true);
  });

  test('connect-src allows Dropbox URL testing', () => {
    expect(cspAllows(csp['connect-src'], 'https://www.dropbox.com/scl/fi/abc/video.mp4')).toBe(true);
  });

  test('connect-src allows dl.dropboxusercontent.com fetches', () => {
    expect(cspAllows(csp['connect-src'], 'https://dl.dropboxusercontent.com/s/abc123/video.mp4')).toBe(true);
  });
});

describe('server.js and netlify.toml CSP parity', () => {
  let serverCSP;
  let netlifyCSP;

  beforeAll(async () => {
    const res = await request(app).get('/').set('Accept', 'text/html');
    serverCSP = res.headers['content-security-policy'];

    const fs = require('fs');
    const toml = fs.readFileSync('netlify.toml', 'utf8');
    const match = toml.match(/Content-Security-Policy\s*=\s*"([^"]+)"/);
    netlifyCSP = match ? match[1] : '';
  });

  test('both configurations define the same CSP directives', () => {
    const serverDir = parseCSP(serverCSP);
    const netlifyDir = parseCSP(netlifyCSP);

    const serverKeys = Object.keys(serverDir).sort();
    const netlifyKeys = Object.keys(netlifyDir).sort();
    expect(serverKeys).toEqual(netlifyKeys);
  });

  test('script-src sources match between server.js and netlify.toml', () => {
    const serverDir = parseCSP(serverCSP);
    const netlifyDir = parseCSP(netlifyCSP);
    expect(serverDir['script-src'].sort()).toEqual(netlifyDir['script-src'].sort());
  });

  test('connect-src sources match between server.js and netlify.toml', () => {
    const serverDir = parseCSP(serverCSP);
    const netlifyDir = parseCSP(netlifyCSP);
    expect(serverDir['connect-src'].sort()).toEqual(netlifyDir['connect-src'].sort());
  });

  test('frame-src sources match between server.js and netlify.toml', () => {
    const serverDir = parseCSP(serverCSP);
    const netlifyDir = parseCSP(netlifyCSP);
    expect(serverDir['frame-src'].sort()).toEqual(netlifyDir['frame-src'].sort());
  });

  test('media-src sources match between server.js and netlify.toml', () => {
    const serverDir = parseCSP(serverCSP);
    const netlifyDir = parseCSP(netlifyCSP);
    expect(serverDir['media-src'].sort()).toEqual(netlifyDir['media-src'].sort());
  });
});
