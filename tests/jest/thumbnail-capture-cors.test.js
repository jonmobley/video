const fs = require('fs');
const path = require('path');

const captureSrc = fs.readFileSync(
  path.join(__dirname, '../../js/thumbnail-capture.js'),
  'utf8'
);
const accountSrc = fs.readFileSync(
  path.join(__dirname, '../../js/account-app.js'),
  'utf8'
);

function loadNeedsCrossOrigin() {
  const start = captureSrc.indexOf('function needsCrossOrigin');
  expect(start).toBeGreaterThan(-1);
  const end = captureSrc.indexOf('function captureVideoThumbnail', start);
  expect(end).toBeGreaterThan(start);
  // eslint-disable-next-line no-new-func
  return new Function(`${captureSrc.slice(start, end)}; return needsCrossOrigin;`)();
}

describe('thumbnail capture CORS handling', () => {
  test('needsCrossOrigin is true only for other-origin http(s) URLs', () => {
    const needsCrossOrigin = loadNeedsCrossOrigin();
    const orig = global.location;
    global.location = { origin: 'https://vidshare.link', href: 'https://vidshare.link/account' };
    try {
      expect(needsCrossOrigin('/api/video/abc')).toBe(false);
      expect(needsCrossOrigin('blob:https://vidshare.link/x')).toBe(false);
      expect(needsCrossOrigin('data:video/mp4;base64,aaa')).toBe(false);
      expect(needsCrossOrigin('https://vidshare.link/api/video/abc')).toBe(false);
      expect(needsCrossOrigin('https://dl.dropboxusercontent.com/s/x/v.mp4')).toBe(true);
      expect(needsCrossOrigin('')).toBe(false);
      expect(needsCrossOrigin(null)).toBe(false);
    } finally {
      global.location = orig;
    }
  });

  test('capture helper only sets crossOrigin after a needsCrossOrigin check', () => {
    expect(captureSrc).toMatch(/if \(needsCrossOrigin\(source\)\) video\.crossOrigin = 'anonymous'/);
    // Must not unconditionally set crossOrigin on the element anymore.
    expect(captureSrc).not.toMatch(/video\.crossOrigin = 'anonymous';\s*\n\s*video\.style/);
  });

  test('account thumbnail picker does not set crossOrigin on same-origin video', () => {
    const start = accountSrc.indexOf('function extractCandidateFrames');
    expect(start).toBeGreaterThan(-1);
    const end = accountSrc.indexOf('\n    async function openThumbnailDialog', start);
    const body = accountSrc.slice(start, end > start ? end : start + 4000);
    expect(body).not.toMatch(/video\.crossOrigin\s*=/);
    expect(body).toMatch(/Leave crossOrigin unset for same-origin/);
  });
});
