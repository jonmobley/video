const {
  hashPassword,
  passwordsMatch,
  signAccessToken,
  verifyAccessToken,
  authorizeVideoAccess,
  legacyHash
} = require('../../lib/video-password');

describe('lib/video-password', () => {
  test('scrypt hash verifies and is not legacy sha256', () => {
    const hash = hashPassword('secret-pass');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(passwordsMatch('secret-pass', hash)).toBe(true);
    expect(passwordsMatch('wrong', hash)).toBe(false);
    expect(hash).not.toBe(legacyHash('secret-pass'));
  });

  test('legacy sha256 hashes still verify', () => {
    const legacy = legacyHash('old-pass');
    expect(passwordsMatch('old-pass', legacy)).toBe(true);
    expect(passwordsMatch('nope', legacy)).toBe(false);
  });

  test('access tokens bind to video id and expire', () => {
    const secret = 'test-secret-key';
    const token = signAccessToken('vid123.mp4', secret, 60_000);
    expect(verifyAccessToken('vid123.mp4', token, secret)).toBe(true);
    expect(verifyAccessToken('other.mp4', token, secret)).toBe(false);
    expect(authorizeVideoAccess('vid123.mp4', 'scrypt$1$1$1$00$00', { t: token }, secret)).toBe(true);
  });

  test('authorizeVideoAccess accepts legacy ?pt= passwords', () => {
    const hash = hashPassword('abc');
    expect(authorizeVideoAccess('id', hash, { pt: 'abc' }, 'sec')).toBe(true);
    expect(authorizeVideoAccess('id', hash, { pt: 'no' }, 'sec')).toBe(false);
    expect(authorizeVideoAccess('id', null, {}, 'sec')).toBe(true);
  });
});
