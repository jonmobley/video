const fs = require('fs');
const path = require('path');

const accountSrc = fs.readFileSync(
  path.join(__dirname, '../../js/account-app.js'),
  'utf8'
);
const accountCss = fs.readFileSync(
  path.join(__dirname, '../../styles/account.css'),
  'utf8'
);

function loadFrameSeekTimes() {
  const start = accountSrc.indexOf('function frameSeekTimes');
  expect(start).toBeGreaterThan(-1);
  const end = accountSrc.indexOf('\n    function renderFrameTile', start);
  expect(end).toBeGreaterThan(start);
  // eslint-disable-next-line no-new-func
  return new Function(`${accountSrc.slice(start, end)}; return frameSeekTimes;`)();
}

describe('thumbnail frame seek spread', () => {
  test('frameSeekTimes spreads six interior samples across the duration', () => {
    const frameSeekTimes = loadFrameSeekTimes();
    const times = frameSeekTimes(100, 6);
    expect(times).toHaveLength(6);
    expect(times[0]).toBeCloseTo(100 / 7, 5);
    expect(times[5]).toBeCloseTo(600 / 7, 5);
    // Strictly increasing and away from the endpoints.
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
    expect(times[0]).toBeGreaterThan(0);
    expect(times[5]).toBeLessThan(100);
  });

  test('frameSeekTimes returns empty for unknown duration', () => {
    const frameSeekTimes = loadFrameSeekTimes();
    expect(frameSeekTimes(NaN, 6)).toEqual([]);
    expect(frameSeekTimes(0, 6)).toEqual([]);
    expect(frameSeekTimes(Infinity, 6)).toEqual([]);
  });

  test('extractor waits for real duration and paints before capture', () => {
    expect(accountSrc).toMatch(/durationchange/);
    expect(accountSrc).toMatch(/seekingStarted/);
    expect(accountSrc).toMatch(/requestVideoFrameCallback|requestAnimationFrame/);
    expect(accountSrc).toMatch(/TP_FRAME_COUNT/);
    expect(accountSrc).not.toMatch(/TP_FRAME_RATIOS/);
  });

  test('frame tiles show a timecode badge', () => {
    expect(accountSrc).toMatch(/tp-frame-time/);
    expect(accountCss).toMatch(/\.tp-frame-time\s*\{/);
  });
});
