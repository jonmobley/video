const fs = require('fs');
const path = require('path');

const picker = require('../../js/thumbnail-picker');
const pickerSrc = fs.readFileSync(
  path.join(__dirname, '../../js/thumbnail-picker.js'),
  'utf8'
);
const pickerCss = fs.readFileSync(
  path.join(__dirname, '../../styles/thumbnail-picker.css'),
  'utf8'
);

describe('thumbnail frame seek spread', () => {
  test('frameSeekTimes spreads six interior samples across the duration', () => {
    const times = picker.frameSeekTimes(100, 6);
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
    expect(picker.frameSeekTimes(NaN, 6)).toEqual([]);
    expect(picker.frameSeekTimes(0, 6)).toEqual([]);
    expect(picker.frameSeekTimes(Infinity, 6)).toEqual([]);
  });

  test('extractor waits for real duration and paints before capture', () => {
    expect(pickerSrc).toMatch(/durationchange/);
    expect(pickerSrc).toMatch(/seekingStarted/);
    expect(pickerSrc).toMatch(/requestVideoFrameCallback|requestAnimationFrame/);
    expect(picker.TP_FRAME_COUNT).toBe(6);
  });

  test('frame tiles show a timecode badge', () => {
    expect(pickerSrc).toMatch(/tp-frame-time/);
    expect(pickerCss).toMatch(/\.tp-frame-time\s*\{/);
  });

  test('formatTimecode renders m:ss', () => {
    expect(picker.formatTimecode(0)).toBe('0:00');
    expect(picker.formatTimecode(65.7)).toBe('1:05');
    expect(picker.formatTimecode(-3)).toBe('0:00');
  });
});
