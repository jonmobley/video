const {
  isValidVideoId,
  generateVideoId,
  extFromContentType,
  VIDEO_ID_LENGTH
} = require('../../server');

describe('short share video ids', () => {
  test('generateVideoId returns a 6-char lowercase alphanumeric slug', () => {
    const id = generateVideoId();
    expect(id).toHaveLength(VIDEO_ID_LENGTH);
    expect(id).toMatch(/^[a-z0-9]{6}$/);
    expect(id).not.toMatch(/\./);
  });

  test('generateVideoId values vary', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateVideoId()));
    expect(ids.size).toBeGreaterThan(1);
  });

  test('isValidVideoId accepts new short slugs', () => {
    expect(isValidVideoId('a1b2c3')).toBe(true);
    expect(isValidVideoId('zzzzzz')).toBe(true);
  });

  test('isValidVideoId accepts legacy hex+extension ids', () => {
    expect(isValidVideoId('b7fe091ca879e9e3293a76fb.mp4')).toBe(true);
    expect(isValidVideoId('a'.repeat(24))).toBe(true);
  });

  test('isValidVideoId rejects media suffixes alone and too-short ids', () => {
    expect(isValidVideoId('abc')).toBe(false);
    expect(isValidVideoId('.mp4')).toBe(false);
    expect(isValidVideoId('../etc/passwd')).toBe(false);
  });

  test('extFromContentType maps common video MIME types', () => {
    expect(extFromContentType('video/mp4')).toBe('mp4');
    expect(extFromContentType('video/quicktime')).toBe('mov');
    expect(extFromContentType('video/webm')).toBe('webm');
    expect(extFromContentType('link/youtube')).toBe('mp4');
    expect(extFromContentType(undefined)).toBe('mp4');
  });
});
